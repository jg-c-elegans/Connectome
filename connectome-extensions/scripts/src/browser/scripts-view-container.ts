import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';

export const SCRIPTS_VIEW_CONTAINER_ID = 'connectome-scripts-view-container';

/** After Web (600) / Clipboard (650), before Calendar (700). */
export const SCRIPTS_VIEW_RANK = 660;

export const SCRIPTS_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Scripts',
    iconClass: codicon('play-circle'),
    closeable: false
};

/** Context menu path for items in the Scripts/Favorites list sections. */
export const SCRIPTS_CONTEXT_MENU = ['connectome-scripts-context-menu'];

export type ScriptLanguage = 'python' | 'powershell';

export type ScriptsSortMode = 'alphabetical' | 'recent';

export interface ScriptItem {
    /** File name within .connectome-scripts, e.g. "backup.py". Used as the stable id. */
    name: string;
    language: ScriptLanguage;
    favorite: boolean;
    mtime: number;
}
