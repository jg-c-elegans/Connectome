import { ApplicationShell, ViewContainer, WidgetManager } from '@theia/core/lib/browser';

/**
 * Pin a left-area ViewContainer onto the activity rail at the given rank.
 * Mirrors connectome-extensions/notes/src/browser/activity/ensure-left-activity.ts.
 */
export async function ensureLeftActivity(
    shell: ApplicationShell,
    widgetManager: WidgetManager,
    containerId: string,
    rank: number
): Promise<ViewContainer> {
    const widget = await widgetManager.getOrCreateWidget(containerId) as ViewContainer;
    await shell.addWidget(widget, { area: 'left', rank });
    return widget;
}
