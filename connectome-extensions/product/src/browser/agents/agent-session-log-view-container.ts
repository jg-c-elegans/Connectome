import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const AGENT_SESSION_LOG_VIEW_CONTAINER_ID = 'connectome-agent-session-log-view-container';
export const AGENT_SESSION_LOG_VIEW_RANK = 1200;

export const AGENT_SESSION_LOG_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Agent Sessions',
    iconClass: codicon('robot'),
    closeable: false
};
