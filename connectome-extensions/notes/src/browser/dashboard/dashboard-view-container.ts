import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const DASHBOARD_VIEW_CONTAINER_ID = 'connectome-dashboard-view-container';
export const DASHBOARD_VIEW_RANK = 100;

export const DASHBOARD_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Dashboard',
    iconClass: codicon('home'),
    closeable: false
};
