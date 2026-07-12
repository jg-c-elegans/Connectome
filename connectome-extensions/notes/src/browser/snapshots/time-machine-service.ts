import { injectable, inject, optional, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, DisposableCollection } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { matchesAnyGlob } from './simple-glob';
import { TimeMachinePreferences, TIME_MACHINE_EXCLUDE_GLOBS_PREF } from './time-machine-preferences';

const SNAPSHOTS_DIRNAME = '.connectome-snapshots';
const MAX_SNAPSHOTS_PER_FILE = 10;
const DEBOUNCE_MS = 2500;

export interface SnapshotInfo {
    /** Absolute URI of the snapshot file itself, under .connectome-snapshots/. */
    snapshotUri: URI;
    /** Workspace-relative path of the *original* file this snapshot was taken from. */
    relativePath: string;
    /** Timestamp (ms epoch) the snapshot was taken, parsed from the snapshot filename. */
    timestamp: number;
}

/**
 * Local "Time Machine" version history: watches workspace text edits and, a few
 * seconds after the last edit to a file settles, copies its current content into
 * a hidden `.connectome-snapshots/<relative-path>/<timestamp>.snapshot` file.
 * Keeps at most MAX_SNAPSHOTS_PER_FILE snapshots per source file (oldest pruned first).
 */
@injectable()
export class TimeMachineService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(MonacoWorkspace) @optional()
    protected readonly monacoWorkspace: MonacoWorkspace | undefined;

    @inject(TimeMachinePreferences)
    protected readonly preferences: TimeMachinePreferences;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection();
    protected readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    @postConstruct()
    protected init(): void {
        if (!this.monacoWorkspace) {
            return;
        }
        this.toDispose.push(this.monacoWorkspace.onDidChangeTextDocument(event => {
            const uri = new URI(event.model.uri);
            this.scheduleSnapshot(uri);
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }

    protected scheduleSnapshot(uri: URI): void {
        const root = this.workspaceService.tryGetRoots()[0];
        if (!root) {
            return;
        }
        const relative = root.resource.relative(uri);
        if (!relative) {
            return;
        }
        const relativePath = relative.toString();
        if (this.isExcluded(relativePath)) {
            return;
        }
        const key = uri.toString();
        const existing = this.debounceTimers.get(key);
        if (existing !== undefined) {
            clearTimeout(existing);
        }
        this.debounceTimers.set(key, setTimeout(() => {
            this.debounceTimers.delete(key);
            this.takeSnapshot(uri, root.resource, relativePath).catch(() => { /* best-effort */ });
        }, DEBOUNCE_MS));
    }

    protected isExcluded(relativePath: string): boolean {
        const globs = this.preferences[TIME_MACHINE_EXCLUDE_GLOBS_PREF] ?? [];
        return matchesAnyGlob(relativePath, globs);
    }

    protected async takeSnapshot(uri: URI, rootUri: URI, relativePath: string): Promise<void> {
        const model = this.monacoWorkspace?.getTextDocument(uri.toString());
        let text: string;
        if (model) {
            text = model.getText();
        } else {
            try {
                text = (await this.fileService.read(uri)).value;
            } catch {
                return;
            }
        }
        const snapshotDir = this.snapshotDirFor(rootUri, relativePath);
        if (!await this.fileService.exists(snapshotDir)) {
            await this.fileService.createFolder(snapshotDir);
        }
        const timestamp = Date.now();
        const snapshotUri = snapshotDir.resolve(`${timestamp}.snapshot`);
        await this.fileService.writeFile(snapshotUri, BinaryBuffer.fromString(text));
        await this.pruneOldSnapshots(snapshotDir);
        this.onDidChangeEmitter.fire();
    }

    protected snapshotDirFor(rootUri: URI, relativePath: string): URI {
        return rootUri.resolve(SNAPSHOTS_DIRNAME).resolve(relativePath);
    }

    protected async pruneOldSnapshots(snapshotDir: URI): Promise<void> {
        let entries: FileStat[];
        try {
            const stat = await this.fileService.resolve(snapshotDir);
            entries = stat.children ?? [];
        } catch {
            return;
        }
        const snapshots = entries
            .filter(e => e.name.endsWith('.snapshot'))
            .map(e => ({ uri: e.resource, timestamp: parseInt(e.name.replace('.snapshot', ''), 10) }))
            .filter(e => !isNaN(e.timestamp))
            .sort((a, b) => b.timestamp - a.timestamp);
        for (const stale of snapshots.slice(MAX_SNAPSHOTS_PER_FILE)) {
            await this.fileService.delete(stale.uri).catch(() => { /* best-effort */ });
        }
    }

    /** List all snapshots across the workspace, newest first. */
    async listAllSnapshots(): Promise<SnapshotInfo[]> {
        const root = this.workspaceService.tryGetRoots()[0];
        if (!root) {
            return [];
        }
        const snapshotsRoot = root.resource.resolve(SNAPSHOTS_DIRNAME);
        if (!await this.fileService.exists(snapshotsRoot)) {
            return [];
        }
        const result: SnapshotInfo[] = [];
        await this.walk(snapshotsRoot, snapshotsRoot, result);
        result.sort((a, b) => b.timestamp - a.timestamp);
        return result;
    }

    protected async walk(dir: URI, snapshotsRoot: URI, result: SnapshotInfo[]): Promise<void> {
        let stat: FileStat;
        try {
            stat = await this.fileService.resolve(dir);
        } catch {
            return;
        }
        for (const child of stat.children ?? []) {
            if (child.isDirectory) {
                await this.walk(child.resource, snapshotsRoot, result);
            } else if (child.name.endsWith('.snapshot')) {
                const timestamp = parseInt(child.name.replace('.snapshot', ''), 10);
                if (isNaN(timestamp)) {
                    continue;
                }
                const relativeToSnapshotsRoot = snapshotsRoot.relative(child.resource.parent);
                result.push({
                    snapshotUri: child.resource,
                    relativePath: relativeToSnapshotsRoot ? relativeToSnapshotsRoot.toString() : '',
                    timestamp
                });
            }
        }
    }

    /** Read a snapshot's stored content. */
    async readSnapshot(snapshotUri: URI): Promise<string> {
        const content = await this.fileService.read(snapshotUri);
        return content.value;
    }

    /**
     * Restore a snapshot by writing its content back to the live file.
     * Note: this overwrites the current file content unconditionally — there is
     * no confirm-before-overwrite dialog yet; callers (widget UI) should confirm
     * with the user before calling this.
     */
    async restoreSnapshot(snapshot: SnapshotInfo): Promise<void> {
        const root = this.workspaceService.tryGetRoots()[0];
        if (!root) {
            return;
        }
        const targetUri = root.resource.resolve(snapshot.relativePath);
        const content = await this.readSnapshot(snapshot.snapshotUri);
        await this.fileService.write(targetUri, content);
    }
}
