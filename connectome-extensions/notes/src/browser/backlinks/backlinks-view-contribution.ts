import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { BacklinksWidget } from './backlinks-widget';
import { NOTES_VIEW_CONTAINER_ID } from '../notes-view-container';

@injectable()
export class BacklinksViewContribution extends AbstractViewContribution<BacklinksWidget> implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: BacklinksWidget.ID,
            viewContainerId: NOTES_VIEW_CONTAINER_ID,
            widgetName: BacklinksWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 300 },
            toggleCommandId: 'connectomeNotes.backlinks.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView();
    }
}
