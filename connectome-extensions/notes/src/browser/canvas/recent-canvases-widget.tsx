import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon, OpenerService, open } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { isCanvasUri } from './canvas-model';
import { formatRelativeTime, sortUrisByMtime, UriWithMtime } from '../activity/note-mtime';

@injectable()
export class RecentCanvasesWidget extends ReactWidget {

    static readonly ID = 'connectome-canvas-recent';
    static readonly LABEL = 'Recent Canvases';

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(FileSearchService)
    protected readonly fileSearch: FileSearchService;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    protected items: UriWithMtime[] = [];
    protected loading = true;

    @postConstruct()
    protected init(): void {
        this.id = RecentCanvasesWidget.ID;
        this.title.label = RecentCanvasesWidget.LABEL;
        this.title.caption = 'Canvas boards in this workspace';
        this.title.iconClass = codicon('map');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.fileService.onDidFilesChange(event => {
            if (event.changes.some(c => isCanvasUri(c.resource.path.base) || isCanvasUri(c.resource.path.toString()))) {
                void this.refresh();
            }
        }));
        void this.refresh();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        void this.refresh();
    }

    async refresh(): Promise<void> {
        this.loading = true;
        this.update();
        try {
            const roots = this.workspace.tryGetRoots();
            if (roots.length === 0) {
                this.items = [];
                return;
            }
            const found = await this.fileSearch.find('', {
                rootUris: roots.map(r => r.resource.toString()),
                includePatterns: ['**/*.canvas.json', '**/*.connectome.canvas'],
                excludePatterns: ['**/node_modules/**'],
                useGitIgnore: true,
                limit: 200,
                fuzzyMatch: false
            });
            const uris = found
                .map(s => new URI(s))
                .filter(uri => isCanvasUri(uri.path.base) || isCanvasUri(uri.path.toString()));
            this.items = await sortUrisByMtime(this.fileService, uris, { limit: 50 });
        } catch {
            this.items = [];
        } finally {
            this.loading = false;
            this.update();
        }
    }

    protected render(): React.ReactNode {
        if (this.loading && this.items.length === 0) {
            return <div className='connectome-notes-empty'>Looking for canvases…</div>;
        }
        if (this.items.length === 0) {
            return <div className='connectome-notes-empty'>
                No canvases yet.<br />
                Use <strong>New Canvas</strong> in the toolbar or File → New Canvas.
            </div>;
        }
        return <div className='connectome-notes-list'>
            {this.items.map(({ uri, mtime }) =>
                <div className='connectome-notes-occurrence' key={uri.toString()}
                    title={uri.path.toString()}
                    onClick={() => void open(this.openerService, uri)}>
                    <span className={codicon('map') + ' connectome-notes-icon'} />
                    <span className='connectome-notes-group-name'>{this.displayName(uri)}</span>
                    <span className='connectome-notes-group-detail'>{formatRelativeTime(mtime)}</span>
                </div>
            )}
        </div>;
    }

    protected displayName(uri: URI): string {
        const base = uri.path.base;
        if (base.toLowerCase().endsWith('.canvas.json')) {
            return base.slice(0, -'.canvas.json'.length) || base;
        }
        if (base.toLowerCase().endsWith('.connectome.canvas')) {
            return base.slice(0, -'.connectome.canvas'.length) || base;
        }
        return uri.path.name;
    }
}
