import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message, ReactWidget, codicon, ContextMenuRenderer } from '@theia/core/lib/browser';
import { ScriptsService } from './scripts-service';
import { SCRIPTS_CONTEXT_MENU, ScriptItem } from './scripts-view-container';

/** Shared list UI for the Scripts ViewContainer parts (All Scripts, Favorites). */
@injectable()
export abstract class ScriptsSectionWidget extends ReactWidget {

    @inject(ScriptsService)
    protected readonly service: ScriptsService;

    @inject(ContextMenuRenderer)
    protected readonly contextMenu: ContextMenuRenderer;

    protected abstract readonly sectionLabel: string;
    protected abstract readonly sectionIcon: string;
    protected abstract readonly emptyHint: string;
    protected abstract readonly showSortToggle: boolean;

    @postConstruct()
    protected init(): void {
        this.id = this.sectionId;
        this.title.label = this.sectionLabel;
        this.title.caption = this.sectionLabel;
        this.title.iconClass = codicon(this.sectionIcon);
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.addClass('connectome-scripts-widget');
        this.toDispose.push(this.service.onDidChange(() => this.update()));
        this.update();
    }

    protected abstract get sectionId(): string;

    protected abstract getItems(): ScriptItem[];

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const items = this.getItems();
        return <div className='connectome-scripts-section'>
            {this.showSortToggle && this.renderSortToggle()}
            {items.length === 0
                ? <div className='connectome-notes-empty'>{this.emptyHint}</div>
                : <div className='connectome-notes-list connectome-scripts-list'>
                    {items.map(item => this.renderItem(item))}
                </div>}
        </div>;
    }

    protected renderSortToggle(): React.ReactNode {
        const mode = this.service.getSortMode();
        return <div className='connectome-scripts-sort'>
            <span
                className={`connectome-scripts-sort-option ${mode === 'alphabetical' ? 'active' : ''}`}
                onClick={() => this.service.setSortMode('alphabetical')}
            >A–Z</span>
            <span
                className={`connectome-scripts-sort-option ${mode === 'recent' ? 'active' : ''}`}
                onClick={() => this.service.setSortMode('recent')}
            >Recent</span>
        </div>;
    }

    protected renderItem(item: ScriptItem): React.ReactNode {
        return <div
            className='connectome-notes-occurrence connectome-scripts-item'
            key={item.name}
            title={item.name}
            onContextMenu={e => this.showContextMenu(e, item)}
        >
            <span className={codicon(item.language === 'python' ? 'symbol-misc' : 'terminal') + ' connectome-notes-icon'} />
            <span className='connectome-notes-group-name'>{item.name}</span>
            <span
                className={codicon('play') + ' connectome-scripts-run-btn'}
                title='Run'
                onClick={e => { e.stopPropagation(); this.runItem(item); }}
            />
        </div>;
    }

    protected runItem(item: ScriptItem): void {
        window.dispatchEvent(new CustomEvent('connectome-scripts-run', { detail: item.name }));
    }

    protected showContextMenu(event: React.MouseEvent, item: ScriptItem): void {
        event.preventDefault();
        event.stopPropagation();
        this.contextMenu.render({
            menuPath: SCRIPTS_CONTEXT_MENU,
            anchor: event.nativeEvent,
            args: [item],
            context: this.node
        });
    }
}
