import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { GraphService } from './graph-service';

@injectable()
export class GraphFiltersWidget extends ReactWidget {

    static readonly ID = 'connectome-graph-filters';
    static readonly LABEL = 'Filters';

    @inject(GraphService)
    protected readonly graphService: GraphService;

    @postConstruct()
    protected init(): void {
        this.id = GraphFiltersWidget.ID;
        this.title.label = GraphFiltersWidget.LABEL;
        this.title.caption = 'Filter and manage the note graph';
        this.title.iconClass = codicon('filter');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.graphService.onDidChangeGraph(() => this.update()));
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const folders = this.graphService.getAllFolders();
        const tags = this.graphService.getAllTags();
        const hidden = this.graphService.getHiddenNodes();

        return <div className='connectome-graph-filters'>
            <div className='connectome-graph-filter-row'>
                <label htmlFor='connectome-graph-folder-select'>Folder</label>
                <select id='connectome-graph-folder-select'
                    className='theia-select'
                    value={this.graphService.filterFolder ?? ''}
                    onChange={e => {
                        this.graphService.setFilterFolder(e.target.value || undefined);
                    }}>
                    <option value=''>All folders</option>
                    {folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
                </select>
            </div>

            {tags.length > 0 && <div className='connectome-graph-filter-row'>
                <label>Tags</label>
                <div className='connectome-graph-tag-list'>
                    {tags.map(tag => {
                        const active = this.graphService.filterTags.has(tag.toLowerCase());
                        return <button key={tag}
                            className={'connectome-graph-tag-chip' + (active ? ' active' : '')}
                            onClick={() => this.graphService.toggleFilterTag(tag)}>
                            #{tag}
                        </button>;
                    })}
                </div>
            </div>}

            <div className='connectome-graph-filter-row checkboxes'>
                <label>
                    <input type='checkbox'
                        checked={this.graphService.showOrphansOnly}
                        onChange={e => this.graphService.setShowOrphansOnly(e.target.checked)} />
                    Orphans only
                </label>
                <label>
                    <input type='checkbox'
                        checked={this.graphService.showHighlyConnectedOnly}
                        onChange={e => this.graphService.setShowHighlyConnectedOnly(e.target.checked)} />
                    Highly connected only
                </label>
            </div>

            <div className='connectome-graph-filter-row'>
                <label>Hidden ({hidden.length})</label>
                {hidden.length === 0
                    ? <div className='connectome-notes-empty small'>No hidden notes.</div>
                    : <div className='connectome-notes-list'>
                        {hidden.map(({ uri, label }) => <div className='connectome-notes-occurrence' key={uri.toString()}>
                            <span className={codicon('eye-closed') + ' connectome-notes-icon'} />
                            <span className='connectome-notes-group-name'>{label}</span>
                            <button className='theia-button secondary connectome-graph-unhide-btn'
                                onClick={() => void this.graphService.unhideNode(uri)}
                                title='Show this note in the graph again'>
                                Unhide
                            </button>
                        </div>)}
                    </div>}
            </div>
        </div>;
    }
}
