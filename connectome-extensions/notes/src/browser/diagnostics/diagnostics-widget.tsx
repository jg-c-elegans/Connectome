import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { BrokenLink, NoteIndexService } from '../note-index-service';

@injectable()
export class DiagnosticsWidget extends ReactWidget {

    static readonly ID = 'connectome-notes-diagnostics';
    static readonly LABEL = 'Notes Diagnostics';

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @postConstruct()
    protected init(): void {
        this.id = DiagnosticsWidget.ID;
        this.title.label = DiagnosticsWidget.LABEL;
        this.title.caption = 'Broken wikilinks and orphan notes';
        this.title.iconClass = codicon('warning');
        this.title.closable = true;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.index.onDidUpdate(() => this.update()));
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const broken = this.index.getBrokenLinks();
        const orphans = this.index.getOrphanNotes();
        if (broken.length === 0 && orphans.length === 0) {
            return <div className='connectome-notes-empty'>No broken wikilinks or orphan notes.</div>;
        }
        return <div className='connectome-notes-list'>
            <div className='connectome-notes-section-label'>Broken links ({broken.length})</div>
            {broken.length === 0 &&
                <div className='connectome-notes-empty'>None</div>}
            {broken.map((b, i) => this.renderBroken(b, i))}
            <div className='connectome-notes-section-label'>Orphan notes ({orphans.length})</div>
            {orphans.length === 0 &&
                <div className='connectome-notes-empty'>None</div>}
            {orphans.map(uri =>
                <div className='connectome-notes-occurrence' key={uri.toString()}
                    onClick={() => this.editorManager.open(uri)}>
                    <span className={codicon('markdown') + ' connectome-notes-icon'} />
                    <span className='connectome-notes-group-name'>{uri.path.name}</span>
                    <span className='connectome-notes-group-detail'>{this.index.getWorkspaceRelativePath(uri)}</span>
                </div>
            )}
        </div>;
    }

    protected renderBroken(b: BrokenLink, key: number): React.ReactNode {
        const source = new URI(b.sourceUri);
        return <div className='connectome-notes-occurrence' key={key}
            title={`Line ${b.link.line + 1}`}
            onClick={() => this.editorManager.open(source, {
                selection: {
                    start: { line: b.link.line, character: b.link.startCol },
                    end: { line: b.link.line, character: b.link.endCol }
                }
            })}>
            <span className={codicon('error') + ' connectome-notes-icon connectome-notes-error-icon'} />
            <span className='connectome-notes-snippet'>
                <span className='connectome-notes-group-name'>{source.path.name}</span>
                {' '}
                <span className='connectome-notes-snippet-highlight'>
                    {b.link.isEmbed ? '!' : ''}[[{b.link.innerText}]]
                </span>
            </span>
        </div>;
    }
}
