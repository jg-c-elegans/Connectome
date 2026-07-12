import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { WebSectionWidget } from './web-section-widget';
import { WebListItem, WebListKind } from './browser-view-container';

@injectable()
export class DownloadsWidget extends WebSectionWidget {
    static readonly ID = 'connectome-web-downloads';
    static readonly LABEL = 'Downloads';

    protected readonly sectionKind: WebListKind = 'downloads';
    protected readonly sectionLabel = DownloadsWidget.LABEL;
    protected readonly sectionIcon = 'desktop-download';
    protected readonly emptyHint = 'No downloads yet.';

    protected get sectionId(): string {
        return DownloadsWidget.ID;
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.title.closable = true;
    }

    protected getItems(): WebListItem[] {
        return this.service.snapshot.downloads.map(d => ({
            kind: 'downloads',
            id: d.id,
            title: d.filename,
            url: d.path,
            path: d.state === 'completed' ? d.path : undefined,
            downloadState: d.state,
            receivedBytes: d.receivedBytes,
            totalBytes: d.totalBytes
        }));
    }

    protected override itemIcon(): string {
        return 'desktop-download';
    }

    protected override itemDetail(item: WebListItem): string {
        if (item.downloadState === 'progressing') {
            if (item.totalBytes && item.totalBytes > 0) {
                return `Downloading ${Math.min(100, Math.round(((item.receivedBytes || 0) / item.totalBytes) * 100))}%`;
            }
            return `Downloading ${this.formatBytes(item.receivedBytes || 0)}`;
        }
        if (item.downloadState === 'completed') {
            return item.path || 'Completed';
        }
        return item.downloadState === 'cancelled' ? 'Cancelled' : 'Failed';
    }

    protected formatBytes(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
}
