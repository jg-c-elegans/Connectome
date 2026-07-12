import { ApplicationShell, ViewContainer, WidgetManager } from '@theia/core/lib/browser';

/**
 * Pin a left-area ViewContainer onto the activity rail at the given rank.
 * Call on both initializeLayout and onStart — layout restore skips initializeLayout.
 *
 * Always re-apply `shell.addWidget(..., { rank })` even when the widget is already
 * on a tab bar. Otherwise a restored layout keeps the *old* rank forever (e.g.
 * Tasks stuck at top after TASKS_VIEW_RANK was raised from 380 → 750).
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
