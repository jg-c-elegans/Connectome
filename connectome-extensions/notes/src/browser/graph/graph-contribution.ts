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
import { GRAPH_VIEW_CONTAINER_ID, GRAPH_VIEW_RANK } from './graph-view-container';

@injectable()
export class GraphContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    constructor() {
        super({
            widgetId: GRAPH_VIEW_CONTAINER_ID,
            widgetName: 'Graph',
            defaultWidgetOptions: { area: 'left', rank: GRAPH_VIEW_RANK },
            toggleCommandId: 'connectome.graph.sidebar'
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
            GRAPH_VIEW_CONTAINER_ID,
            GRAPH_VIEW_RANK
        );
    }
}
