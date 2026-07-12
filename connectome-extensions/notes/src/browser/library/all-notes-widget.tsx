import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { NoteIndexService } from '../note-index-service';

@injectable()
export class LibraryAllNotesWidget extends ReactWidget {

    static readonly ID = 'connectome-library-all';
    static readonly LABEL = 'All Notes';

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected filter = '';

    @postConstruct()
    protected init(): void {
        this.id = LibraryAllNotesWidget.ID;
        this.title.label = LibraryAllNotesWidget.LABEL;
        this.title.caption = 'All markdown notes in the workspace';
        this.title.iconClass = codicon('library');
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
        const uris = this.filteredNotes();
        return <div className='connectome-notes-list'>
            <div className='connectome-library-filter'>
                <input
                    className='theia-input connectome-library-filter-input'
                    type='search'
                    placeholder='Filter notes…'
                    value={this.filter}
                    onChange={e => {
                        this.filter = e.target.value;
                        this.update();
                    }}
                />
            </div>
            {uris.length === 0
                ? <div className='connectome-notes-empty'>
                    {this.filter ? 'No notes match this filter.' : 'No notes yet.'}
                </div>
                : uris.map(uri =>
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

    protected filteredNotes(): URI[] {
        const q = this.filter.trim().toLowerCase();
        let uris = this.index.getAllNoteUris()
            .slice()
            .sort((a, b) => a.path.name.localeCompare(b.path.name));
        if (q) {
            uris = uris.filter(uri => {
                const name = uri.path.name.toLowerCase();
                const rel = this.index.getWorkspaceRelativePath(uri).toLowerCase();
                return name.includes(q) || rel.includes(q);
            });
        }
        return uris;
    }
}
