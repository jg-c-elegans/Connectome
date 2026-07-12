import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { MaybePromise } from '@theia/core';
import {
    NavigatableWidgetOpenHandler, WidgetOpenerOptions, OpenHandler
} from '@theia/core/lib/browser';
import { CanvasWidget, CANVAS_WIDGET_FACTORY_ID } from './canvas-widget';
import { isCanvasUri } from './canvas-model';

@injectable()
export class CanvasOpenHandler extends NavigatableWidgetOpenHandler<CanvasWidget> implements OpenHandler {

    readonly id = CANVAS_WIDGET_FACTORY_ID;
    readonly label = 'Connectome Canvas';

    canHandle(uri: URI, _options?: WidgetOpenerOptions): MaybePromise<number> {
        // `.canvas.json` ends with path.ext === `.json`; check the full base name.
        return isCanvasUri(uri.path.base) || isCanvasUri(uri.path.toString()) ? 600 : 0;
    }

    protected override async getOrCreateWidget(uri: URI, options?: WidgetOpenerOptions): Promise<CanvasWidget> {
        const widget = await super.getOrCreateWidget(uri, options);
        await widget.setUri(uri);
        return widget;
    }
}
