import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { NoteIndexService, UnlinkedMention } from '../note-index-service';

@injectable()
export class UnlinkedMentionsWidget extends ReactWidget {

    static readonly ID = 'connectome-unlinked-mentions';
    static readonly LABEL = 'Unlinked Mentions';

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    protected currentNote: URI | undefined;
    protected mentions: UnlinkedMention[] = [];
    protected loading = false;

    @postConstruct()
    protected init(): void {
        this.id = UnlinkedMentionsWidget.ID;
        this.title.label = UnlinkedMentionsWidget.LABEL;
        this.title.caption = 'Text mentions of this note that are not wikilinks yet';
        this.title.iconClass = codicon('search');
        this.title.closable = true;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.editorManager.onCurrentEditorChanged(widget => this.handleEditorChanged(widget)));
        this.toDispose.push(this.index.onDidUpdate(() => this.refreshMentions()));
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
            this.refreshMentions();
        }
    }

    protected refreshMentions(): void {
        const note = this.currentNote;
        if (!note) {
            this.mentions = [];
            this.update();
            return;
        }
        this.loading = true;
        this.update();
        this.index.getUnlinkedMentions(note).then(list => {
            if (this.currentNote?.toString() === note.toString()) {
                this.mentions = list;
                this.loading = false;
                this.update();
            }
        }).catch(() => {
            this.loading = false;
            this.update();
        });
    }

    protected render(): React.ReactNode {
        if (!this.currentNote) {
            return <div className='connectome-notes-empty'>Open a markdown note to find unlinked mentions.</div>;
        }
        if (this.loading) {
            return <div className='connectome-notes-empty'>Scanning for unlinked mentions…</div>;
        }
        const mentions = this.mentions;
        if (mentions.length === 0) {
            return <div className='connectome-notes-empty'>No unlinked mentions of “{this.currentNote.path.name}”.</div>;
        }
        const bySource = new Map<string, UnlinkedMention[]>();
        for (const m of mentions) {
            const list = bySource.get(m.sourceUri) ?? [];
            list.push(m);
            bySource.set(m.sourceUri, list);
        }
        return <div className='connectome-notes-list'>
            {[...bySource.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sourceUri, list]) =>
                <div className='connectome-notes-group' key={sourceUri}>
                    <div className='connectome-notes-group-header'>
                        <span className={codicon('markdown') + ' connectome-notes-icon'} />
                        <span className='connectome-notes-group-name'>{new URI(sourceUri).path.name}</span>
                        <span className='connectome-notes-group-detail'>{this.index.getWorkspaceRelativePath(new URI(sourceUri))}</span>
                    </div>
                    {list.map((m, i) =>
                        <div className='connectome-notes-occurrence connectome-notes-occurrence-row' key={i}>
                            <span className='connectome-notes-snippet' onClick={() => this.open(m)}
                                title={`Line ${m.line + 1}`}>
                                {m.lineText.substring(0, m.startCol).trimStart()}
                                <span className='connectome-notes-snippet-highlight'>{m.matchedText}</span>
                                {m.lineText.substring(m.endCol)}
                            </span>
                            <button className='theia-button secondary connectome-notes-link-btn'
                                title='Convert mention to wikilink'
                                onClick={e => { e.stopPropagation(); this.linkThis(m); }}>
                                Link
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>;
    }

    protected open(m: UnlinkedMention): void {
        this.editorManager.open(new URI(m.sourceUri), {
            selection: {
                start: { line: m.line, character: m.startCol },
                end: { line: m.line, character: m.endCol }
            }
        });
    }

    protected async linkThis(m: UnlinkedMention): Promise<void> {
        if (!this.currentNote) {
            return;
        }
        const targetName = this.currentNote.path.name;
        const widget = await this.editorManager.open(new URI(m.sourceUri), {
            selection: {
                start: { line: m.line, character: m.startCol },
                end: { line: m.line, character: m.endCol }
            }
        });
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return;
        }
        const control = editor.getControl();
        const range = new monaco.Range(m.line + 1, m.startCol + 1, m.line + 1, m.endCol + 1);
        const replacement = m.matchedText.toLowerCase() === targetName.toLowerCase()
            ? `[[${targetName}]]`
            : `[[${targetName}|${m.matchedText}]]`;
        control.executeEdits('connectome-link-mention', [{ range, text: replacement }]);
    }
}
