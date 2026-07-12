import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { EditorManager } from '@theia/editor/lib/browser';
import { NoteIndexService } from '../note-index-service';

@injectable()
export class LibraryOrphanNotesWidget extends ReactWidget {

    static readonly ID = 'connectome-library-orphans';
    static readonly LABEL = 'Orphans';

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @postConstruct()
    protected init(): void {
        this.id = LibraryOrphanNotesWidget.ID;
        this.title.label = LibraryOrphanNotesWidget.LABEL;
        this.title.caption = 'Notes with no inbound wikilinks';
        this.title.iconClass = codicon('debug-disconnect');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.index.onDidUpdate(() => this.update()));
        void this.index.initialize().then(() => this.update());
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const orphans = this.index.getOrphanNotes()
            .slice()
            .sort((a, b) => a.path.name.localeCompare(b.path.name));
        if (orphans.length === 0) {
            return <div className='connectome-notes-empty'>No orphan notes.</div>;
        }
        return <div className='connectome-notes-list'>
            {orphans.map(uri =>
                <div className='connectome-notes-occurrence' key={uri.toString()}
                    title={this.index.getWorkspaceRelativePath(uri)}
                    onClick={() => this.editorManager.open(uri)}>
                    <span className={codicon('markdown') + ' connectome-notes-icon'} />
                    <span className='connectome-notes-group-name'>{uri.path.name}</span>
                    <span className='connectome-notes-group-detail'>
                        {this.index.getWorkspaceRelativePath(uri)}
                    </span>
                </div>
            )}
        </div>;
    }
}
