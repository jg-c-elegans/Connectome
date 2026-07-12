import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    FrontendApplicationContribution,
    WidgetManager,
} from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { toArray } from '@theia/core/shared/@lumino/algorithm';
import { Title } from '@theia/core/shared/@lumino/widgets';
import { AGENT_DEFINITIONS } from './agents/agent-ids';
import { MemoryInspectorIconContribution } from './memory-inspector-icon-contribution';

/**
 * Force left/right activity-rail icon order.
 *
 * Theia only inserts a side-tab by rank on *first* add. Layout restore keeps
 * old order, so we physically re-sort TabBar titles after startup.
 * Must preserve `currentTitle` when reordering or the panel collapses
 * (refresh hides the dock when currentTitle is null).
 */
@injectable()
export class RailOrderContribution implements FrontendApplicationContribution {

    /**
     * Required left-rail order (top → bottom), rank = 100 * index.
     * 1 Dashboard  2 Explorer  3 Notes  4 Library  5 Search  6 Web
     * 7 Calendar  8 Tasks  9 Canvas  10 History  11 Graph
     * 12 SCM  13 Debug  14 Extensions  15 Testing
     */
    protected static readonly LEFT_RANKS: Readonly<Record<string, number>> = {
        'connectome-dashboard-view-container': 100,
        'explorer-view-container': 200,
        'files': 200, // alias some Theia builds use
        'connectome-notes-view-container': 300,
        'connectome-library-view-container': 400,
        'search-view-container': 500,
        'connectome-web-view-container': 600,
        'connectome-clipboard-view-container': 650,
        'connectome-scripts-view-container': 660,
        'connectome-calendar-view-container': 700,
        'connectome-tasks-view-container': 800,
        'connectome-canvas-view-container': 900,
        'connectome-history-view-container': 1000,
        'connectome-time-machine-view-container': 1100,
        'connectome-agent-session-log-view-container': 1200,
        'connectome-graph-view-container': 1300,
        'scm-view-container': 1400,
        'debug': 1500,
        'vsx-extensions-view-container': 1600,
        'test-view-container': 1700,
    };

    /**
     * Required right-rail order (top → bottom):
     * 1 AI Chat · 2 Claude Code · 3 Codex · 4 Antigravity · 5 Outline · 6 Memory Inspector
     *
     * Agent launcher + live terminal share the same rank (only one should be on
     * the rail at a time; AgentSessionContribution closes the empty launcher).
     */
    protected static readonly RIGHT_RANKS: Readonly<Record<string, number>> = {
        [MemoryInspectorIconContribution.AI_CHAT_WIDGET_ID]: 100,
        // Agent slots filled from AGENT_DEFINITIONS (launcher + terminal ids).
        ...Object.fromEntries(
            AGENT_DEFINITIONS.flatMap(def => [
                [def.launcherId, def.rank],
                [def.terminalId, def.rank],
            ])
        ),
        'outline-view': 500,
        [MemoryInspectorIconContribution.MEMORY_WIDGET_ID]: 600,
    };

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    onStart(): void {
        this.widgetManager.onDidCreateWidget(({ widget }) => {
            this.maybeTagRank(widget);
            queueMicrotask(() => {
                this.reorderLeftRail();
                this.reorderRightRail();
            });
        });
        void this.appState.reachedState('ready').then(() => {
            this.reorderBothRails();
            setTimeout(() => this.reorderBothRails(), 100);
            setTimeout(() => this.reorderBothRails(), 500);
            setTimeout(() => this.reorderBothRails(), 1500);
        });
    }

    protected reorderBothRails(): void {
        this.reorderLeftRail();
        this.reorderRightRail();
    }

    protected maybeTagRank(widget: Widget): void {
        const left = RailOrderContribution.LEFT_RANKS[widget.id];
        if (left !== undefined) {
            void this.shell.addWidget(widget, { area: 'left', rank: left });
            return;
        }
        const right = RailOrderContribution.RIGHT_RANKS[widget.id];
        if (right !== undefined) {
            void this.shell.addWidget(widget, { area: 'right', rank: right });
        }
    }

    /**
     * Re-sort left activity TabBar by LEFT_RANKS without collapsing the panel.
     */
    protected reorderLeftRail(): void {
        this.reorderSideRail('left', RailOrderContribution.LEFT_RANKS, 'connectome-dashboard-view-container');
    }

    /**
     * Re-sort right activity TabBar by RIGHT_RANKS (AI Chat → agents → Outline → Memory).
     */
    protected reorderRightRail(): void {
        this.reorderSideRail('right', RailOrderContribution.RIGHT_RANKS, MemoryInspectorIconContribution.AI_CHAT_WIDGET_ID);
    }

    protected reorderSideRail(
        side: 'left' | 'right',
        ranks: Readonly<Record<string, number>>,
        preferredFallbackId: string,
    ): void {
        const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
        if (!handler?.tabBar) {
            return;
        }
        const tabBar = handler.tabBar;
        const titles = toArray(tabBar.titles);
        if (titles.length < 2) {
            return;
        }

        // Preserve selection so the side panel does not collapse (currentTitle null → collapsed).
        const previousCurrent = tabBar.currentTitle;

        const decorated = titles.map((title, originalIndex) => {
            const id = title.owner.id;
            const known = ranks[id];
            return {
                title,
                rank: known !== undefined ? known : 10_000 + originalIndex,
                originalIndex,
            };
        });

        decorated.sort((a, b) => a.rank - b.rank || a.originalIndex - b.originalIndex);

        let same = true;
        for (let i = 0; i < decorated.length; i++) {
            if (decorated[i].title !== titles[i]) {
                same = false;
                break;
            }
        }
        if (same) {
            this.ensureSelection(tabBar, previousCurrent, preferredFallbackId);
            return;
        }

        for (const { title } of decorated) {
            tabBar.removeTab(title);
        }
        for (const { title } of decorated) {
            tabBar.addTab(title);
        }

        this.ensureSelection(tabBar, previousCurrent, preferredFallbackId);
    }

    /**
     * Restore prior selection, or fall back to a preferred id (then first title).
     * Activating a title re-expands a collapsed panel.
     */
    protected ensureSelection(
        tabBar: { currentTitle: Title<Widget> | null; titles: Iterable<Title<Widget>> },
        previous: Title<Widget> | null,
        preferredFallbackId: string,
    ): void {
        const titles = toArray(tabBar.titles);
        if (titles.length === 0) {
            return;
        }

        if (previous && titles.includes(previous)) {
            tabBar.currentTitle = previous;
            return;
        }

        const preferred = titles.find(t => t.owner.id === preferredFallbackId);
        if (preferred) {
            tabBar.currentTitle = preferred;
            return;
        }

        // Left-rail extras when dashboard missing.
        const explorer = titles.find(t => t.owner.id === 'explorer-view-container' || t.owner.id === 'files');
        if (explorer) {
            tabBar.currentTitle = explorer;
            return;
        }

        if (!tabBar.currentTitle) {
            tabBar.currentTitle = titles[0];
        }
    }
}
