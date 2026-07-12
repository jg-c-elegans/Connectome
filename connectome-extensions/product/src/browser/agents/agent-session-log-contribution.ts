import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    ApplicationShell,
    FrontendApplicationContribution,
    ViewContainer,
    WidgetManager
} from '@theia/core/lib/browser';
import { ensureLeftActivity } from './ensure-left-activity';
import {
    AGENT_SESSION_LOG_VIEW_CONTAINER_ID,
    AGENT_SESSION_LOG_VIEW_RANK
} from './agent-session-log-view-container';

@injectable()
export class AgentSessionLogContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    constructor() {
        super({
            widgetId: AGENT_SESSION_LOG_VIEW_CONTAINER_ID,
            widgetName: 'Agent Sessions',
            defaultWidgetOptions: { area: 'left', rank: AGENT_SESSION_LOG_VIEW_RANK },
            toggleCommandId: 'connectome.agentSessionLog.sidebar'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.ensureActivity();
    }

    onStart(): void {
        void this.ensureActivity();
    }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(
            this.shell,
            this.widgetManager,
            AGENT_SESSION_LOG_VIEW_CONTAINER_ID,
            AGENT_SESSION_LOG_VIEW_RANK
        );
    }
}
