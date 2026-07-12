import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AgentKind } from './agent-ids';

const STORAGE_PREFIX = 'connectome.agentSessionLog';
const MAX_ENTRIES = 200;

export interface AgentSessionLogEntry {
    id: string;
    agentKind: AgentKind;
    title: string;
    timestamp: number;
    seedText?: string;
    /**
     * Best-effort scrollback capture from the terminal's xterm buffer, taken on
     * terminal close via `TerminalWidget.buffer.getLines(...)`. Undefined when the
     * terminal never closed during this session or the capture failed - see
     * AgentSessionContribution for details on why this is attempted this way.
     */
    transcript?: string;
}

/**
 * Workspace-scoped, persisted log of agent terminal sessions opened via
 * AgentSessionContribution.openAgent(). Mirrors StarredNotesService's
 * StorageService usage pattern (keyed by workspace root).
 */
@injectable()
export class AgentSessionLogService {

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    protected entries: AgentSessionLogEntry[] = [];
    protected ready = false;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.reload().catch(() => { /* ignore */ });
        this.workspace.onWorkspaceChanged(() => {
            this.reload().catch(() => { /* ignore */ });
        });
    }

    protected storageKey(): string {
        const roots = this.workspace.tryGetRoots();
        const id = roots.length > 0 ? roots[0].resource.toString() : 'no-workspace';
        return `${STORAGE_PREFIX}:${id}`;
    }

    async reload(): Promise<void> {
        const data = await this.storage.getData<AgentSessionLogEntry[]>(this.storageKey(), []);
        this.entries = Array.isArray(data) ? data : [];
        this.ready = true;
        this.onDidChangeEmitter.fire();
    }

    protected async persist(): Promise<void> {
        await this.storage.setData(this.storageKey(), [...this.entries]);
        this.onDidChangeEmitter.fire();
    }

    getEntries(): AgentSessionLogEntry[] {
        // Newest first.
        return [...this.entries].sort((a, b) => b.timestamp - a.timestamp);
    }

    async record(entry: Omit<AgentSessionLogEntry, 'id'>): Promise<AgentSessionLogEntry> {
        const full: AgentSessionLogEntry = {
            id: `${entry.timestamp}-${Math.random().toString(36).slice(2)}`,
            ...entry
        };
        this.entries = [full, ...this.entries].slice(0, MAX_ENTRIES);
        await this.persist();
        return full;
    }

    /** Attach a transcript to a previously recorded entry (e.g. on terminal close). */
    async attachTranscript(id: string, transcript: string): Promise<void> {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) {
            return;
        }
        this.entries[index] = { ...this.entries[index], transcript };
        await this.persist();
    }
}
