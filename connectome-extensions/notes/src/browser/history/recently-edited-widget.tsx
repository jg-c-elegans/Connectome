import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NoteIndexService } from '../note-index-service';
import { formatRelativeTime, isSameLocalDay, sortUrisByMtime, UriWithMtime } from '../activity/note-mtime';

@injectable()
export class RecentlyEditedWidget extends ReactWidget {

    static readonly ID = 'connectome-history-edited';
    static readonly LABEL = 'Recently Edited';

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected items: UriWithMtime[] = [];
    protected loading = true;

    @postConstruct()
    protected init(): void {
        this.id = RecentlyEditedWidget.ID;
        this.title.label = RecentlyEditedWidget.LABEL;
        this.title.caption = 'Markdown notes by last modified time';
        this.title.iconClass = codicon('edit');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.index.onDidUpdate(() => void this.refresh()));
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
            await this.index.initialize();
            const uris = this.index.getAllNoteUris();
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
            return <div className='connectome-notes-empty'>Loading…</div>;
        }
        if (this.items.length === 0) {
            return <div className='connectome-notes-empty'>No edited notes yet.</div>;
        }
        const today = this.items.filter(i => isSameLocalDay(i.mtime));
        const earlier = this.items.filter(i => !isSameLocalDay(i.mtime));
        return <div className='connectome-notes-list'>
            {today.length > 0 && <>
                <div className='connectome-notes-section-label'>Today</div>
                {today.map(item => this.renderItem(item))}
            </>}
            {earlier.length > 0 && <>
                <div className='connectome-notes-section-label'>Earlier</div>
                {earlier.map(item => this.renderItem(item))}
            </>}
        </div>;
    }

    protected renderItem({ uri, mtime }: UriWithMtime): React.ReactNode {
        return <div className='connectome-notes-occurrence' key={uri.toString()}
            title={this.index.getWorkspaceRelativePath(uri)}
            onClick={() => this.editorManager.open(uri)}>
            <span className={codicon('markdown') + ' connectome-notes-icon'} />
            <span className='connectome-notes-group-name'>{uri.path.name}</span>
            <span className='connectome-notes-group-detail'>{formatRelativeTime(mtime)}</span>
        </div>;
    }
}
