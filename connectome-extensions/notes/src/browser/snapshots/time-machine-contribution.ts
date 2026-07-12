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
import { TIME_MACHINE_VIEW_CONTAINER_ID, TIME_MACHINE_VIEW_RANK } from './time-machine-view-container';

@injectable()
export class TimeMachineContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    constructor() {
        super({
            widgetId: TIME_MACHINE_VIEW_CONTAINER_ID,
            widgetName: 'Time Machine',
            defaultWidgetOptions: { area: 'left', rank: TIME_MACHINE_VIEW_RANK },
            toggleCommandId: 'connectome.timeMachine.sidebar'
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
            TIME_MACHINE_VIEW_CONTAINER_ID,
            TIME_MACHINE_VIEW_RANK
        );
    }
}
