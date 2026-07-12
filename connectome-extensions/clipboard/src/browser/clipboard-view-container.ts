import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const CLIPBOARD_VIEW_CONTAINER_ID = 'connectome-clipboard-view-container';

/** After Web (600), before Scripts (660) / Calendar (700). */
export const CLIPBOARD_VIEW_RANK = 650;

export const CLIPBOARD_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Clipboard',
    iconClass: codicon('clippy'),
    closeable: false
};

/** Context menu path for items in the Clipboard/Saved list sections. */
export const CLIPBOARD_CONTEXT_MENU = ['connectome-clipboard-context-menu'];

/** How many live-history items the sidebar shows (the window shows the full buffer). */
export const CLIPBOARD_SIDEBAR_LIMIT = 10;

/** In-memory ring buffer cap for live history (not persisted). */
export const CLIPBOARD_BUFFER_LIMIT = 100;
