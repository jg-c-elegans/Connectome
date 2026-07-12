import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PropertiesWidget } from './properties-widget';
import { NOTES_VIEW_CONTAINER_ID } from '../notes-view-container';

@injectable()
export class PropertiesViewContribution extends AbstractViewContribution<PropertiesWidget>
    implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: PropertiesWidget.ID,
            viewContainerId: NOTES_VIEW_CONTAINER_ID,
            widgetName: PropertiesWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 300 },
            toggleCommandId: 'connectomeNotes.properties.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView();
    }
}
