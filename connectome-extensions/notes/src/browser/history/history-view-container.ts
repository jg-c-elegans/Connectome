import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const HISTORY_VIEW_CONTAINER_ID = 'connectome-history-view-container';
export const HISTORY_VIEW_RANK = 1000;

export const HISTORY_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'History',
    iconClass: codicon('history'),
    closeable: false
};
