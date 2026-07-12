import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import URI from '@theia/core/lib/common/uri';
import { ScriptItem, ScriptLanguage, ScriptsSortMode } from './scripts-view-container';

const SCRIPTS_DIRNAME = '.connectome-scripts';
const FAVORITES_FILENAME = '.favorites.json';
const SORT_STORAGE_PREFIX = 'connectome.scripts.sortMode';

@injectable()
export class ScriptsService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(StorageService)
    protected readonly storage: StorageService;

    protected items: ScriptItem[] = [];
    protected sortMode: ScriptsSortMode = 'alphabetical';
    protected ready = false;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        void this.reload();
        this.workspaceService.onWorkspaceChanged(() => void this.reload());
        this.fileService.onDidFilesChange(event => {
            const dir = this.scriptsDir();
            if (dir && event.changes.some(c => dir.isEqualOrParent(c.resource))) {
                void this.reload();
            }
        });
    }

    protected scriptsDir(): URI | undefined {
        const root = this.workspaceService.tryGetRoots()[0];
        return root ? root.resource.resolve(SCRIPTS_DIRNAME) : undefined;
    }

    protected favoritesFile(): URI | undefined {
        return this.scriptsDir()?.resolve(FAVORITES_FILENAME);
    }

    protected sortStorageKey(): string {
        const root = this.workspaceService.tryGetRoots()[0];
        return `${SORT_STORAGE_PREFIX}:${root ? root.resource.toString() : 'no-workspace'}`;
    }

    getSortMode(): ScriptsSortMode {
        return this.sortMode;
    }

    async setSortMode(mode: ScriptsSortMode): Promise<void> {
        this.sortMode = mode;
        await this.storage.setData(this.sortStorageKey(), mode);
        this.applySort();
        this.onDidChangeEmitter.fire();
    }

    protected applySort(): void {
        if (this.sortMode === 'alphabetical') {
            this.items.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            this.items.sort((a, b) => b.mtime - a.mtime);
        }
    }

    getItems(): ScriptItem[] {
        return this.items;
    }

    getFavorites(): ScriptItem[] {
        return this.items.filter(i => i.favorite);
    }

    languageOf(name: string): ScriptLanguage {
        return name.toLowerCase().endsWith('.ps1') ? 'powershell' : 'python';
    }

    getScriptUri(name: string): URI | undefined {
        return this.scriptsDir()?.resolve(name);
    }

    async reload(): Promise<void> {
        this.sortMode = await this.storage.getData<ScriptsSortMode>(this.sortStorageKey(), 'alphabetical');

        const dir = this.scriptsDir();
        if (!dir || !await this.fileService.exists(dir)) {
            this.items = [];
            this.ready = true;
            this.onDidChangeEmitter.fire();
            return;
        }

        const favorites = await this.readFavorites();
        let stat;
        try {
            stat = await this.fileService.resolve(dir, { resolveMetadata: true });
        } catch {
            this.items = [];
            this.ready = true;
            this.onDidChangeEmitter.fire();
            return;
        }

        this.items = (stat.children ?? [])
            .filter(c => !c.isDirectory && /\.(py|ps1)$/i.test(c.name))
            .map(c => ({
                name: c.name,
                language: this.languageOf(c.name),
                favorite: favorites.includes(c.name),
                mtime: c.mtime ?? 0
            }));
        this.applySort();
        this.ready = true;
        this.onDidChangeEmitter.fire();
    }

    protected async readFavorites(): Promise<string[]> {
        const file = this.favoritesFile();
        if (!file || !await this.fileService.exists(file)) {
            return [];
        }
        try {
            const content = await this.fileService.read(file);
            const data = JSON.parse(content.value);
            return Array.isArray(data) ? data.filter((s): s is string => typeof s === 'string') : [];
        } catch {
            return [];
        }
    }

    protected async writeFavorites(favorites: string[]): Promise<void> {
        const file = this.favoritesFile();
        if (!file) {
            return;
        }
        await this.fileService.writeFile(file, BinaryBuffer.fromString(JSON.stringify(favorites, undefined, 2)));
    }

    /** Copies `content` into the managed scripts folder, auto-suffixing on name collision. Returns the final file name. */
    async saveToScripts(baseName: string, content: string): Promise<string | undefined> {
        const dir = this.scriptsDir();
        if (!dir) {
            return undefined;
        }
        if (!await this.fileService.exists(dir)) {
            await this.fileService.createFolder(dir);
        }

        const dot = baseName.lastIndexOf('.');
        const stem = dot >= 0 ? baseName.slice(0, dot) : baseName;
        const ext = dot >= 0 ? baseName.slice(dot) : '';

        let candidate = baseName;
        let suffix = 2;
        while (await this.fileService.exists(dir.resolve(candidate))) {
            candidate = `${stem}_${suffix}${ext}`;
            suffix++;
        }

        await this.fileService.writeFile(dir.resolve(candidate), BinaryBuffer.fromString(content));
        await this.reload();
        return candidate;
    }

    async deleteScript(name: string): Promise<void> {
        const dir = this.scriptsDir();
        if (!dir) {
            return;
        }
        await this.fileService.delete(dir.resolve(name)).catch(() => { /* best-effort */ });
        const favorites = (await this.readFavorites()).filter(f => f !== name);
        await this.writeFavorites(favorites);
        await this.reload();
    }

    async toggleFavorite(name: string): Promise<boolean> {
        const favorites = await this.readFavorites();
        const isFavorite = favorites.includes(name);
        const next = isFavorite ? favorites.filter(f => f !== name) : [...favorites, name];
        await this.writeFavorites(next);
        await this.reload();
        return !isFavorite;
    }
}
