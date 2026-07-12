import { injectable } from '@theia/core/shared/inversify';
import { ClipboardSectionWidget } from './clipboard-section-widget';
import { ClipboardEntry } from '../common/clipboard-api';

@injectable()
export class ClipboardSavedWidget extends ClipboardSectionWidget {
    static readonly ID = 'connectome-clipboard-saved';
    static readonly LABEL = 'Saved';

    protected readonly sectionLabel = ClipboardSavedWidget.LABEL;
    protected readonly sectionIcon = 'save';
    protected readonly emptyHint = 'No saved items. Right-click a clipboard item and choose "Save".';

    protected get sectionId(): string {
        return ClipboardSavedWidget.ID;
    }

    protected getItems(): ClipboardEntry[] {
        return this.service.getSaved();
    }
}
