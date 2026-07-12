import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const CANVAS_SIDEBAR_VIEW_CONTAINER_ID = 'connectome-canvas-view-container';
export const CANVAS_SIDEBAR_VIEW_RANK = 900;

export const CANVAS_SIDEBAR_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Canvas',
    iconClass: codicon('map'),
    closeable: false
};
