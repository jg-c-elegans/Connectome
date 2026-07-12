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
import { TASKS_VIEW_CONTAINER_ID, TASKS_VIEW_RANK } from './tasks-view-container';

@injectable()
export class TasksContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {
    @inject(WidgetManager) protected readonly widgetManager: WidgetManager;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;

    constructor() {
        super({
            widgetId: TASKS_VIEW_CONTAINER_ID,
            widgetName: 'Tasks',
            defaultWidgetOptions: { area: 'left', rank: TASKS_VIEW_RANK },
            toggleCommandId: 'connectome.tasks.sidebar'
        });
    }

    async initializeLayout(): Promise<void> { await this.ensureActivity(); }
    onStart(): void { this.ensureActivity(); }
    override registerCommands(commands: CommandRegistry): void { super.registerCommands(commands); }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(this.shell, this.widgetManager, TASKS_VIEW_CONTAINER_ID, TASKS_VIEW_RANK);
    }
}
