import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { TagsWidget } from './tags-widget';
import { NOTES_VIEW_CONTAINER_ID } from '../notes-view-container';

@injectable()
export class TagsViewContribution extends AbstractViewContribution<TagsWidget> implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: TagsWidget.ID,
            viewContainerId: NOTES_VIEW_CONTAINER_ID,
            widgetName: TagsWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 300 },
            toggleCommandId: 'connectomeNotes.tags.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView();
    }
}
