import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const TIME_MACHINE_VIEW_CONTAINER_ID = 'connectome-time-machine-view-container';
export const TIME_MACHINE_VIEW_RANK = 1100;

export const TIME_MACHINE_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Time Machine',
    iconClass: codicon('vr'),
    closeable: false
};
