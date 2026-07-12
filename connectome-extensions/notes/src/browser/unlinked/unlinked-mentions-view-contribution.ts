import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { UnlinkedMentionsWidget } from './unlinked-mentions-widget';
import { NOTES_VIEW_CONTAINER_ID } from '../notes-view-container';

@injectable()
export class UnlinkedMentionsViewContribution extends AbstractViewContribution<UnlinkedMentionsWidget>
    implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: UnlinkedMentionsWidget.ID,
            viewContainerId: NOTES_VIEW_CONTAINER_ID,
            widgetName: UnlinkedMentionsWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 300 },
            toggleCommandId: 'connectomeNotes.unlinkedMentions.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView();
    }
}
