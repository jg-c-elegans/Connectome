import '../../src/browser/style/clipboard.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    bindViewContribution,
    FrontendApplicationContribution,
    ViewContainer,
    WidgetFactory,
    WidgetManager
} from '@theia/core/lib/browser';
import { ClipboardService } from './clipboard-service';
import { ClipboardContribution } from './clipboard-contribution';
import { ClipboardHistoryWidget } from './clipboard-history-widget';
import { ClipboardSavedWidget } from './clipboard-saved-widget';
import { ClipboardGalleryWidget } from './clipboard-gallery-widget';
import {
    CLIPBOARD_VIEW_CONTAINER_ID,
    CLIPBOARD_VIEW_CONTAINER_TITLE_OPTIONS
} from './clipboard-view-container';

export default new ContainerModule(bind => {
    bind(ClipboardService).toSelf().inSingletonScope();

    bind(ClipboardHistoryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: ClipboardHistoryWidget.ID,
        createWidget: () => container.get(ClipboardHistoryWidget)
    })).inSingletonScope();

    bind(ClipboardSavedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: ClipboardSavedWidget.ID,
        createWidget: () => container.get(ClipboardSavedWidget)
    })).inSingletonScope();

    bind(ClipboardGalleryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: ClipboardGalleryWidget.ID,
        createWidget: () => container.get(ClipboardGalleryWidget)
    })).inSingletonScope();

    bindViewContribution(bind, ClipboardContribution);
    bind(FrontendApplicationContribution).toService(ClipboardContribution);

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: CLIPBOARD_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: CLIPBOARD_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(CLIPBOARD_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);

            const history = await widgetManager.getOrCreateWidget(ClipboardHistoryWidget.ID);
            viewContainer.addWidget(history, { order: 0, canHide: true, initiallyCollapsed: false });

            const saved = await widgetManager.getOrCreateWidget(ClipboardSavedWidget.ID);
            viewContainer.addWidget(saved, { order: 1, canHide: true, initiallyCollapsed: false });

            return viewContainer;
        }
    })).inSingletonScope();
});
