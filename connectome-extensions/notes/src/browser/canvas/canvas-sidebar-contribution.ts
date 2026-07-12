import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    ApplicationShell,
    FrontendApplicationContribution,
    ViewContainer,
    Widget,
    WidgetManager,
    codicon
} from '@theia/core/lib/browser';
import { Command, CommandRegistry, CommandService } from '@theia/core/lib/common';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ensureLeftActivity } from '../activity/ensure-left-activity';
import {
    CANVAS_SIDEBAR_VIEW_CONTAINER_ID,
    CANVAS_SIDEBAR_VIEW_RANK
} from './canvas-sidebar-view-container';
import { CanvasCommands } from './canvas-contribution';
import { RecentCanvasesWidget } from './recent-canvases-widget';

export namespace CanvasSidebarCommands {
    export const NEW_TOOLBAR: Command = {
        id: 'connectome.canvas.sidebar.new.toolbar',
        iconClass: codicon('add')
    };
}

@injectable()
export class CanvasSidebarContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    constructor() {
        super({
            widgetId: CANVAS_SIDEBAR_VIEW_CONTAINER_ID,
            widgetName: 'Canvas',
            defaultWidgetOptions: { area: 'left', rank: CANVAS_SIDEBAR_VIEW_RANK },
            toggleCommandId: 'connectome.canvas.sidebar'
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
        commands.registerCommand(CanvasSidebarCommands.NEW_TOOLBAR, {
            execute: () => this.commandService.executeCommand(CanvasCommands.NEW.id),
            isEnabled: widget => this.isCanvasToolbarWidget(widget),
            isVisible: widget => this.isCanvasToolbarWidget(widget)
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: CanvasSidebarCommands.NEW_TOOLBAR.id,
            command: CanvasSidebarCommands.NEW_TOOLBAR.id,
            tooltip: 'New Canvas',
            priority: 0
        });
    }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(
            this.shell,
            this.widgetManager,
            CANVAS_SIDEBAR_VIEW_CONTAINER_ID,
            CANVAS_SIDEBAR_VIEW_RANK
        );
    }

    protected isCanvasToolbarWidget(widget?: Widget): boolean {
        if (!widget) {
            return false;
        }
        if (widget.id === CANVAS_SIDEBAR_VIEW_CONTAINER_ID || widget.id === RecentCanvasesWidget.ID) {
            return true;
        }
        const trackable = (widget as ViewContainer).getTrackableWidgets?.();
        return Array.isArray(trackable) && trackable.some(w => w.id === RecentCanvasesWidget.ID);
    }
}
