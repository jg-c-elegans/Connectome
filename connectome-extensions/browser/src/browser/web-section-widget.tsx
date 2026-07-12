import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message, ReactWidget, codicon, ContextMenuRenderer } from '@theia/core/lib/browser';
import { BrowserService } from './browser-service';
import { WEB_CONTEXT_MENU, WebListItem, WebListKind } from './browser-view-container';

/**
 * Shared list UI for Web ViewContainer parts (Bookmarks, History, Saved, Downloads).
 * Matches Notes/Explorer list styling: click to open, right-click for context menu.
 */
@injectable()
export abstract class WebSectionWidget extends ReactWidget {

    @inject(BrowserService)
    protected readonly service: BrowserService;

    @inject(ContextMenuRenderer)
    protected readonly contextMenu: ContextMenuRenderer;

    protected abstract readonly sectionKind: WebListKind;
    protected abstract readonly sectionLabel: string;
    protected abstract readonly sectionIcon: string;
    protected abstract readonly emptyHint: string;

    /** Current search query typed into the section's search box (case-insensitive substring match). */
    protected query: string = '';

    @postConstruct()
    protected init(): void {
        this.id = this.sectionId;
        this.title.label = this.sectionLabel;
        this.title.caption = this.sectionLabel;
        this.title.iconClass = codicon(this.sectionIcon);
        this.title.closable = false;
        this.addClass('connectome-web-widget');
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.service.onDidChange(() => this.update()));
        this.update();
    }

    protected abstract get sectionId(): string;

    protected abstract getItems(): WebListItem[];

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const items = this.getItems();
        return <div className='connectome-web-section'>
            {this.renderSearchBox()}
            {items.length === 0
                ? <div className='connectome-notes-empty'>{this.query ? 'No matches.' : this.emptyHint}</div>
                : <div className='connectome-notes-list connectome-web-list'>
                    {items.map(item => this.renderItem(item))}
                </div>}
        </div>;
    }

    /** Renders a simple search box used to filter this section's items by title/URL. Override `showSearchBox` to hide it for a subclass. */
    protected renderSearchBox(): React.ReactNode {
        if (!this.showSearchBox) {
            return undefined;
        }
        return <div className='connectome-web-search'>
            <input
                type='text'
                className='theia-input connectome-web-search-input'
                placeholder={`Search ${this.sectionLabel.toLowerCase()}...`}
                value={this.query}
                onChange={e => {
                    this.query = e.target.value;
                    this.update();
                }}
            />
        </div>;
    }

    protected readonly showSearchBox: boolean = false;

    /** Case-insensitive substring match against an item's title and URL. */
    protected matchesQuery(title: string, url: string): boolean {
        if (!this.query) {
            return true;
        }
        const q = this.query.toLowerCase();
        return title.toLowerCase().includes(q) || url.toLowerCase().includes(q);
    }

    protected renderItem(item: WebListItem): React.ReactNode {
        return <div
            className='connectome-notes-occurrence connectome-web-item'
            key={item.id}
            title={item.url}
            onClick={() => this.openItem(item)}
            onContextMenu={e => this.showContextMenu(e, item)}
        >
            <span className={codicon(this.itemIcon(item)) + ' connectome-notes-icon'} />
            <span className='connectome-notes-group-name'>{item.title || item.url}</span>
            <span className='connectome-notes-group-detail'>{this.itemDetail(item)}</span>
        </div>;
    }

    protected itemIcon(_item: WebListItem): string {
        return 'link';
    }

    protected itemDetail(item: WebListItem): string {
        try {
            return new URL(item.url).hostname || item.url;
        } catch {
            return item.url;
        }
    }

    protected openItem(item: WebListItem): void {
        if (item.kind === 'downloads' && item.path && item.downloadState === 'completed') {
            void window.electronConnectomeBrowser?.openPath(item.path);
            return;
        }
        if (item.kind === 'savedPages' && item.path) {
            const fileUrl = item.url.startsWith('file:')
                ? item.url
                : `file:///${item.path.replace(/\\/g, '/')}`;
            if (this.service.active) {
                this.service.active.navigate(fileUrl);
            } else {
                window.dispatchEvent(new CustomEvent('connectome-browser-new-tab', { detail: fileUrl }));
            }
            return;
        }
        if (this.service.active) {
            this.service.active.navigate(item.url);
        } else {
            window.dispatchEvent(new CustomEvent('connectome-browser-new-tab', { detail: item.url }));
        }
    }

    protected showContextMenu(event: React.MouseEvent, item: WebListItem): void {
        event.preventDefault();
        event.stopPropagation();
        this.contextMenu.render({
            menuPath: WEB_CONTEXT_MENU,
            anchor: event.nativeEvent,
            args: [item],
            context: this.node
        });
    }
}
