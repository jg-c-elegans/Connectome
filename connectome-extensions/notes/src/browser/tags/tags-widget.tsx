import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { NoteIndexService, TagInfo, TagOccurrence } from '../note-index-service';

@injectable()
export class TagsWidget extends ReactWidget {

    static readonly ID = 'connectome-tags';
    static readonly LABEL = 'Tags';

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    protected readonly expanded = new Set<string>();

    @postConstruct()
    protected init(): void {
        this.id = TagsWidget.ID;
        this.title.label = TagsWidget.LABEL;
        this.title.caption = 'All #tags across the workspace';
        this.title.iconClass = codicon('tag');
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
        const tags = [...this.index.getAllTags().entries()].sort(([a], [b]) => a.localeCompare(b));
        if (tags.length === 0) {
            return <div className='connectome-notes-empty'>No tags yet.<br />
                Add #tags to your notes to see them here.</div>;
        }
        return <div className='connectome-notes-list'>
            {tags.map(([key, info]) => this.renderTag(key, info))}
        </div>;
    }

    protected renderTag(key: string, info: TagInfo): React.ReactNode {
        const isExpanded = this.expanded.has(key);
        const files = this.groupByFile(info.occurrences);
        return <div className='connectome-notes-group' key={key}>
            <div className='connectome-notes-tag-row' onClick={() => this.toggle(key)}>
                <span className={codicon(isExpanded ? 'chevron-down' : 'chevron-right') + ' connectome-notes-icon'} />
                <span className='connectome-notes-tag-pill'>#{info.display}</span>
                <span className='connectome-notes-count'>{files.length}</span>
            </div>
            {isExpanded && files.map(([sourceUri, occurrences]) =>
                <div className='connectome-notes-occurrence' key={sourceUri}
                    title={this.index.getWorkspaceRelativePath(new URI(sourceUri))}
                    onClick={() => this.open(occurrences[0])}>
                    <span className={codicon('markdown') + ' connectome-notes-icon'} />
                    <span className='connectome-notes-group-name'>{new URI(sourceUri).path.name}</span>
                    {occurrences.length > 1 &&
                        <span className='connectome-notes-count'>{occurrences.length}</span>}
                </div>
            )}
        </div>;
    }

    protected groupByFile(occurrences: TagOccurrence[]): [string, TagOccurrence[]][] {
        const byFile = new Map<string, TagOccurrence[]>();
        for (const occurrence of occurrences) {
            const list = byFile.get(occurrence.sourceUri) ?? [];
            list.push(occurrence);
            byFile.set(occurrence.sourceUri, list);
        }
        return [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b));
    }

    protected toggle(key: string): void {
        if (this.expanded.has(key)) {
            this.expanded.delete(key);
        } else {
            this.expanded.add(key);
        }
        this.update();
    }

    protected open(occurrence: TagOccurrence): void {
        this.editorManager.open(new URI(occurrence.sourceUri), {
            selection: {
                start: { line: occurrence.line, character: occurrence.startCol },
                end: { line: occurrence.line, character: occurrence.startCol }
            }
        });
    }
}
