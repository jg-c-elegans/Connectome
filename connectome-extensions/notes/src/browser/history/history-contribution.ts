import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    ApplicationShell,
    FrontendApplicationContribution,
    ViewContainer,
    WidgetManager
} from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common';
import { ensureLeftActivity } from '../activity/ensure-left-activity';
import { HISTORY_VIEW_CONTAINER_ID, HISTORY_VIEW_RANK } from './history-view-container';

@injectable()
export class HistoryContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    constructor() {
        super({
            widgetId: HISTORY_VIEW_CONTAINER_ID,
            widgetName: 'History',
            defaultWidgetOptions: { area: 'left', rank: HISTORY_VIEW_RANK },
            toggleCommandId: 'connectome.history.sidebar'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.ensureActivity();
    }

    onStart(): void {
        void this.ensureActivity();
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
    }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(
            this.shell,
            this.widgetManager,
            HISTORY_VIEW_CONTAINER_ID,
            HISTORY_VIEW_RANK
        );
    }
}
