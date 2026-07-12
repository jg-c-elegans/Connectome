import '../../src/browser/style.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    bindViewContribution,
    FrontendApplicationContribution,
    ViewContainer,
    WidgetFactory,
    WidgetManager
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { BrowserService } from './browser-service';
import { BrowserWidget, BrowserWidgetOptions } from './browser-widget';
import { BrowserContribution } from './browser-contribution';
import {
    WEB_VIEW_CONTAINER_ID,
    WEB_VIEW_CONTAINER_TITLE_OPTIONS
} from './browser-view-container';
import { BookmarksWidget } from './bookmarks-widget';
import { HistoryWidget } from './history-widget';
import { SavedPagesWidget } from './saved-pages-widget';
import { DownloadsWidget } from './downloads-widget';

export default new ContainerModule(bind => {
    bind(BrowserService).toSelf().inSingletonScope();

    bind(BrowserWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: BrowserWidget.ID,
        createWidget: (options: BrowserWidgetOptions) => {
            const child = container.createChild();
            child.bind(BrowserWidgetOptions).toConstantValue(options);
            return child.get(BrowserWidget);
        }
    })).inSingletonScope();

    bind(BookmarksWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: BookmarksWidget.ID,
        createWidget: () => container.get(BookmarksWidget)
    })).inSingletonScope();

    bind(HistoryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: HistoryWidget.ID,
        createWidget: () => container.get(HistoryWidget)
    })).inSingletonScope();

    bind(SavedPagesWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: SavedPagesWidget.ID,
        createWidget: () => container.get(SavedPagesWidget)
    })).inSingletonScope();

    bind(DownloadsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: DownloadsWidget.ID,
        createWidget: () => container.get(DownloadsWidget)
    })).inSingletonScope();

    bindViewContribution(bind, BrowserContribution);
    bind(FrontendApplicationContribution).toService(BrowserContribution);
    bind(TabBarToolbarContribution).toService(BrowserContribution);

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: WEB_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: WEB_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(WEB_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);

            // Same pattern as Notes: each section is a collapsible, resizable ViewContainer part.
            const bookmarks = await widgetManager.getOrCreateWidget(BookmarksWidget.ID);
            viewContainer.addWidget(bookmarks, { order: 0, canHide: true, initiallyCollapsed: false });

            const history = await widgetManager.getOrCreateWidget(HistoryWidget.ID);
            viewContainer.addWidget(history, { order: 1, canHide: true, initiallyCollapsed: false });

            const saved = await widgetManager.getOrCreateWidget(SavedPagesWidget.ID);
            viewContainer.addWidget(saved, { order: 2, canHide: true, initiallyCollapsed: false });

            const downloads = await widgetManager.getOrCreateWidget(DownloadsWidget.ID);
            viewContainer.addWidget(downloads, { order: 3, canHide: true, initiallyCollapsed: true });

            return viewContainer;
        }
    })).inSingletonScope();
});
