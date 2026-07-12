import { injectable } from '@theia/core/shared/inversify';
import {
    ElectronMainApplication,
    ElectronMainApplicationContribution
} from '@theia/core/lib/electron-main/electron-main-application';
import { app, ipcMain, shell, webContents } from '@theia/core/electron-shared/electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import {
    CLIPBOARD_HISTORY_ITEM_EVENT,
    CLIPBOARD_OPEN_PATH,
    CLIPBOARD_REQUEST_SYNC,
    CLIPBOARD_WATCHER_STATUS_EVENT,
    ClipboardEntry,
    ClipboardSyncPayload,
    ClipboardWatcherStatus
} from '../common/clipboard-api';

const WATCHER_EXE = 'ClipboardHistoryWatcher.exe';
/** Cap buffered history so a long-running session doesn't grow unbounded. */
const ENTRY_BUFFER_LIMIT = 200;

@injectable()
export class ClipboardElectronMain implements ElectronMainApplicationContribution {

    protected proc: ChildProcess | undefined;

    /** Last watcher status (replayed when a late renderer calls requestSync). */
    protected lastStatus: ClipboardWatcherStatus = 'error';
    protected lastStatusMessage: string | undefined =
        'Clipboard history watcher has not started yet.';

    /**
     * Entries already emitted by the native watcher. Critical: the watcher starts in
     * electron-main *before* any BrowserWindow exists, so the first dump of Win+V history
     * is often sent into the void. We buffer it and re-send on requestSync / new windows.
     */
    protected entryBuffer: ClipboardEntry[] = [];
    protected readonly entryIds = new Set<string>();

    async onStart(_application: ElectronMainApplication): Promise<void> {
        ipcMain.handle(CLIPBOARD_OPEN_PATH, (_event, filePath: string) => shell.openPath(filePath));
        ipcMain.handle(CLIPBOARD_REQUEST_SYNC, (): ClipboardSyncPayload => this.buildSyncPayload());

        // Late windows (or reloads) should get the current buffer without waiting for a
        // renderer-side requestSync.
        app.on('web-contents-created', (_event, contents) => {
            contents.on('did-finish-load', () => {
                this.flushToContents(contents);
            });
        });

        if (os.platform() !== 'win32') {
            this.setStatus('disabled', 'Windows Clipboard History is only available on Windows.');
            return;
        }
        try {
            await this.startWatcher();
        } catch (err) {
            this.setStatus('error', err instanceof Error ? err.message : String(err));
        }
    }

    /**
     * All extensions' electron-main contributions are webpack-bundled into a single
     * `applications/desktop/lib/backend/electron-main.js` — `__dirname` is the bundle dir,
     * not this extension. Resolve the native watcher from several known layouts instead.
     */
    protected resolveWatcherPath(): string {
        const candidates: string[] = [];

        if (app.isPackaged) {
            // electron-builder.yml: extraResources from clipboard/resources → resources/app/
            candidates.push(path.join(process.resourcesPath, 'app', WATCHER_EXE));
            candidates.push(path.join(process.resourcesPath, WATCHER_EXE));
        }

        let appPath = '';
        try {
            appPath = app.getAppPath();
        } catch {
            appPath = '';
        }

        // Dev: yarn desktop:start → app.getAppPath() is typically applications/desktop
        if (appPath) {
            candidates.push(
                path.join(appPath, '..', '..', 'connectome-extensions', 'clipboard', 'resources', WATCHER_EXE)
            );
            // Walk up from appPath looking for the monorepo resources folder
            let dir = appPath;
            for (let i = 0; i < 8; i++) {
                candidates.push(
                    path.join(dir, 'connectome-extensions', 'clipboard', 'resources', WATCHER_EXE)
                );
                const parent = path.dirname(dir);
                if (parent === dir) {
                    break;
                }
                dir = parent;
            }
        }

        // Walk up from process.cwd() (yarn --cwd applications/desktop start vs repo root)
        let cwd = process.cwd();
        for (let i = 0; i < 8; i++) {
            candidates.push(
                path.join(cwd, 'connectome-extensions', 'clipboard', 'resources', WATCHER_EXE)
            );
            const parent = path.dirname(cwd);
            if (parent === cwd) {
                break;
            }
            cwd = parent;
        }

        // Deduplicate while preserving order
        const seen = new Set<string>();
        for (const candidate of candidates) {
            const resolved = path.resolve(candidate);
            if (seen.has(resolved)) {
                continue;
            }
            seen.add(resolved);
            if (fs.existsSync(resolved)) {
                console.log(`[connectome-clipboard] watcher found: ${resolved}`);
                return resolved;
            }
        }

        const fallback = path.resolve(candidates[0] || WATCHER_EXE);
        console.error(
            `[connectome-clipboard] watcher not found. Tried ${seen.size} path(s). ` +
            `appPath=${appPath} cwd=${process.cwd()} packaged=${app.isPackaged}`
        );
        return fallback;
    }

    protected async startWatcher(): Promise<void> {
        const exePath = this.resolveWatcherPath();
        if (!fs.existsSync(exePath)) {
            this.setStatus(
                'error',
                `Clipboard history watcher not found at ${exePath}. ` +
                `Rebuild the native helper (connectome-extensions/clipboard/native) ` +
                `and ensure resources/ contains ${WATCHER_EXE}.`
            );
            return;
        }

        console.log(`[connectome-clipboard] spawning: ${exePath}`);
        const proc = spawn(exePath, [], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            // Run with the exe's directory as cwd so sibling .dll / runtimeconfig resolve.
            cwd: path.dirname(exePath),
        });
        this.proc = proc;

        if (proc.stdout) {
            proc.stdout.setEncoding('utf8');
            const rl = readline.createInterface({ input: proc.stdout });
            rl.on('line', line => this.handleLine(line));
        }

        let stderrBuffer = '';
        proc.stderr?.on('data', chunk => {
            stderrBuffer += chunk.toString();
        });

        proc.on('spawn', () => {
            console.log('[connectome-clipboard] watcher process spawned (pid %s)', proc.pid);
        });

        proc.on('exit', (code, signal) => {
            console.error(
                `[connectome-clipboard] watcher exited code=${code} signal=${signal} stderr=${stderrBuffer.trim()}`
            );
            if (code !== 0 && code !== null) {
                this.setStatus(
                    'error',
                    stderrBuffer.trim() || `Clipboard history watcher exited with code ${code}.`
                );
            }
        });
        proc.on('error', err => {
            console.error('[connectome-clipboard] spawn error:', err);
            this.setStatus('error', err.message);
        });
    }

    protected handleLine(line: string): void {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            console.warn('[connectome-clipboard] non-JSON line from watcher:', trimmed.slice(0, 200));
            return;
        }

        if (parsed.type === 'status') {
            this.setStatus(parsed.text === 'disabled' ? 'disabled' : 'running');
            return;
        }
        if (parsed.type === 'error') {
            this.setStatus(
                'error',
                typeof parsed.text === 'string' ? parsed.text : 'Unknown clipboard watcher error.'
            );
            return;
        }

        const entry = parsed as unknown as ClipboardEntry;
        if (entry.id && entry.type && entry.timestamp) {
            this.rememberEntry(entry);
            this.broadcastEntry(entry);
        }
    }

    protected rememberEntry(entry: ClipboardEntry): void {
        if (this.entryIds.has(entry.id)) {
            return;
        }
        this.entryIds.add(entry.id);
        this.entryBuffer = [entry, ...this.entryBuffer].slice(0, ENTRY_BUFFER_LIMIT);
        // Keep id set in sync with buffer
        if (this.entryBuffer.length === ENTRY_BUFFER_LIMIT) {
            this.entryIds.clear();
            for (const e of this.entryBuffer) {
                this.entryIds.add(e.id);
            }
        }
    }

    protected setStatus(status: ClipboardWatcherStatus, message?: string): void {
        this.lastStatus = status;
        this.lastStatusMessage = message;
        this.broadcastStatus(status, message);
    }

    protected buildSyncPayload(): ClipboardSyncPayload {
        return {
            status: this.lastStatus,
            message: this.lastStatusMessage,
            // Oldest → newest for stable add order on the client (client prepends)
            entries: [...this.entryBuffer].reverse(),
        };
    }

    protected flushToContents(contents: { isDestroyed(): boolean; send(channel: string, ...args: unknown[]): void }): void {
        if (contents.isDestroyed()) {
            return;
        }
        try {
            contents.send(CLIPBOARD_WATCHER_STATUS_EVENT, this.lastStatus, this.lastStatusMessage);
            // Send oldest first so client prepend keeps chronological buffer order
            for (const entry of [...this.entryBuffer].reverse()) {
                contents.send(CLIPBOARD_HISTORY_ITEM_EVENT, entry);
            }
        } catch (err) {
            console.warn('[connectome-clipboard] flushToContents failed:', err);
        }
    }

    protected broadcastEntry(entry: ClipboardEntry): void {
        for (const contents of this.targetWebContents()) {
            contents.send(CLIPBOARD_HISTORY_ITEM_EVENT, entry);
        }
    }

    protected broadcastStatus(status: ClipboardWatcherStatus, message?: string): void {
        for (const contents of this.targetWebContents()) {
            contents.send(CLIPBOARD_WATCHER_STATUS_EVENT, status, message);
        }
    }

    /**
     * Prefer real windows, but fall back to any live webContents — Theia's host
     * can briefly report types other than 'window' during startup.
     */
    protected targetWebContents(): Array<{ isDestroyed(): boolean; send(channel: string, ...args: unknown[]): void; getType?: () => string }> {
        const all = webContents.getAllWebContents().filter(c => !c.isDestroyed());
        const windows = all.filter(c => {
            try {
                return typeof c.getType === 'function' && c.getType() === 'window';
            } catch {
                return false;
            }
        });
        return windows.length > 0 ? windows : all;
    }

    onStop(): void {
        this.proc?.kill();
        this.proc = undefined;
    }
}
