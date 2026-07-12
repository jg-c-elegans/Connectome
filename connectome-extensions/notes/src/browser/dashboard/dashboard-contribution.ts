import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    ApplicationShell,
    FrontendApplicationContribution,
    OpenViewArguments,
    ViewContainer,
    WidgetManager
} from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common';
import { ensureLeftActivity } from '../activity/ensure-left-activity';
import { DASHBOARD_VIEW_CONTAINER_ID, DASHBOARD_VIEW_RANK } from './dashboard-view-container';
import { DashboardWindowWidget } from './dashboard-window-widget';

@injectable()
export class DashboardContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    constructor() {
        super({
            widgetId: DASHBOARD_VIEW_CONTAINER_ID,
            widgetName: 'Dashboard',
            defaultWidgetOptions: { area: 'left', rank: DASHBOARD_VIEW_RANK },
            toggleCommandId: 'connectome.dashboard.sidebar'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.ensureActivity();
    }

    onStart(): void {
        void this.ensureActivity();
        // Clicking the rail icon activates the tab directly via Lumino's TabBar, bypassing
        // the toggle command (and thus openView()) entirely — hook the signal so the window
        // opens on a plain rail click too, not just via the View menu/command palette.
        this.shell.leftPanelHandler.tabBar.currentChanged.connect((_sender, args) => {
            if (args.currentTitle?.owner.id === DASHBOARD_VIEW_CONTAINER_ID) {
                void this.ensureDashboardWindow();
            }
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
    }

    override async openView(args: Partial<OpenViewArguments> = {}): Promise<ViewContainer> {
        const view = await super.openView({ activate: true, ...args });
        await this.ensureDashboardWindow();
        return view;
    }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(
            this.shell,
            this.widgetManager,
            DASHBOARD_VIEW_CONTAINER_ID,
            DASHBOARD_VIEW_RANK
        );
    }

    protected async ensureDashboardWindow(): Promise<void> {
        const existing = this.shell.getWidgetById(DashboardWindowWidget.ID);
        if (existing && existing.isAttached) {
            this.shell.activateWidget(existing.id);
            return;
        }
        const widget = existing || await this.widgetManager.getOrCreateWidget(DashboardWindowWidget.ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main', mode: 'tab-after' });
        }
        this.shell.activateWidget(widget.id);
    }
}
