import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/lib/browser';
import { WebSectionWidget } from './web-section-widget';
import { WebListItem, WebListKind } from './browser-view-container';

/** Fired when the Web side area becomes visible (activity-bar click). */
export const WEB_SIDEBAR_SHOWN = 'connectome-browser-sidebar-shown';

@injectable()
export class BookmarksWidget extends WebSectionWidget {
    static readonly ID = 'connectome-web-bookmarks';
    static readonly LABEL = 'Bookmarks';

    protected readonly sectionKind: WebListKind = 'bookmarks';
    protected readonly sectionLabel = BookmarksWidget.LABEL;
    protected readonly sectionIcon = 'star-full';
    protected readonly emptyHint = 'No bookmarks yet. Use the star on the browser toolbar to pin a page.';
    protected override readonly showSearchBox = true;

    protected get sectionId(): string {
        return BookmarksWidget.ID;
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.title.closable = true;
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        window.dispatchEvent(new CustomEvent(WEB_SIDEBAR_SHOWN));
    }

    protected getItems(): WebListItem[] {
        return this.service.snapshot.bookmarks
            .filter(b => this.matchesQuery(b.title, b.url))
            .map(b => ({
                kind: 'bookmarks',
                id: b.id,
                title: b.title,
                url: b.url
            }));
    }

    protected override itemIcon(): string {
        return 'star-full';
    }
}
