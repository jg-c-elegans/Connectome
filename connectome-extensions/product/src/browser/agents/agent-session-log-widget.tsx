import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { AgentSessionLogService, AgentSessionLogEntry } from './agent-session-log-service';
import { AgentSessionContribution } from './agent-session-contribution';

function formatRelativeTime(timestamp: number, now = Date.now()): string {
    if (!timestamp) {
        return '';
    }
    const diff = Math.max(0, now - timestamp);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) {
        return 'just now';
    }
    if (diff < hour) {
        return `${Math.floor(diff / minute)}m ago`;
    }
    if (diff < day) {
        return `${Math.floor(diff / hour)}h ago`;
    }
    if (diff < 7 * day) {
        return `${Math.floor(diff / day)}d ago`;
    }
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Rail widget listing persisted agent terminal sessions (newest first), with
 * agent/timestamp/seed preview and an action to reopen a fresh terminal with
 * the same seed text via AgentSessionContribution.openAgent().
 */
@injectable()
export class AgentSessionLogWidget extends ReactWidget {

    static readonly ID = 'connectome-agent-session-log-widget';
    static readonly LABEL = 'Sessions';

    @inject(AgentSessionLogService)
    protected readonly log: AgentSessionLogService;

    @inject(AgentSessionContribution)
    protected readonly agentSessions: AgentSessionContribution;

    @postConstruct()
    protected init(): void {
        this.id = AgentSessionLogWidget.ID;
        this.title.label = AgentSessionLogWidget.LABEL;
        this.title.caption = 'History of agent terminal sessions opened from Connectome';
        this.title.iconClass = codicon('robot');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.log.onDidChange(() => this.update()));
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const entries = this.log.getEntries();
        if (entries.length === 0) {
            return <div className='connectome-notes-empty'>
                No agent sessions logged yet. Opening Claude Code, Codex, or Antigravity records a session here.
            </div>;
        }
        return <div className='connectome-notes-list'>
            {entries.map(entry => this.renderItem(entry))}
        </div>;
    }

    protected renderItem(entry: AgentSessionLogEntry): React.ReactNode {
        const preview = entry.seedText ? this.firstLine(entry.seedText) : '(no seed text)';
        return <div
            className='connectome-notes-occurrence'
            key={entry.id}
            title={entry.seedText ?? ''}
            onClick={() => void this.reopen(entry)}
        >
            <span className={codicon(this.iconFor(entry)) + ' connectome-notes-icon'} />
            <span className='connectome-notes-group-name'>{entry.title}</span>
            <span className='connectome-notes-group-detail'>
                {preview} · {formatRelativeTime(entry.timestamp)}
            </span>
        </div>;
    }

    protected iconFor(entry: AgentSessionLogEntry): string {
        switch (entry.agentKind) {
            case 'claude': return 'claude';
            case 'codex': return 'openai';
            case 'antigravity': return 'antigravity';
            default: return 'terminal';
        }
    }

    protected firstLine(text: string): string {
        const line = text.split('\n')[0] ?? '';
        return line.length > 80 ? line.slice(0, 80) + '…' : line;
    }

    protected async reopen(entry: AgentSessionLogEntry): Promise<void> {
        await this.agentSessions.openAgentFromLog(entry.agentKind, entry.seedText);
    }
}
