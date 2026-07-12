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
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ensureLeftActivity } from '../activity/ensure-left-activity';
import { CALENDAR_VIEW_CONTAINER_ID, CALENDAR_VIEW_RANK } from './calendar-view-container';
import { CalendarService } from './calendar-service';
import { CalendarWidget } from './calendar-widget';
import { RecentDailiesWidget } from './recent-dailies-widget';

export namespace CalendarCommands {
    export const OPEN_TODAY: Command = {
        id: 'connectome.calendar.openToday',
        label: 'Calendar: Open Today\'s Note'
    };
    export const OPEN_TODAY_TOOLBAR: Command = {
        id: 'connectome.calendar.openToday.toolbar',
        iconClass: codicon('calendar')
    };
}

@injectable()
export class CalendarContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CalendarService)
    protected readonly calendar: CalendarService;

    constructor() {
        super({
            widgetId: CALENDAR_VIEW_CONTAINER_ID,
            widgetName: 'Calendar',
            defaultWidgetOptions: { area: 'left', rank: CALENDAR_VIEW_RANK },
            toggleCommandId: 'connectome.calendar.sidebar'
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
        commands.registerCommand(CalendarCommands.OPEN_TODAY, {
            execute: () => this.calendar.openToday()
        });
        commands.registerCommand(CalendarCommands.OPEN_TODAY_TOOLBAR, {
            execute: () => this.calendar.openToday(),
            isEnabled: widget => this.isCalendarToolbarWidget(widget),
            isVisible: widget => this.isCalendarToolbarWidget(widget)
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: CalendarCommands.OPEN_TODAY_TOOLBAR.id,
            command: CalendarCommands.OPEN_TODAY_TOOLBAR.id,
            tooltip: 'Open Today\'s Note',
            priority: 0
        });
    }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(
            this.shell,
            this.widgetManager,
            CALENDAR_VIEW_CONTAINER_ID,
            CALENDAR_VIEW_RANK
        );
    }

    protected isCalendarToolbarWidget(widget?: Widget): boolean {
        if (!widget) {
            return false;
        }
        const ids = [CALENDAR_VIEW_CONTAINER_ID, CalendarWidget.ID, RecentDailiesWidget.ID];
        if (ids.includes(widget.id)) {
            return true;
        }
        const trackable = (widget as ViewContainer).getTrackableWidgets?.();
        return Array.isArray(trackable) && trackable.some(w => ids.includes(w.id));
    }
}
