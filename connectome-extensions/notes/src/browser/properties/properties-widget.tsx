import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { NoteIndexService } from '../note-index-service';

@injectable()
export class PropertiesWidget extends ReactWidget {

    static readonly ID = 'connectome-note-properties';
    static readonly LABEL = 'Properties';

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    protected currentNote: URI | undefined;

    @postConstruct()
    protected init(): void {
        this.id = PropertiesWidget.ID;
        this.title.label = PropertiesWidget.LABEL;
        this.title.caption = 'YAML frontmatter properties for the active note';
        this.title.iconClass = codicon('json');
        this.title.closable = true;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.editorManager.onCurrentEditorChanged(widget => this.handleEditorChanged(widget)));
        this.toDispose.push(this.index.onDidUpdate(() => this.update()));
        this.handleEditorChanged(this.editorManager.currentEditor);
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected handleEditorChanged(widget: EditorWidget | undefined): void {
        const uri = widget?.editor.uri;
        if (uri && uri.path.ext.toLowerCase() === '.md') {
            this.currentNote = uri;
            this.update();
        }
    }

    protected render(): React.ReactNode {
        if (!this.currentNote) {
            return <div className='connectome-notes-empty'>Open a markdown note to see its properties.</div>;
        }
        const doc = this.index.getParsedNote(this.currentNote);
        const fm = doc?.frontmatter;
        const fileName = this.currentNote.path.name;
        const path = this.index.getWorkspaceRelativePath(this.currentNote);
        if (!fm) {
            return <div className='connectome-notes-list'>
                <div className='connectome-notes-prop-row'><span className='connectome-notes-prop-key'>file</span>
                    <span className='connectome-notes-prop-val'>{fileName}</span></div>
                <div className='connectome-notes-prop-row'><span className='connectome-notes-prop-key'>path</span>
                    <span className='connectome-notes-prop-val'>{path}</span></div>
                <div className='connectome-notes-empty'>No YAML frontmatter. Add a block at the top of the file:
                    <pre className='connectome-notes-code-sample'>{`---\ntitle: ${fileName}\naliases: []\ntags: []\n---`}</pre>
                </div>
            </div>;
        }
        return <div className='connectome-notes-list'>
            <div className='connectome-notes-prop-row'><span className='connectome-notes-prop-key'>file</span>
                <span className='connectome-notes-prop-val'>{fileName}</span></div>
            <div className='connectome-notes-prop-row'><span className='connectome-notes-prop-key'>path</span>
                <span className='connectome-notes-prop-val'>{path}</span></div>
            <div className='connectome-notes-prop-row'><span className='connectome-notes-prop-key'>title</span>
                <span className='connectome-notes-prop-val'>{fm.title || '—'}</span></div>
            <div className='connectome-notes-prop-row'><span className='connectome-notes-prop-key'>aliases</span>
                <span className='connectome-notes-prop-val'>{fm.aliases.length ? fm.aliases.join(', ') : '—'}</span></div>
            <div className='connectome-notes-prop-row'><span className='connectome-notes-prop-key'>tags</span>
                <span className='connectome-notes-prop-val'>{fm.tags.length
                    ? fm.tags.map(t => <span className='connectome-notes-tag-pill' key={t}>#{t}</span>)
                    : '—'}</span></div>
        </div>;
    }
}
