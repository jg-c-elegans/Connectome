import { inject, injectable } from '@theia/core/shared/inversify';
import {
    FrontendApplicationContribution,
    WidgetManager,
    codicon,
} from '@theia/core/lib/browser';
import { Widget } from '@theia/core/lib/browser/widgets/widget';

/**
 * Force activity-rail icons that come from upstream packages onto codicons
 * Connectome chooses (upstream SVG masks or stock icons don't match product branding).
 *
 * - Memory Inspector: upstream `memory-view-icon` SVG mask is invisible on the rail
 * - AI Chat: stock `comment-discussion` → product wants `copilot`
 */
@injectable()
export class MemoryInspectorIconContribution implements FrontendApplicationContribution {

    /** Factory / widget id from `@theia/memory-inspector` MemoryLayoutWidget.ID */
    static readonly MEMORY_WIDGET_ID = 'memory-layout-widget';
    static readonly MEMORY_ICON = codicon('chip');

    /** Factory / widget id from `@theia/ai-chat-ui` ChatViewWidget.ID */
    static readonly AI_CHAT_WIDGET_ID = 'chat-view-widget';
    static readonly AI_CHAT_ICON = codicon('copilot');

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    onStart(): void {
        this.patchExisting();
        this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
            this.maybePatch(factoryId, widget);
        });
    }

    protected patchExisting(): void {
        for (const id of [
            MemoryInspectorIconContribution.MEMORY_WIDGET_ID,
            MemoryInspectorIconContribution.AI_CHAT_WIDGET_ID,
        ]) {
            for (const widget of this.widgetManager.getWidgets(id)) {
                this.maybePatch(id, widget);
            }
            const existing = this.widgetManager.tryGetWidget(id);
            if (existing) {
                this.maybePatch(id, existing);
            }
        }
    }

    protected maybePatch(factoryId: string, widget: Widget): void {
        const icon = this.iconFor(factoryId, widget.id);
        if (icon && widget.title.iconClass !== icon) {
            widget.title.iconClass = icon;
        }
    }

    protected iconFor(factoryId: string, widgetId: string): string | undefined {
        if (factoryId === MemoryInspectorIconContribution.MEMORY_WIDGET_ID
            || widgetId === MemoryInspectorIconContribution.MEMORY_WIDGET_ID) {
            return MemoryInspectorIconContribution.MEMORY_ICON;
        }
        if (factoryId === MemoryInspectorIconContribution.AI_CHAT_WIDGET_ID
            || widgetId === MemoryInspectorIconContribution.AI_CHAT_WIDGET_ID) {
            return MemoryInspectorIconContribution.AI_CHAT_ICON;
        }
        return undefined;
    }
}
