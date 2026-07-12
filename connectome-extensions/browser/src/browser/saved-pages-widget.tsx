import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { WebSectionWidget } from './web-section-widget';
import { WebListItem, WebListKind } from './browser-view-container';

@injectable()
export class SavedPagesWidget extends WebSectionWidget {
    static readonly ID = 'connectome-web-saved';
    static readonly LABEL = 'Saved Pages';

    protected readonly sectionKind: WebListKind = 'savedPages';
    protected readonly sectionLabel = SavedPagesWidget.LABEL;
    protected readonly sectionIcon = 'save';
    protected readonly emptyHint = 'No saved pages. Use Save on the browser toolbar to store a page offline.';

    protected get sectionId(): string {
        return SavedPagesWidget.ID;
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.title.closable = true;
    }

    protected getItems(): WebListItem[] {
        return this.service.snapshot.savedPages.map(p => ({
            kind: 'savedPages',
            id: p.id,
            title: p.title,
            url: p.url,
            path: p.path
        }));
    }

    protected override itemIcon(): string {
        return 'file';
    }

    protected override itemDetail(item: WebListItem): string {
        return item.path || item.url;
    }
}
