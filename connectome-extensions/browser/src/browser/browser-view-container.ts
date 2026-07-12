import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

/**
 * Left activity ViewContainer id for the Web side panel.
 * New id (not `connectome-browser-view-container`) so restored layouts don't
 * reinflate the old single-pane Research widget.
 */
export const WEB_VIEW_CONTAINER_ID = 'connectome-web-view-container';

/**
 * Activity-bar rank: after Explorer (200), Notes (300), Library (400),
 * Search (500). Sits above Calendar and the remaining left-rail icons.
 */
export const WEB_VIEW_RANK = 600;

export const WEB_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Web',
    iconClass: codicon('globe'),
    closeable: false
};

/** Context menu path for items in Web list sections. */
export const WEB_CONTEXT_MENU = ['connectome-web-context-menu'];
export const WEB_CONTEXT_NAVIGATION = [...WEB_CONTEXT_MENU, 'navigation'];
export const WEB_CONTEXT_MODIFICATION = [...WEB_CONTEXT_MENU, 'modification'];

/** Context menu path for right-clicks inside browser tabs. */
export const BROWSER_GUEST_CONTEXT_MENU = ['connectome-browser-guest-context-menu'];

export type WebListKind = 'bookmarks' | 'history' | 'savedPages' | 'downloads';

export interface WebListItem {
    kind: WebListKind;
    id: string;
    title: string;
    url: string;
    /** Absolute filesystem path when relevant (saved pages, downloads). */
    path?: string;
    downloadState?: 'progressing' | 'completed' | 'cancelled' | 'failed';
    receivedBytes?: number;
    totalBytes?: number;
}
