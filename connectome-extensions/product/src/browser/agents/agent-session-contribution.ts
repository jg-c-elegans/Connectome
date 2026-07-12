import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    FrontendApplicationContribution,
    Navigatable,
    WidgetManager,
} from '@theia/core/lib/browser';
import { Disposable } from '@theia/core/lib/common/disposable';
import { toArray } from '@theia/core/shared/@lumino/algorithm';
import { codicon } from '@theia/core/lib/browser/widgets';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
} from '@theia/core/lib/common';
import { FileUri } from '@theia/core/lib/common/file-uri';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import {
    AGENT_DEFINITIONS,
    AgentDefinition,
    AgentKind,
    agentByKind,
    isAgentKind,
    CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH,
} from './agent-ids';
import { AgentSessionLogService } from './agent-session-log-service';

const LAUNCHER_ACTIVATE_EVENT = 'connectome-agent-launcher-activate';

/** Delay so PowerShell can print its prompt before we send the agent command. */
const START_COMMAND_DELAY_MS = 400;

/**
 * Extra wait after starting an agent CLI before seeding path/selection so
 * the CLI (not PowerShell) owns the prompt.
 */
const SEED_AFTER_START_EXTRA_MS = 900;

/** Cap selection length so huge highlights do not flood the terminal. */
const SELECTION_SEED_MAX_CHARS = 2000;

/** Full path — bare `powershell.exe` is unreliable for Theia terminal profiles. */
const POWERSHELL_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

export namespace AgentCommands {
    export const OPEN_CLAUDE: Command = {
        id: 'connectome.agent.openClaude',
        label: 'Claude Code: Open Terminal Session',
    };
    export const OPEN_CODEX: Command = {
        id: 'connectome.agent.openCodex',
        label: 'Codex: Open Terminal Session',
    };
    export const OPEN_ANTIGRAVITY: Command = {
        id: 'connectome.agent.openAntigravity',
        label: 'Antigravity: Open Terminal Session',
    };
    export const ASK_CLAUDE_ABOUT_NOTE: Command = {
        id: 'connectome.agent.askClaudeAboutNote',
        category: 'Claude Code',
        label: 'Ask About This Note',
    };
    export const ASK_CODEX_ABOUT_NOTE: Command = {
        id: 'connectome.agent.askCodexAboutNote',
        category: 'Codex',
        label: 'Ask About This Note',
    };
    export const ASK_CLAUDE_ABOUT_SELECTION: Command = {
        id: 'connectome.agent.askClaudeAboutSelection',
        category: 'Claude Code',
        label: 'Ask About Selection',
    };
    export const ASK_CODEX_ABOUT_SELECTION: Command = {
        id: 'connectome.agent.askCodexAboutSelection',
        category: 'Codex',
        label: 'Ask About Selection',
    };
}

export interface OpenAgentOptions {
    /** Text typed into the agent prompt without trailing Enter. */
    readonly seedText?: string;
}

@injectable()
export class AgentSessionContribution
    implements FrontendApplicationContribution, CommandContribution, MenuContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(AgentSessionLogService)
    protected readonly sessionLog: AgentSessionLogService;

    /** Terminal ids that have already received their start command. */
    protected readonly startedCommands = new Set<string>();

    /** Maps a live terminal's widget id to its session-log entry id, for transcript capture on close. */
    protected readonly logEntryByTerminalId = new Map<string, string>();

    /**
     * Live terminal widget ids by agent kind. Terminal widget ids from Theia can
     * drift after layout restore; this map + title/kind matching keeps one slot.
     */
    protected readonly liveTerminalByKind = new Map<AgentKind, string>();

    protected launcherListener?: (event: Event) => void;
    protected addWidgetListener?: Disposable;

    async initializeLayout(): Promise<void> {
        await this.ensureLaunchers();
        this.dedupeAgentRail();
    }

    onStart(): void {
        void this.ensureLaunchers().then(() => this.dedupeAgentRail());
        this.launcherListener = (event: Event) => {
            const kind = (event as CustomEvent<AgentKind>).detail;
            if (isAgentKind(kind)) {
                void this.openAgent(kind);
            }
        };
        window.addEventListener(LAUNCHER_ACTIVATE_EVENT, this.launcherListener);

        // Layout restore can re-insert launchers after our first pass — re-dedupe.
        this.addWidgetListener = this.shell.onDidAddWidget(() => {
            queueMicrotask(() => this.dedupeAgentRail());
        });
        // Remove concurrent overlapping timeouts by chaining them or relying on the promise lock.
        void this.scheduleEnsureLaunchers();

        // Force cleanup of layout state: update icons and close blank phantom tabs
        window.setTimeout(() => this.forceCleanupLayout(), 2000);
    }

    protected forceCleanupLayout(): void {
        // Force update icons that get stuck in Theia's layout state
        for (const w of this.shell.widgets) {
            if (w.id === 'connectome-agent-session-log-view-container') {
                w.title.iconClass = codicon('robot');
            } else if (w.id === 'connectome-time-machine-view-container') {
                w.title.iconClass = codicon('vr');
            }
        }

        // Aggressively close any completely blank phantom tabs on the right rail
        const tabBar = this.shell.rightPanelHandler?.tabBar;
        if (tabBar) {
            for (const title of toArray(tabBar.titles)) {
                if (!title.iconClass && !title.label) {
                    title.owner.close();
                }
            }
        }
    }

    onStop(): void {
        if (this.launcherListener) {
            window.removeEventListener(LAUNCHER_ACTIVATE_EVENT, this.launcherListener);
            this.launcherListener = undefined;
        }
        this.addWidgetListener?.dispose();
        this.addWidgetListener = undefined;
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(AgentCommands.OPEN_CLAUDE, {
            execute: () => this.openAgent('claude'),
        });
        commands.registerCommand(AgentCommands.OPEN_CODEX, {
            execute: () => this.openAgent('codex'),
        });
        commands.registerCommand(AgentCommands.OPEN_ANTIGRAVITY, {
            execute: () => this.openAgent('antigravity'),
        });

        commands.registerCommand(AgentCommands.ASK_CLAUDE_ABOUT_NOTE, {
            execute: () => this.askAboutNote('claude'),
            isEnabled: () => !!this.resolveActiveResourceUri(),
            isVisible: () => !!this.resolveActiveResourceUri(),
        });
        commands.registerCommand(AgentCommands.ASK_CODEX_ABOUT_NOTE, {
            execute: () => this.askAboutNote('codex'),
            isEnabled: () => !!this.resolveActiveResourceUri(),
            isVisible: () => !!this.resolveActiveResourceUri(),
        });
        commands.registerCommand(AgentCommands.ASK_CLAUDE_ABOUT_SELECTION, {
            execute: () => this.askAboutSelection('claude'),
            isEnabled: () => !!this.resolveSelection() && !!this.resolveActiveResourceUri(),
            isVisible: () => !!this.resolveSelection() && !!this.resolveActiveResourceUri(),
        });
        commands.registerCommand(AgentCommands.ASK_CODEX_ABOUT_SELECTION, {
            execute: () => this.askAboutSelection('codex'),
            isEnabled: () => !!this.resolveSelection() && !!this.resolveActiveResourceUri(),
            isVisible: () => !!this.resolveSelection() && !!this.resolveActiveResourceUri(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        // Path handoff — available whenever a file is active (isVisible on command).
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: AgentCommands.ASK_CLAUDE_ABOUT_NOTE.id,
            label: 'Ask Claude Code about this note',
            order: 'connectome-a1',
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: AgentCommands.ASK_CODEX_ABOUT_NOTE.id,
            label: 'Ask Codex about this note',
            order: 'connectome-a2',
        });
        // Selection handoff — command isVisible hides when nothing is selected.
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: AgentCommands.ASK_CLAUDE_ABOUT_SELECTION.id,
            label: 'Ask Claude Code about selection',
            order: 'connectome-a3',
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: AgentCommands.ASK_CODEX_ABOUT_SELECTION.id,
            label: 'Ask Codex about selection',
            order: 'connectome-a4',
        });
    }

    protected async askAboutNote(kind: AgentKind): Promise<void> {
        const uri = this.resolveActiveResourceUri();
        if (!uri) {
            return;
        }
        const path = await this.resolveDisplayPath(uri);
        await this.openAgent(kind, { seedText: this.formatPathSeed(path) });
    }

    protected async askAboutSelection(kind: AgentKind): Promise<void> {
        const uri = this.resolveActiveResourceUri();
        const selection = this.resolveSelection();
        if (!uri || !selection) {
            return;
        }
        const path = await this.resolveDisplayPath(uri);
        await this.openAgent(kind, {
            seedText: this.formatSelectionSeed(path, selection.text, selection.startLine, selection.endLine),
        });
    }

    protected ensureLaunchersPromise?: Promise<void>;

    protected async scheduleEnsureLaunchers(): Promise<void> {
        for (const ms of [100, 500, 1500, 3000]) {
            window.setTimeout(() => {
                void this.ensureLaunchers().then(() => this.dedupeAgentRail());
            }, ms);
        }
    }

    protected async ensureLaunchers(): Promise<void> {
        if (this.ensureLaunchersPromise) {
            return this.ensureLaunchersPromise;
        }
        this.ensureLaunchersPromise = this.doEnsureLaunchers().finally(() => {
            this.ensureLaunchersPromise = undefined;
        });
        return this.ensureLaunchersPromise;
    }

    protected async doEnsureLaunchers(): Promise<void> {
        for (const def of AGENT_DEFINITIONS) {
            // Prefer a live terminal over a launcher when both might exist after restore.
            // Always drop the empty launcher if a terminal is live — otherwise the rail
            // shows two icons for the same agent after layout restore.
            const existingTerm = this.findTerminal(def);
            if (existingTerm && !existingTerm.isDisposed) {
                this.liveTerminalByKind.set(def.kind, existingTerm.id);
                await this.closeLauncher(def);
                // Always re-apply rank (restore ignores rank for existing tabs).
                await this.shell.addWidget(existingTerm, { area: 'right', rank: def.rank });
                continue;
            }
            // No live terminal: pin exactly one launcher. closeLauncher first so we
            // never stack a second launcher instance from a prior restore.
            await this.closeLauncher(def);
            const launcher = await this.widgetManager.getOrCreateWidget(def.launcherId);
            await this.shell.addWidget(launcher, { area: 'right', rank: def.rank });
        }
        this.dedupeAgentRail();
    }

    /**
     * Hard guarantee: at most one right-rail tab per agent (launcher XOR terminal).
     * Layout restore + delayed ensureLaunchers previously left both icons up.
     */
    protected dedupeAgentRail(): void {
        const tabBar = this.shell.rightPanelHandler?.tabBar;
        if (!tabBar) {
            return;
        }
        // Snapshot — we mutate the bar below.
        const titles = toArray(tabBar.titles);

        for (const def of AGENT_DEFINITIONS) {
            const matches = titles.filter(t => this.titleMatchesAgent(t.owner, def));
            if (matches.length <= 1) {
                continue;
            }

            // Prefer a live terminal session over an empty launcher placeholder.
            const preferred =
                matches.find(t => this.isAgentTerminalWidget(t.owner, def))
                ?? matches.find(t => t.owner.id.startsWith(def.terminalId))
                ?? matches.find(t => t.owner.id.startsWith(def.launcherId))
                ?? matches[0];

            for (const title of matches) {
                if (title === preferred) {
                    continue;
                }
                const widget = title.owner;
                // Close empty launchers and stray duplicate terminals. Keep preferred.
                if (widget === preferred.owner || widget.isDisposed) {
                    continue;
                }
                widget.close();
            }
        }
    }

    protected titleMatchesAgent(
        widget: { id: string; title: { label: string; iconClass: string }; isDisposed?: boolean },
        def: AgentDefinition,
    ): boolean {
        if (widget.isDisposed) {
            return false;
        }
        if (widget.id.startsWith(def.launcherId) || widget.id.startsWith(def.terminalId)) {
            return true;
        }
        if (this.liveTerminalByKind.get(def.kind) === widget.id) {
            return true;
        }
        const icon = widget.title.iconClass || '';
        const label = widget.title.label || '';
        if (icon === def.iconClass && (label === def.title || label.startsWith(def.title))) {
            return true;
        }
        // Terminal kind is set from options.kind = 'connectome-agent'
        const asTerm = widget as TerminalWidget;
        if (typeof asTerm.kind === 'string' && asTerm.kind === 'connectome-agent' && label === def.title) {
            return true;
        }
        return false;
    }

    protected isAgentTerminalWidget(widget: { id: string }, def: AgentDefinition): boolean {
        // A placeholder widget restored from layout might have the terminalId, but it's not a real terminal.
        // We ensure it is a TerminalWidget by checking for a known property (e.g. 'kind').
        if (widget.id.startsWith(def.terminalId)) {
            const tw = widget as TerminalWidget;
            if (typeof tw.kind === 'string' && tw.kind === 'connectome-agent') {
                return true;
            }
        }
        if (this.liveTerminalByKind.get(def.kind) === widget.id) {
            return true;
        }
        const tw = widget as TerminalWidget;
        if (typeof tw.kind === 'string' && tw.kind === 'connectome-agent' && tw.title?.label === def.title) {
            return true;
        }
        return false;
    }

    /** Public entry point for reopening a fresh terminal with a previously-logged seed (see AgentSessionLogWidget). */
    async openAgentFromLog(kind: AgentKind, seedText?: string): Promise<void> {
        await this.openAgent(kind, { seedText });
    }

    protected async openAgent(kind: AgentKind, options: OpenAgentOptions = {}): Promise<void> {
        const def = agentByKind(kind);
        const seedText = options.seedText?.trim() ? options.seedText : undefined;
        const existing = this.findTerminal(def);
        if (existing && !existing.isDisposed) {
            this.liveTerminalByKind.set(kind, existing.id);
            await this.closeLauncher(def);
            await this.shell.addWidget(existing, { area: 'right', rank: def.rank });
            this.dedupeAgentRail();
            await this.shell.revealWidget(existing.id);
            this.shell.activateWidget(existing.id);
            this.ensureRightPanelWidth();
            if (seedText) {
                this.seedTerminal(existing, seedText, 0);
                void this.logSession(def, existing, seedText);
            }
            return;
        }

        const cwd = this.resolveCwd();
        // Drop launcher *before* creating the terminal so the rail never briefly
        // shows two icons, and so restore can't race a second launcher in.
        await this.closeLauncher(def);

        const term = await this.terminalService.newTerminal({
            id: def.terminalId,
            title: def.title,
            iconClass: def.iconClass,
            shellPath: POWERSHELL_PATH,
            shellArgs: ['-NoLogo'],
            cwd,
            destroyTermOnClose: true,
            useServerTitle: false,
            kind: 'connectome-agent',
        });

        await term.start();
        this.liveTerminalByKind.set(kind, term.id);
        // Track by actual widget id (Theia may keep options.id as DOM id).
        this.startedCommands.add(term.id);
        this.startedCommands.add(def.terminalId);

        await this.shell.addWidget(term, { area: 'right', rank: def.rank });
        this.dedupeAgentRail();
        await this.shell.revealWidget(term.id);
        this.shell.activateWidget(term.id);
        this.ensureRightPanelWidth();

        term.onTerminalDidClose(() => {
            this.startedCommands.delete(def.terminalId);
            this.startedCommands.delete(term.id);
            if (this.liveTerminalByKind.get(kind) === term.id) {
                this.liveTerminalByKind.delete(kind);
            }
            void this.captureTranscriptOnClose(term);
            void this.rePinLauncher(def);
        });

        window.setTimeout(() => {
            if (!term.isDisposed) {
                term.sendText(`${def.startCommand}\r`);
            }
        }, START_COMMAND_DELAY_MS);

        if (seedText) {
            // Wait for PowerShell prompt + agent CLI to claim input before seeding.
            this.seedTerminal(term, seedText, START_COMMAND_DELAY_MS + SEED_AFTER_START_EXTRA_MS);
        }

        void this.logSession(def, term, seedText);
    }

    /**
     * Persist a log entry for this session right after the terminal is seeded
     * (or, for a freshly-created terminal, right after it starts). Remembers the
     * entry id so a later `onTerminalDidClose` can attach a transcript.
     */
    protected async logSession(def: AgentDefinition, term: TerminalWidget, seedText?: string): Promise<void> {
        const entry = await this.sessionLog.record({
            agentKind: def.kind,
            title: def.title,
            timestamp: Date.now(),
            seedText
        });
        this.logEntryByTerminalId.set(term.id, entry.id);
    }

    /**
     * Best-effort transcript capture on terminal close. TerminalWidget exposes a public
     * `buffer: TerminalBuffer` with `getLines(start, length, trimRight)` backed by xterm's
     * scrollback — no need to reach into a private/raw xterm.js `Terminal` instance, so this
     * is a supported, non-invasive read rather than a hack. If the buffer is empty or reading
     * it throws for any reason, the entry is left without a transcript (transcript stays
     * undefined) rather than blocking session logging.
     */
    protected async captureTranscriptOnClose(term: TerminalWidget): Promise<void> {
        const entryId = this.logEntryByTerminalId.get(term.id);
        this.logEntryByTerminalId.delete(term.id);
        if (!entryId) {
            return;
        }
        try {
            const length = term.buffer.length;
            if (!length) {
                return;
            }
            const lines = term.buffer.getLines(0, length, true);
            const transcript = lines.join('\n').trim();
            if (transcript) {
                await this.sessionLog.attachTranscript(entryId, transcript);
            }
        } catch {
            // Scrollback unavailable (e.g. terminal already torn down) — skip transcript,
            // the log entry itself was already persisted.
        }
    }

    /**
     * Type seed text into the terminal without submitting (no trailing CR).
     */
    protected seedTerminal(term: TerminalWidget, text: string, delayMs: number): void {
        const send = (): void => {
            if (!term.isDisposed && text) {
                term.sendText(text);
            }
        };
        if (delayMs <= 0) {
            send();
        } else {
            window.setTimeout(send, delayMs);
        }
    }

    /**
     * Expand the right panel to the product default if it is still cramped.
     * Does not shrink a user-widened panel. Left sidebar is untouched.
     */
    protected ensureRightPanelWidth(): void {
        const current = this.shell.rightPanelHandler.container.node.clientWidth;
        if (!current || current < CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH) {
            this.shell.resize(CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH, 'right');
        }
    }

    protected findTerminal(def: AgentDefinition): TerminalWidget | undefined {
        const mappedId = this.liveTerminalByKind.get(def.kind);
        if (mappedId) {
            const mapped = this.terminalService.getById(mappedId)
                ?? this.terminalService.all.find(t => t.id === mappedId);
            if (mapped && !mapped.isDisposed) {
                return mapped;
            }
        }
        const byId = this.terminalService.getById(def.terminalId);
        if (byId && !byId.isDisposed) {
            return byId;
        }
        // Layout restore may keep the terminal under a different DOM id; match by
        // kind + title/icon so we still treat it as this agent slot.
        return this.terminalService.all.find(t => {
            if (t.isDisposed) {
                return false;
            }
            if (t.id.startsWith(def.terminalId)) {
                return true;
            }
            if (t.kind === 'connectome-agent' && t.title.label === def.title) {
                return true;
            }
            if (t.title.iconClass === def.iconClass && t.title.label === def.title) {
                return true;
            }
            return false;
        });
    }

    protected async closeLauncher(def: AgentDefinition): Promise<void> {
        // Close every widget instance for this launcher factory (restore can leave extras).
        for (const launcher of this.widgetManager.getWidgets(def.launcherId)) {
            if (!launcher.isDisposed) {
                launcher.close();
            }
        }
        const single = await this.widgetManager.getWidget(def.launcherId);
        if (single && !single.isDisposed) {
            single.close();
        }
        // Also sweep any rail title still claiming this launcher id.
        const tabBar = this.shell.rightPanelHandler?.tabBar;
        if (tabBar) {
            for (const title of toArray(tabBar.titles)) {
                if (title.owner.id.startsWith(def.launcherId) && !title.owner.isDisposed) {
                    title.owner.close();
                }
            }
        }
    }

    protected async rePinLauncher(def: AgentDefinition): Promise<void> {
        // Only re-pin if no live terminal remains for this agent.
        const still = this.findTerminal(def);
        if (still && !still.isDisposed) {
            this.liveTerminalByKind.set(def.kind, still.id);
            this.dedupeAgentRail();
            return;
        }
        this.liveTerminalByKind.delete(def.kind);
        await this.closeLauncher(def);
        const launcher = await this.widgetManager.getOrCreateWidget(def.launcherId);
        await this.shell.addWidget(launcher, { area: 'right', rank: def.rank });
        this.dedupeAgentRail();
    }

    /**
     * Active note/file URI: navigatable shell widget first, then Monaco editor.
     */
    protected resolveActiveResourceUri(): URI | undefined {
        const current = this.shell.currentWidget;
        if (Navigatable.is(current)) {
            const uri = current.getResourceUri();
            if (uri) {
                return uri;
            }
        }
        const editorWidget = this.editorManager.currentEditor;
        if (editorWidget) {
            return editorWidget.editor.uri;
        }
        // Active main-area navigatable that is not the shell "current" after menu focus.
        for (const widget of this.shell.getWidgets('main')) {
            if (Navigatable.is(widget)) {
                const uri = widget.getResourceUri();
                if (uri) {
                    return uri;
                }
            }
        }
        return undefined;
    }

    /**
     * Non-empty text selection from the current Monaco/Theia text editor, if any.
     * Line numbers are 1-based for display (LSP selection is 0-based).
     */
    protected resolveSelection(): { text: string; startLine: number; endLine: number } | undefined {
        const editorWidget = this.editorManager.currentEditor
            ?? this.editorManager.all.find(w => w.isVisible && !w.isDisposed);
        if (!editorWidget) {
            return undefined;
        }
        const editor = editorWidget.editor;
        const selection = editor.selection;
        if (!selection) {
            return undefined;
        }
        if (
            selection.start.line === selection.end.line
            && selection.start.character === selection.end.character
        ) {
            return undefined;
        }
        const text = editor.document.getText(selection);
        if (!text || !text.trim()) {
            return undefined;
        }
        // 1-based lines. If the range ends at column 0, the end line is exclusive.
        const startLine = selection.start.line + 1;
        let endLine = selection.end.line + 1;
        if (selection.end.character === 0 && selection.end.line > selection.start.line) {
            endLine = selection.end.line; // 0-based end.line === 1-based last included line
        }
        if (endLine < startLine) {
            endLine = startLine;
        }
        return { text, startLine, endLine };
    }

    protected async resolveDisplayPath(uri: URI): Promise<string> {
        try {
            const relative = await this.workspaceService.getWorkspaceRelativePath(uri);
            if (relative) {
                return relative.replace(/\\/g, '/');
            }
        } catch {
            // fall through
        }
        try {
            return FileUri.fsPath(uri);
        } catch {
            return uri.path.toString();
        }
    }

    /**
     * Polished path-only handoff (no auto-Enter).
     */
    protected formatPathSeed(path: string): string {
        const displayPath = this.quotePathIfNeeded(path);
        return [
            'Help me with this Connectome note.',
            '',
            `Path: ${displayPath}`,
            '',
            'Please read it and wait for my question.',
        ].join('\n');
    }

    /**
     * Selection handoff: path, 1-based line range, fenced quote, short instruction.
     */
    protected formatSelectionSeed(
        path: string,
        selection: string,
        startLine: number,
        endLine: number,
    ): string {
        const displayPath = this.quotePathIfNeeded(path);
        let body = selection.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let truncated = false;
        if (body.length > SELECTION_SEED_MAX_CHARS) {
            body = body.slice(0, SELECTION_SEED_MAX_CHARS);
            truncated = true;
        }
        // Avoid breaking out of the fence if the selection itself contains """.
        body = body.replace(/"""/g, "'''");
        const linesLabel = startLine === endLine
            ? `Lines: ${startLine}`
            : `Lines: ${startLine}–${endLine}`;
        const quoteBlock = truncated
            ? `"""\n${body}\n…\n"""\n(selection truncated)`
            : `"""\n${body}\n"""`;
        return [
            'Help me with a passage from this Connectome note.',
            '',
            `Path: ${displayPath}`,
            linesLabel,
            '',
            'Quote:',
            quoteBlock,
            '',
            'Use this quote as the focus (full note at the path if needed). Wait for my question.',
        ].join('\n');
    }

    protected quotePathIfNeeded(path: string): string {
        if (/\s/.test(path) && !(path.startsWith('"') && path.endsWith('"'))) {
            return `"${path}"`;
        }
        return path;
    }

    /**
     * Prefer the folder of the active navigatable editor; else workspace root.
     */
    protected resolveCwd(): string | undefined {
        const uri = this.resolveActiveResourceUri();
        if (uri) {
            try {
                const fsPath = FileUri.fsPath(uri);
                const isDir = !uri.path.ext;
                if (isDir) {
                    return fsPath;
                }
                return FileUri.fsPath(uri.parent);
            } catch {
                // fall through
            }
        }
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length > 0) {
            try {
                return FileUri.fsPath(roots[0].resource);
            } catch {
                return undefined;
            }
        }
        return undefined;
    }
}
