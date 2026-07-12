/**
 * Right-rail agent session launcher ids and ranks.
 *
 * Icons use the same `codicon(...)` classes as every other activity-rail
 * item (Explorer, Notes, Web, …). Custom mask/SVG CSS does not show on the
 * side tab bar — only codicon *font* glyphs do.
 *
 * Claude / Antigravity use Connectome-built codicons from
 * `yarn build:codicons` (see icons/codicons-src/ + connectome-codicons.css).
 * Codex uses the stock `@vscode/codicons` glyph `openai`.
 *
 * Canonical right-rail order (see RailOrderContribution.RIGHT_RANKS):
 *   1 AI Chat · 2 Claude · 3 Codex · 4 Antigravity · 5 Outline · 6 Memory Inspector
 */

import { codicon } from '@theia/core/lib/browser/widgets';

/**
 * Default right sidebar width (CSS px), measured from user-tuned screenshots
 * on two displays (~495 CSS px after devicePixelRatio). Left panel unchanged.
 */
export const CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH = 495;

export type AgentKind = 'claude' | 'codex' | 'antigravity';

export interface AgentDefinition {
    readonly kind: AgentKind;
    /** Permanent right-rail launcher widget id. */
    readonly launcherId: string;
    /** Integrated terminal widget id (stable for reuse). */
    readonly terminalId: string;
    readonly title: string;
    /** Same pattern as ViewContainerTitleOptions.iconClass elsewhere. */
    readonly iconClass: string;
    /**
     * Right activity rank (shared by launcher + live terminal so only one
     * tab occupies this slot). Must match RailOrderContribution.RIGHT_RANKS.
     */
    readonly rank: number;
    /** Command sent once when the terminal is first created. */
    readonly startCommand: string;
    readonly openCommandId: string;
}

/**
 * Right-rail agent slots. Ranks sit between AI Chat (100) and Outline (500):
 * Claude 200 · Codex 300 · Antigravity 400.
 */
export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
    {
        kind: 'claude',
        launcherId: 'connectome.agent.launcher.claude',
        terminalId: 'connectome.agent.terminal.claude',
        title: 'Claude Code',
        iconClass: codicon('claude'),
        rank: 200,
        startCommand: 'claude',
        openCommandId: 'connectome.agent.openClaude',
    },
    {
        kind: 'codex',
        launcherId: 'connectome.agent.launcher.codex',
        terminalId: 'connectome.agent.terminal.codex',
        title: 'Codex',
        iconClass: codicon('openai'),
        rank: 300,
        startCommand: 'codex',
        openCommandId: 'connectome.agent.openCodex',
    },
    {
        kind: 'antigravity',
        launcherId: 'connectome.agent.launcher.antigravity',
        terminalId: 'connectome.agent.terminal.antigravity',
        title: 'Antigravity',
        iconClass: codicon('antigravity'),
        rank: 400,
        startCommand: 'agy',
        openCommandId: 'connectome.agent.openAntigravity',
    },
];

/** Widget ids that share an agent rank (launcher empty-slot + live terminal). */
export function agentRailWidgetIds(): string[] {
    const ids: string[] = [];
    for (const def of AGENT_DEFINITIONS) {
        ids.push(def.launcherId, def.terminalId);
    }
    return ids;
}

export function agentByKind(kind: AgentKind): AgentDefinition {
    const found = AGENT_DEFINITIONS.find(a => a.kind === kind);
    if (!found) {
        throw new Error(`Unknown agent kind: ${kind}`);
    }
    return found;
}

export function isAgentKind(value: unknown): value is AgentKind {
    return value === 'claude' || value === 'codex' || value === 'antigravity';
}
