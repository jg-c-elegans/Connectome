import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const CALENDAR_VIEW_CONTAINER_ID = 'connectome-calendar-view-container';
export const CALENDAR_VIEW_RANK = 700;

export const CALENDAR_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Calendar',
    iconClass: codicon('calendar'),
    closeable: false
};
