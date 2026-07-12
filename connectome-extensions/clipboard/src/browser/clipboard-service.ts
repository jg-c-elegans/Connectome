import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileUri } from '@theia/core/lib/common/file-uri';
import URI from '@theia/core/lib/common/uri';
import { ClipboardEntry, ClipboardWatcherStatus } from '../common/clipboard-api';
import { CLIPBOARD_BUFFER_LIMIT } from './clipboard-view-container';

const SAVES_DIRNAME = '.clipboard_saves';

@injectable()
export class ClipboardService {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    protected history: ClipboardEntry[] = [];
    protected saved: ClipboardEntry[] = [];
    protected watcherStatus: ClipboardWatcherStatus = 'error';
    protected watcherMessage: string | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        const api = window.electronConnectomeClipboard;
        if (api) {
            api.onHistoryItem(entry => this.addHistoryEntry(entry));
            api.onWatcherStatus((status, message) => {
                this.watcherStatus = status;
                this.watcherMessage = message;
                this.onDidChangeEmitter.fire();
            });
            // Main starts the native watcher before any BrowserWindow exists, so the first
            // Win+V dump is buffered there. Pull it (and the real status) as soon as we load.
            void api.requestSync().then(sync => {
                this.watcherStatus = sync.status;
                this.watcherMessage = sync.message;
                for (const entry of sync.entries) {
                    this.addHistoryEntry(entry);
                }
                this.onDidChangeEmitter.fire();
            }).catch(err => {
                this.watcherStatus = 'error';
                this.watcherMessage = err instanceof Error ? err.message : String(err);
                this.onDidChangeEmitter.fire();
            });
        } else {
            this.watcherStatus = 'error';
            this.watcherMessage = 'Clipboard history bridge is unavailable in this environment.';
        }
        void this.reloadSaved();
        this.workspaceService.onWorkspaceChanged(() => void this.reloadSaved());
    }

    getHistory(): ClipboardEntry[] {
        return this.history;
    }

    getSaved(): ClipboardEntry[] {
        return this.saved;
    }

    getWatcherStatus(): { status: ClipboardWatcherStatus; message?: string } {
        return { status: this.watcherStatus, message: this.watcherMessage };
    }

    protected addHistoryEntry(entry: ClipboardEntry): void {
        if (this.history.some(e => e.id === entry.id)) {
            return;
        }
        this.history = [entry, ...this.history].slice(0, CLIPBOARD_BUFFER_LIMIT);
        this.onDidChangeEmitter.fire();
    }

    protected savesDir(): URI | undefined {
        const root = this.workspaceService.tryGetRoots()[0];
        return root ? root.resource.resolve(SAVES_DIRNAME) : undefined;
    }

    async reloadSaved(): Promise<void> {
        const dir = this.savesDir();
        if (!dir || !await this.fileService.exists(dir)) {
            this.saved = [];
            this.onDidChangeEmitter.fire();
            return;
        }
        let stat;
        try {
            stat = await this.fileService.resolve(dir);
        } catch {
            this.saved = [];
            this.onDidChangeEmitter.fire();
            return;
        }

        const items: ClipboardEntry[] = [];
        for (const child of stat.children ?? []) {
            if (!child.isDirectory) {
                continue;
            }
            const metaUri = child.resource.resolve('meta.json');
            if (!await this.fileService.exists(metaUri)) {
                continue;
            }
            try {
                const raw = await this.fileService.read(metaUri);
                const meta = JSON.parse(raw.value) as ClipboardEntry;
                if (meta.type === 'text') {
                    const textUri = child.resource.resolve('content.txt');
                    meta.text = (await this.fileService.read(textUri)).value;
                } else if (meta.type === 'image') {
                    const contentFileName = (meta as unknown as { contentFileName?: string }).contentFileName ?? 'content.bmp';
                    meta.cachedImagePath = FileUri.fsPath(child.resource.resolve(contentFileName));
                } else if (meta.type === 'file' && Array.isArray((meta as unknown as { fileNames?: string[] }).fileNames)) {
                    const fileNames = (meta as unknown as { fileNames: string[] }).fileNames;
                    meta.paths = fileNames.map(name => FileUri.fsPath(child.resource.resolve(name)));
                }
                items.push(meta);
            } catch {
                // skip corrupt entries
            }
        }
        items.sort((a, b) => b.timestamp - a.timestamp);
        this.saved = items;
        this.onDidChangeEmitter.fire();
    }

    isSaved(id: string): boolean {
        return this.saved.some(s => s.id === id);
    }

    /** Copies a live Clipboard-section entry into `.clipboard_saves/<id>/`. */
    async saveEntry(entry: ClipboardEntry): Promise<boolean> {
        const dir = this.savesDir();
        if (!dir) {
            return false;
        }
        const itemDir = dir.resolve(entry.id);
        if (!await this.fileService.exists(itemDir)) {
            await this.fileService.createFolder(itemDir);
        }

        if (entry.type === 'text') {
            await this.fileService.writeFile(itemDir.resolve('content.txt'), BinaryBuffer.fromString(entry.text ?? ''));
            await this.writeMeta(itemDir, { id: entry.id, type: 'text', timestamp: entry.timestamp });
        } else if (entry.type === 'image' && entry.cachedImagePath) {
            const source = FileUri.create(entry.cachedImagePath);
            const ext = source.path.ext || '.bmp';
            const contentFileName = `content${ext}`;
            await this.fileService.copy(source, itemDir.resolve(contentFileName), { overwrite: true }).catch(() => { /* best-effort */ });
            await this.writeMeta(itemDir, { id: entry.id, type: 'image', timestamp: entry.timestamp, contentFileName });
        } else if (entry.type === 'file' && entry.paths?.length) {
            const fileNames: string[] = [];
            for (const p of entry.paths) {
                const source = FileUri.create(p);
                const name = source.path.base;
                await this.fileService.copy(source, itemDir.resolve(name), { overwrite: true }).catch(() => { /* best-effort */ });
                fileNames.push(name);
            }
            await this.writeMeta(itemDir, { id: entry.id, type: 'file', timestamp: entry.timestamp, fileNames });
        } else {
            return false;
        }

        await this.reloadSaved();
        return true;
    }

    protected async writeMeta(itemDir: URI, meta: Record<string, unknown>): Promise<void> {
        await this.fileService.writeFile(itemDir.resolve('meta.json'), BinaryBuffer.fromString(JSON.stringify(meta, undefined, 2)));
    }

    async deleteSaved(id: string): Promise<void> {
        const dir = this.savesDir();
        if (!dir) {
            return;
        }
        await this.fileService.delete(dir.resolve(id), { recursive: true }).catch(() => { /* best-effort */ });
        await this.reloadSaved();
    }
}
