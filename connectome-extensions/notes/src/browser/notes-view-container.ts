import { ViewContainerTitleOptions } from '@theia/core/lib/browser';
import { codicon } from '@theia/core/lib/browser/widgets';
import { nls } from '@theia/core';

export const NOTES_VIEW_CONTAINER_ID = 'connectome-notes-view-container';

export const NOTES_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: nls.localize('connectome/notes/viewContainerLabel', 'Notes'),
    iconClass: codicon('notebook'),
    closeable: true
};
