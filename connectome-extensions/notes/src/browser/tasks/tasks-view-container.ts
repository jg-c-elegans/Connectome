import { ViewContainerTitleOptions } from '@theia/core/lib/browser';

export const TASKS_VIEW_CONTAINER_ID = 'connectome-tasks-view-container';
/** Left rail: after Calendar (700), before Canvas (900). See product RailOrderContribution. */
export const TASKS_VIEW_RANK = 800;
export const TASKS_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Tasks',
    caption: 'Workspace tasks',
    iconClass: 'codicon codicon-checklist',
    closeable: true
};
