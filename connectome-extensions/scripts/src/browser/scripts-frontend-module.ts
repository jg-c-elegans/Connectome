import '../../src/browser/style/scripts.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    bindViewContribution,
    FrontendApplicationContribution,
    ViewContainer,
    WidgetFactory,
    WidgetManager
} from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from '@theia/core';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ScriptsService } from './scripts-service';
import { ScriptsContribution } from './scripts-contribution';
import { SaveToScriptsContribution } from './save-to-scripts-contribution';
import { AllScriptsWidget } from './all-scripts-widget';
import { FavoriteScriptsWidget } from './favorite-scripts-widget';
import {
    SCRIPTS_VIEW_CONTAINER_ID,
    SCRIPTS_VIEW_CONTAINER_TITLE_OPTIONS
} from './scripts-view-container';

export default new ContainerModule(bind => {
    bind(ScriptsService).toSelf().inSingletonScope();

    bind(AllScriptsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: AllScriptsWidget.ID,
        createWidget: () => container.get(AllScriptsWidget)
    })).inSingletonScope();

    bind(FavoriteScriptsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: FavoriteScriptsWidget.ID,
        createWidget: () => container.get(FavoriteScriptsWidget)
    })).inSingletonScope();

    bindViewContribution(bind, ScriptsContribution);
    bind(FrontendApplicationContribution).toService(ScriptsContribution);

    bind(SaveToScriptsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SaveToScriptsContribution);
    bind(MenuContribution).toService(SaveToScriptsContribution);
    bind(TabBarToolbarContribution).toService(SaveToScriptsContribution);

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: SCRIPTS_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: SCRIPTS_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(SCRIPTS_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);

            const all = await widgetManager.getOrCreateWidget(AllScriptsWidget.ID);
            viewContainer.addWidget(all, { order: 0, canHide: true, initiallyCollapsed: false });

            const favorites = await widgetManager.getOrCreateWidget(FavoriteScriptsWidget.ID);
            viewContainer.addWidget(favorites, { order: 1, canHide: true, initiallyCollapsed: false });

            return viewContainer;
        }
    })).inSingletonScope();
});
