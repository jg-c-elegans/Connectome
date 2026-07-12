import { injectable } from '@theia/core/shared/inversify';
import { ClipboardSectionWidget } from './clipboard-section-widget';
import { CLIPBOARD_SIDEBAR_LIMIT } from './clipboard-view-container';
import { ClipboardEntry } from '../common/clipboard-api';

@injectable()
export class ClipboardHistoryWidget extends ClipboardSectionWidget {
    static readonly ID = 'connectome-clipboard-history';
    static readonly LABEL = 'Clipboard';

    protected readonly sectionLabel = ClipboardHistoryWidget.LABEL;
    protected readonly sectionIcon = 'clippy';
    protected readonly emptyHint = 'Nothing copied yet. Recent clipboard items will appear here.';

    protected get sectionId(): string {
        return ClipboardHistoryWidget.ID;
    }

    protected getItems(): ClipboardEntry[] {
        return this.service.getHistory().slice(0, CLIPBOARD_SIDEBAR_LIMIT);
    }
}
