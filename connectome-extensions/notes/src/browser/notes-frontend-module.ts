import '../../src/browser/style/notes.css';
import '../../src/browser/style/formatting-toolbar.css';
import '../../src/browser/style/rail-views.css';
import '../../src/browser/style/dashboard-window.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import {
    bindViewContribution, FrontendApplicationContribution, KeybindingContribution, OpenHandler,
    ViewContainer, WidgetFactory, WidgetManager
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { NavigatableWidgetOptions } from '@theia/core/lib/browser/navigatable-types';
import URI from '@theia/core/lib/common/uri';
import { NoteIndexService } from './note-index-service';
import { NoteAssetService } from './asset-service';
import { WikilinkNavigationService } from './wikilink-navigation';
import { WikilinkContribution } from './wikilink-contribution';
import { AssetDropContribution } from './asset-drop-contribution';
import { PasteImageContribution } from './paste-image-contribution';
import { EmbedContribution } from './embed-contribution';
import { EmbedPreviewWidget } from './embed/embed-preview-widget';
import { RenameNoteContribution } from './rename-note-contribution';
import { FormattingToolbarContribution } from './formatting-toolbar-contribution';
import { ExportContribution } from './export-contribution';
import { CalloutDecorationContribution } from './callout-decoration-contribution';
import { CodeFenceRunnerContribution } from './code-fence-runner-contribution';
import { TocContribution } from './toc-contribution';
import { MdLinkContribution } from './md-link-contribution';
import { HeadingRefactorContribution } from './heading-refactor-contribution';
import { MarkdownTableContribution } from './markdown-table-contribution';
import { StarredNotesService } from './starred/starred-notes-service';
import { StarredWidget } from './starred/starred-widget';
import { StarredViewContribution } from './starred/starred-view-contribution';
import { CanvasWidget, CANVAS_WIDGET_FACTORY_ID } from './canvas/canvas-widget';
import { CanvasOpenHandler } from './canvas/canvas-open-handler';
import { CanvasContribution } from './canvas/canvas-contribution';
import { RecentCanvasesWidget } from './canvas/recent-canvases-widget';
import { CanvasSidebarContribution } from './canvas/canvas-sidebar-contribution';
import {
    CANVAS_SIDEBAR_VIEW_CONTAINER_ID,
    CANVAS_SIDEBAR_VIEW_CONTAINER_TITLE_OPTIONS
} from './canvas/canvas-sidebar-view-container';
import { BacklinksWidget } from './backlinks/backlinks-widget';
import { BacklinksViewContribution } from './backlinks/backlinks-view-contribution';
import { TagsWidget } from './tags/tags-widget';
import { TagsViewContribution } from './tags/tags-view-contribution';
import { UnlinkedMentionsWidget } from './unlinked/unlinked-mentions-widget';
import { UnlinkedMentionsViewContribution } from './unlinked/unlinked-mentions-view-contribution';
import { PropertiesWidget } from './properties/properties-widget';
import { PropertiesViewContribution } from './properties/properties-view-contribution';
import { DiagnosticsWidget } from './diagnostics/diagnostics-widget';
import { DiagnosticsViewContribution } from './diagnostics/diagnostics-view-contribution';
import { NOTES_VIEW_CONTAINER_ID, NOTES_VIEW_CONTAINER_TITLE_OPTIONS } from './notes-view-container';
import { LibraryRecentNotesWidget } from './library/recent-notes-widget';
import { LibraryStarredWidget } from './library/library-starred-widget';
import { LibraryAllNotesWidget } from './library/all-notes-widget';
import { LibraryOrphanNotesWidget } from './library/orphan-notes-widget';
import { LibraryContribution } from './library/library-contribution';
import {
    LIBRARY_VIEW_CONTAINER_ID,
    LIBRARY_VIEW_CONTAINER_TITLE_OPTIONS
} from './library/library-view-container';
import { CalendarService } from './calendar/calendar-service';
import { CalendarWidget } from './calendar/calendar-widget';
import { RecentDailiesWidget } from './calendar/recent-dailies-widget';
import { CalendarContribution } from './calendar/calendar-contribution';
import {
    CALENDAR_VIEW_CONTAINER_ID,
    CALENDAR_VIEW_CONTAINER_TITLE_OPTIONS
} from './calendar/calendar-view-container';
import { NoteHistoryService } from './history/note-history-service';
import { RecentlyEditedWidget } from './history/recently-edited-widget';
import { RecentlyClosedWidget } from './history/recently-closed-widget';
import { HistoryContribution } from './history/history-contribution';
import {
    HISTORY_VIEW_CONTAINER_ID,
    HISTORY_VIEW_CONTAINER_TITLE_OPTIONS
} from './history/history-view-container';
import { DashboardWidget } from './dashboard/dashboard-widget';
import { DashboardWindowWidget } from './dashboard/dashboard-window-widget';
import { DashboardContribution } from './dashboard/dashboard-contribution';
import {
    DASHBOARD_VIEW_CONTAINER_ID,
    DASHBOARD_VIEW_CONTAINER_TITLE_OPTIONS
} from './dashboard/dashboard-view-container';
import { GraphService } from './graph/graph-service';
import { GraphWidget } from './graph/graph-widget';
import { LocalGraphWidget } from './graph/local-graph-widget';
import { GraphFiltersWidget } from './graph/graph-filters-widget';
import { GraphContribution } from './graph/graph-contribution';
import {
    GRAPH_VIEW_CONTAINER_ID,
    GRAPH_VIEW_CONTAINER_TITLE_OPTIONS
} from './graph/graph-view-container';
import { TaskToggleService } from './tasks/task-toggle-service';
import { TasksWidget } from './tasks/tasks-widget';
import { TasksContribution } from './tasks/tasks-contribution';
import {
    TASKS_VIEW_CONTAINER_ID,
    TASKS_VIEW_CONTAINER_TITLE_OPTIONS
} from './tasks/tasks-view-container';

import { bindNotesPreferences } from './notes-preferences';
import { bindTimeMachinePreferences } from './snapshots/time-machine-preferences';
import { TimeMachineService } from './snapshots/time-machine-service';
import { TimeMachineWidget } from './snapshots/time-machine-widget';
import { TimeMachineContribution } from './snapshots/time-machine-contribution';
import {
    TIME_MACHINE_VIEW_CONTAINER_ID,
    TIME_MACHINE_VIEW_CONTAINER_TITLE_OPTIONS
} from './snapshots/time-machine-view-container';

export default new ContainerModule(bind => {
    bindNotesPreferences(bind);
    bindTimeMachinePreferences(bind);

    bind(NoteIndexService).toSelf().inSingletonScope();
    bind(NoteAssetService).toSelf().inSingletonScope();
    bind(WikilinkNavigationService).toSelf().inSingletonScope();
    bind(StarredNotesService).toSelf().inSingletonScope();
    bind(GraphService).toSelf().inSingletonScope();
    bind(TaskToggleService).toSelf().inSingletonScope();

    bind(WikilinkContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(WikilinkContribution);
    bind(OpenHandler).toService(WikilinkContribution);
    bind(CommandContribution).toService(WikilinkContribution);

    bind(AssetDropContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AssetDropContribution);

    bind(PasteImageContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(PasteImageContribution);
    bind(CommandContribution).toService(PasteImageContribution);

    bind(EmbedContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(EmbedContribution);
    bind(CommandContribution).toService(EmbedContribution);

    bind(EmbedPreviewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: EmbedPreviewWidget.ID,
        createWidget: () => container.get(EmbedPreviewWidget)
    })).inSingletonScope();

    bind(RenameNoteContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(RenameNoteContribution);
    bind(MenuContribution).toService(RenameNoteContribution);

    bind(FormattingToolbarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(FormattingToolbarContribution);
    bind(CommandContribution).toService(FormattingToolbarContribution);
    bind(KeybindingContribution).toService(FormattingToolbarContribution);

    bind(ExportContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ExportContribution);

    bind(CalloutDecorationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CalloutDecorationContribution);

    bind(CodeFenceRunnerContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CodeFenceRunnerContribution);

    bind(TocContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(TocContribution);
    bind(MenuContribution).toService(TocContribution);

    // GFM pipe tables in raw Monaco (insert, format, tab cells, row/col)
    bind(MarkdownTableContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(MarkdownTableContribution);
    bind(MenuContribution).toService(MarkdownTableContribution);
    bind(KeybindingContribution).toService(MarkdownTableContribution);

    // Standard markdown []() completion, navigation, rename + heading refactor
    bind(MdLinkContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MdLinkContribution);
    bind(CommandContribution).toService(MdLinkContribution);
    bind(HeadingRefactorContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(HeadingRefactorContribution);
    bind(MenuContribution).toService(HeadingRefactorContribution);

    // --- Canvas ---
    bind(CanvasWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: CANVAS_WIDGET_FACTORY_ID,
        createWidget: async (options: NavigatableWidgetOptions) => {
            const widget = container.get(CanvasWidget);
            if (options && options.uri) {
                await widget.setUri(new URI(options.uri));
            }
            return widget;
        }
    })).inSingletonScope();
    bind(CanvasOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(CanvasOpenHandler);
    bind(CanvasContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(CanvasContribution);
    bind(MenuContribution).toService(CanvasContribution);

    // --- Canvas activity rail ---
    bind(RecentCanvasesWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: RecentCanvasesWidget.ID,
        createWidget: () => container.get(RecentCanvasesWidget)
    })).inSingletonScope();
    bindViewContribution(bind, CanvasSidebarContribution);
    bind(FrontendApplicationContribution).toService(CanvasSidebarContribution);
    bind(TabBarToolbarContribution).toService(CanvasSidebarContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: CANVAS_SIDEBAR_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: CANVAS_SIDEBAR_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(CANVAS_SIDEBAR_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const recent = await widgetManager.getOrCreateWidget(RecentCanvasesWidget.ID);
            viewContainer.addWidget(recent, { order: 0, canHide: true, initiallyCollapsed: false });
            return viewContainer;
        }
    })).inSingletonScope();

    // --- Library activity rail ---
    bind(LibraryRecentNotesWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: LibraryRecentNotesWidget.ID,
        createWidget: () => container.get(LibraryRecentNotesWidget)
    })).inSingletonScope();
    bind(LibraryStarredWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: LibraryStarredWidget.ID,
        createWidget: () => container.get(LibraryStarredWidget)
    })).inSingletonScope();
    bind(LibraryAllNotesWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: LibraryAllNotesWidget.ID,
        createWidget: () => container.get(LibraryAllNotesWidget)
    })).inSingletonScope();
    bind(LibraryOrphanNotesWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: LibraryOrphanNotesWidget.ID,
        createWidget: () => container.get(LibraryOrphanNotesWidget)
    })).inSingletonScope();
    bindViewContribution(bind, LibraryContribution);
    bind(FrontendApplicationContribution).toService(LibraryContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: LIBRARY_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: LIBRARY_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(LIBRARY_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const recent = await widgetManager.getOrCreateWidget(LibraryRecentNotesWidget.ID);
            viewContainer.addWidget(recent, { order: 0, canHide: true, initiallyCollapsed: false });
            const starred = await widgetManager.getOrCreateWidget(LibraryStarredWidget.ID);
            viewContainer.addWidget(starred, { order: 1, canHide: true, initiallyCollapsed: false });
            const all = await widgetManager.getOrCreateWidget(LibraryAllNotesWidget.ID);
            viewContainer.addWidget(all, { order: 2, canHide: true, initiallyCollapsed: false });
            const orphans = await widgetManager.getOrCreateWidget(LibraryOrphanNotesWidget.ID);
            viewContainer.addWidget(orphans, { order: 3, canHide: true, initiallyCollapsed: true });
            return viewContainer;
        }
    })).inSingletonScope();

    // --- Calendar activity rail ---
    bind(CalendarService).toSelf().inSingletonScope();
    bind(CalendarWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: CalendarWidget.ID,
        createWidget: () => container.get(CalendarWidget)
    })).inSingletonScope();
    bind(RecentDailiesWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: RecentDailiesWidget.ID,
        createWidget: () => container.get(RecentDailiesWidget)
    })).inSingletonScope();
    bindViewContribution(bind, CalendarContribution);
    bind(FrontendApplicationContribution).toService(CalendarContribution);
    bind(TabBarToolbarContribution).toService(CalendarContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: CALENDAR_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: CALENDAR_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(CALENDAR_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const month = await widgetManager.getOrCreateWidget(CalendarWidget.ID);
            viewContainer.addWidget(month, { order: 0, canHide: true, initiallyCollapsed: false });
            const dailies = await widgetManager.getOrCreateWidget(RecentDailiesWidget.ID);
            viewContainer.addWidget(dailies, { order: 1, canHide: true, initiallyCollapsed: false });
            return viewContainer;
        }
    })).inSingletonScope();

    // --- History activity rail ---
    bind(NoteHistoryService).toSelf().inSingletonScope();
    bind(RecentlyEditedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: RecentlyEditedWidget.ID,
        createWidget: () => container.get(RecentlyEditedWidget)
    })).inSingletonScope();
    bind(RecentlyClosedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: RecentlyClosedWidget.ID,
        createWidget: () => container.get(RecentlyClosedWidget)
    })).inSingletonScope();
    bindViewContribution(bind, HistoryContribution);
    bind(FrontendApplicationContribution).toService(HistoryContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: HISTORY_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: HISTORY_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(HISTORY_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const edited = await widgetManager.getOrCreateWidget(RecentlyEditedWidget.ID);
            viewContainer.addWidget(edited, { order: 0, canHide: true, initiallyCollapsed: false });
            const closed = await widgetManager.getOrCreateWidget(RecentlyClosedWidget.ID);
            viewContainer.addWidget(closed, { order: 1, canHide: true, initiallyCollapsed: false });
            return viewContainer;
        }
    })).inSingletonScope();

    // --- Time Machine activity rail ---
    bind(TimeMachineService).toSelf().inSingletonScope();
    bind(TimeMachineWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TimeMachineWidget.ID,
        createWidget: () => container.get(TimeMachineWidget)
    })).inSingletonScope();
    bindViewContribution(bind, TimeMachineContribution);
    bind(FrontendApplicationContribution).toService(TimeMachineContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TIME_MACHINE_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: TIME_MACHINE_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(TIME_MACHINE_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const snapshots = await widgetManager.getOrCreateWidget(TimeMachineWidget.ID);
            viewContainer.addWidget(snapshots, { order: 0, canHide: false, initiallyCollapsed: false });
            return viewContainer;
        }
    })).inSingletonScope();

    // --- Dashboard activity rail ---
    bind(DashboardWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: DashboardWidget.ID,
        createWidget: () => container.get(DashboardWidget)
    })).inSingletonScope();
    bind(DashboardWindowWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: DashboardWindowWidget.ID,
        createWidget: () => container.get(DashboardWindowWidget)
    })).inSingletonScope();
    bindViewContribution(bind, DashboardContribution);
    bind(FrontendApplicationContribution).toService(DashboardContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: DASHBOARD_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: DASHBOARD_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(DASHBOARD_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const home = await widgetManager.getOrCreateWidget(DashboardWidget.ID);
            viewContainer.addWidget(home, { order: 0, canHide: false, initiallyCollapsed: false });
            return viewContainer;
        }
    })).inSingletonScope();

    // --- Graph activity rail ---
    bind(GraphWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: GraphWidget.ID,
        createWidget: () => container.get(GraphWidget)
    })).inSingletonScope();
    bind(LocalGraphWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: LocalGraphWidget.ID,
        createWidget: () => container.get(LocalGraphWidget)
    })).inSingletonScope();
    bind(GraphFiltersWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: GraphFiltersWidget.ID,
        createWidget: () => container.get(GraphFiltersWidget)
    })).inSingletonScope();
    bindViewContribution(bind, GraphContribution);
    bind(FrontendApplicationContribution).toService(GraphContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: GRAPH_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: GRAPH_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(GRAPH_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const graph = await widgetManager.getOrCreateWidget(GraphWidget.ID);
            viewContainer.addWidget(graph, { order: 0, canHide: false, initiallyCollapsed: false });
            const local = await widgetManager.getOrCreateWidget(LocalGraphWidget.ID);
            viewContainer.addWidget(local, { order: 1, canHide: true, initiallyCollapsed: false });
            const filters = await widgetManager.getOrCreateWidget(GraphFiltersWidget.ID);
            viewContainer.addWidget(filters, { order: 2, canHide: true, initiallyCollapsed: true });
            return viewContainer;
        }
    })).inSingletonScope();

    // --- Tasks activity rail ---
    bind(TasksWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TasksWidget.ID,
        createWidget: () => container.get(TasksWidget)
    })).inSingletonScope();
    bindViewContribution(bind, TasksContribution);
    bind(FrontendApplicationContribution).toService(TasksContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TASKS_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: TASKS_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(TASKS_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const tasks = await widgetManager.getOrCreateWidget(TasksWidget.ID);
            viewContainer.addWidget(tasks, { order: 0, canHide: false, initiallyCollapsed: false });
            return viewContainer;
        }
    })).inSingletonScope();

    // --- Notes sidebar views ---
    bind(BacklinksWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: BacklinksWidget.ID,
        createWidget: () => container.get(BacklinksWidget)
    })).inSingletonScope();
    bindViewContribution(bind, BacklinksViewContribution);
    bind(FrontendApplicationContribution).toService(BacklinksViewContribution);

    bind(TagsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TagsWidget.ID,
        createWidget: () => container.get(TagsWidget)
    })).inSingletonScope();
    bindViewContribution(bind, TagsViewContribution);
    bind(FrontendApplicationContribution).toService(TagsViewContribution);

    bind(StarredWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: StarredWidget.ID,
        createWidget: () => container.get(StarredWidget)
    })).inSingletonScope();
    bindViewContribution(bind, StarredViewContribution);
    bind(FrontendApplicationContribution).toService(StarredViewContribution);
    bind(TabBarToolbarContribution).toService(StarredViewContribution);

    bind(UnlinkedMentionsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: UnlinkedMentionsWidget.ID,
        createWidget: () => container.get(UnlinkedMentionsWidget)
    })).inSingletonScope();
    bindViewContribution(bind, UnlinkedMentionsViewContribution);
    bind(FrontendApplicationContribution).toService(UnlinkedMentionsViewContribution);

    bind(PropertiesWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: PropertiesWidget.ID,
        createWidget: () => container.get(PropertiesWidget)
    })).inSingletonScope();
    bindViewContribution(bind, PropertiesViewContribution);
    bind(FrontendApplicationContribution).toService(PropertiesViewContribution);

    bind(DiagnosticsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: DiagnosticsWidget.ID,
        createWidget: () => container.get(DiagnosticsWidget)
    })).inSingletonScope();
    bindViewContribution(bind, DiagnosticsViewContribution);
    bind(FrontendApplicationContribution).toService(DiagnosticsViewContribution);

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: NOTES_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: NOTES_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(NOTES_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            // Starred lives in the Explorer view container (see StarredViewContribution).
            const backlinks = await widgetManager.getOrCreateWidget(BacklinksWidget.ID);
            viewContainer.addWidget(backlinks, { order: 0, canHide: true, initiallyCollapsed: false });
            const tags = await widgetManager.getOrCreateWidget(TagsWidget.ID);
            viewContainer.addWidget(tags, { order: 1, canHide: true, initiallyCollapsed: false });
            const unlinked = await widgetManager.getOrCreateWidget(UnlinkedMentionsWidget.ID);
            viewContainer.addWidget(unlinked, { order: 2, canHide: true, initiallyCollapsed: false });
            const properties = await widgetManager.getOrCreateWidget(PropertiesWidget.ID);
            viewContainer.addWidget(properties, { order: 3, canHide: true, initiallyCollapsed: true });
            const diagnostics = await widgetManager.getOrCreateWidget(DiagnosticsWidget.ID);
            viewContainer.addWidget(diagnostics, { order: 4, canHide: true, initiallyCollapsed: true });
            return viewContainer;
        }
    })).inSingletonScope();
});
