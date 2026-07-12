import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import URI from '@theia/core/lib/common/uri';

const STORAGE_PREFIX = 'connectome.starredNotes';

/**
 * Workspace-scoped starred/bookmarked note URIs.
 * Persisted via Theia StorageService, keyed by workspace root so each vault
 * keeps its own list.
 */
@injectable()
export class StarredNotesService {

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    protected starred: string[] = [];
    protected ready = false;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.reload().catch(() => { /* ignore */ });
        this.workspace.onWorkspaceChanged(() => {
            this.reload().catch(() => { /* ignore */ });
        });
    }

    protected storageKey(): string {
        const roots = this.workspace.tryGetRoots();
        const id = roots.length > 0 ? roots[0].resource.toString() : 'no-workspace';
        return `${STORAGE_PREFIX}:${id}`;
    }

    async reload(): Promise<void> {
        const data = await this.storage.getData<string[]>(this.storageKey(), []);
        this.starred = Array.isArray(data) ? data.filter(s => typeof s === 'string') : [];
        this.ready = true;
        this.onDidChangeEmitter.fire();
    }

    protected async persist(): Promise<void> {
        await this.storage.setData(this.storageKey(), [...this.starred]);
        this.onDidChangeEmitter.fire();
    }

    getStarredUris(): URI[] {
        return this.starred.map(s => new URI(s));
    }

    isStarred(uri: URI): boolean {
        const key = uri.toString();
        return this.starred.includes(key);
    }

    async star(uri: URI): Promise<void> {
        if (uri.path.ext.toLowerCase() !== '.md') {
            return;
        }
        const key = uri.toString();
        if (this.starred.includes(key)) {
            return;
        }
        this.starred = [...this.starred, key];
        await this.persist();
    }

    async unstar(uri: URI): Promise<void> {
        const key = uri.toString();
        const next = this.starred.filter(s => s !== key);
        if (next.length === this.starred.length) {
            return;
        }
        this.starred = next;
        await this.persist();
    }

    async toggle(uri: URI): Promise<boolean> {
        if (this.isStarred(uri)) {
            await this.unstar(uri);
            return false;
        }
        await this.star(uri);
        return true;
    }
}
