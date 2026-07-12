import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const LIBRARY_VIEW_CONTAINER_ID = 'connectome-library-view-container';
export const LIBRARY_VIEW_RANK = 400;

export const LIBRARY_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Library',
    iconClass: codicon('library'),
    closeable: false
};
