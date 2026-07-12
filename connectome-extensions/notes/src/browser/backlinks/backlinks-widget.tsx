import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { LinkOccurrence, NoteIndexService } from '../note-index-service';

@injectable()
export class BacklinksWidget extends ReactWidget {

    static readonly ID = 'connectome-backlinks';
    static readonly LABEL = 'Backlinks';

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    /** Last active markdown note; kept when focus moves to a non-editor widget. */
    protected currentNote: URI | undefined;

    @postConstruct()
    protected init(): void {
        this.id = BacklinksWidget.ID;
        this.title.label = BacklinksWidget.LABEL;
        this.title.caption = 'Notes that link to the current note';
        this.title.iconClass = codicon('references');
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
        // non-markdown or no editor: keep showing the last note
    }

    protected render(): React.ReactNode {
        if (!this.currentNote) {
            return <div className='connectome-notes-empty'>Open a markdown note to see its backlinks.</div>;
        }
        const backlinks = this.index.getBacklinks(this.currentNote);
        const noteName = this.currentNote.path.name;
        if (backlinks.length === 0) {
            return <div className='connectome-notes-empty'>No links to “{noteName}” yet.<br />
                Link to it from another note with [[{noteName}]].</div>;
        }
        const bySource = new Map<string, LinkOccurrence[]>();
        for (const occurrence of backlinks) {
            const list = bySource.get(occurrence.sourceUri) ?? [];
            list.push(occurrence);
            bySource.set(occurrence.sourceUri, list);
        }
        const groups = [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b));
        return <div className='connectome-notes-list'>
            {groups.map(([sourceUri, occurrences]) => this.renderSource(sourceUri, occurrences))}
        </div>;
    }

    protected renderSource(sourceUri: string, occurrences: LinkOccurrence[]): React.ReactNode {
        const uri = new URI(sourceUri);
        return <div className='connectome-notes-group' key={sourceUri}>
            <div className='connectome-notes-group-header'>
                <span className={codicon('markdown') + ' connectome-notes-icon'} />
                <span className='connectome-notes-group-name'>{uri.path.name}</span>
                <span className='connectome-notes-group-detail'>{this.index.getWorkspaceRelativePath(uri)}</span>
            </div>
            {occurrences.map((occurrence, i) =>
                <div className='connectome-notes-occurrence' key={i}
                    title={`Line ${occurrence.line + 1}`}
                    onClick={() => this.open(occurrence)}>
                    {this.renderSnippet(occurrence)}
                </div>
            )}
        </div>;
    }

    protected renderSnippet(occurrence: LinkOccurrence): React.ReactNode {
        const text = occurrence.lineText;
        const before = text.substring(0, occurrence.startCol).trimStart();
        const link = text.substring(occurrence.startCol, occurrence.endCol);
        const after = text.substring(occurrence.endCol);
        return <span className='connectome-notes-snippet'>
            {before}<span className='connectome-notes-snippet-highlight'>{link}</span>{after}
        </span>;
    }

    protected open(occurrence: LinkOccurrence): void {
        this.editorManager.open(new URI(occurrence.sourceUri), {
            selection: {
                start: { line: occurrence.line, character: occurrence.startCol },
                end: { line: occurrence.line, character: occurrence.endCol }
            }
        });
    }
}
