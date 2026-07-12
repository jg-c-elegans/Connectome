import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { WebSectionWidget } from './web-section-widget';
import { WebListItem, WebListKind } from './browser-view-container';

@injectable()
export class HistoryWidget extends WebSectionWidget {
    static readonly ID = 'connectome-web-history';
    static readonly LABEL = 'History';

    protected readonly sectionKind: WebListKind = 'history';
    protected readonly sectionLabel = HistoryWidget.LABEL;
    protected readonly sectionIcon = 'history';
    protected readonly emptyHint = 'No history yet. Visited pages will show up here.';
    protected override readonly showSearchBox = true;

    protected get sectionId(): string {
        return HistoryWidget.ID;
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.title.closable = true;
    }

    protected getItems(): WebListItem[] {
        return this.service.snapshot.history
            .filter(h => this.matchesQuery(h.title, h.url))
            .slice(0, 200)
            .map(h => ({
                kind: 'history',
                id: h.id,
                title: h.title,
                url: h.url
            }));
    }

    protected override itemIcon(): string {
        return 'history';
    }
}
