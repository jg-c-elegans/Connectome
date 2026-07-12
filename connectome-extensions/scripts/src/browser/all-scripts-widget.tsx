import { injectable } from '@theia/core/shared/inversify';
import { ScriptsSectionWidget } from './scripts-section-widget';
import { ScriptItem } from './scripts-view-container';

@injectable()
export class AllScriptsWidget extends ScriptsSectionWidget {
    static readonly ID = 'connectome-scripts-all';
    static readonly LABEL = 'Scripts';

    protected readonly sectionLabel = AllScriptsWidget.LABEL;
    protected readonly sectionIcon = 'play-circle';
    protected readonly emptyHint = 'No scripts saved yet. Right-click a .py or .ps1 file in the editor and choose "Save to Scripts".';
    protected readonly showSortToggle = true;

    protected get sectionId(): string {
        return AllScriptsWidget.ID;
    }

    protected getItems(): ScriptItem[] {
        return this.service.getItems();
    }
}
