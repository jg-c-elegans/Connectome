import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { EditorManager } from '@theia/editor/lib/browser';
import { NoteIndexService } from '../note-index-service';
import { formatRelativeTime } from '../activity/note-mtime';
import { NoteHistoryService } from './note-history-service';

@injectable()
export class RecentlyClosedWidget extends ReactWidget {

    static readonly ID = 'connectome-history-closed';
    static readonly LABEL = 'Recently Closed';

    @inject(NoteHistoryService)
    protected readonly history: NoteHistoryService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @postConstruct()
    protected init(): void {
        this.id = RecentlyClosedWidget.ID;
        this.title.label = RecentlyClosedWidget.LABEL;
        this.title.caption = 'Markdown tabs closed this session';
        this.title.iconClass = codicon('close');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.history.onDidChange(() => this.update()));
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const items = this.history.getRecentlyClosed();
        if (items.length === 0) {
            return <div className='connectome-notes-empty'>
                No closed notes yet this session.<br />
                Close a markdown tab to see it here.
            </div>;
        }
        return <div className='connectome-notes-list'>
            {items.map(({ uri, closedAt }) =>
                <div className='connectome-notes-occurrence' key={uri.toString() + closedAt}
                    title={this.index.getWorkspaceRelativePath(uri) || uri.path.toString()}
                    onClick={() => this.editorManager.open(uri)}>
                    <span className={codicon('markdown') + ' connectome-notes-icon'} />
                    <span className='connectome-notes-group-name'>{uri.path.name}</span>
                    <span className='connectome-notes-group-detail'>{formatRelativeTime(closedAt)}</span>
                </div>
            )}
        </div>;
    }
}
