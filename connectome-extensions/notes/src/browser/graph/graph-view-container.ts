import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const GRAPH_VIEW_CONTAINER_ID = 'connectome-graph-view-container';
export const GRAPH_VIEW_RANK = 1100;

export const GRAPH_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Graph',
    iconClass: codicon('graph-scatter'),
    closeable: false
};
