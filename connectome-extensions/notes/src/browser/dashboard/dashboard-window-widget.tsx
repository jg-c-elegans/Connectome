import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { NoteIndexService } from '../note-index-service';
import { StarredNotesService } from '../starred/starred-notes-service';
import { CalendarService } from '../calendar/calendar-service';
import { formatRelativeTime, sortUrisByMtime, UriWithMtime } from '../activity/note-mtime';
import { MiniCalendar } from './mini-calendar';

const APP_LAUNCHER_STORAGE_KEY = 'connectome.dashboard.appLauncher';

interface AppLauncherEntry {
    id: string;
    label: string;
    exePath: string;
    iconDataUri?: string;
}

interface BookmarkLike { id: string; title: string; url: string }
interface ScriptLike { name: string; language: string }
interface ClipboardEntryLike { id: string; type: string; text?: string; paths?: string[]; cachedImagePath?: string }
interface GitStatusLike { isRepo: boolean; branch?: string; changedFiles?: number; recentCommits?: { hash: string; message: string }[]; error?: string }
interface SystemInfoLike {
    platform: string; arch: string; hostname: string; osVersion: string; uptimeSeconds: number;
    cpuModel: string; cpuCores: number; totalMemGB: number; freeMemGB: number;
    nodeVersion: string; electronVersion: string; chromeVersion: string; homeDir: string;
}
interface SystemPerfLike { cpuPercent: number; ramPercent: number; diskPercent?: number; batteryPercent?: number; batteryCharging?: boolean }

@injectable()
export class DashboardWindowWidget extends ReactWidget {

    static readonly ID = 'connectome-dashboard-window';

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(StarredNotesService)
    protected readonly starred: StarredNotesService;

    @inject(CalendarService)
    protected readonly calendar: CalendarService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(StorageService)
    protected readonly storage: StorageService;

    protected recent: UriWithMtime[] = [];
    protected continueUri: URI | undefined;

    protected bookmarks: BookmarkLike[] = [];
    protected scriptFavorites: ScriptLike[] = [];
    protected clipboardRecent: { history: ClipboardEntryLike[]; saved: ClipboardEntryLike[] } = { history: [], saved: [] };
    protected gitStatus: GitStatusLike = { isRepo: false };
    protected systemInfo: SystemInfoLike | undefined;
    protected systemPerf: SystemPerfLike | undefined;
    protected appLauncherEntries: AppLauncherEntry[] = [];

    protected perfTimer: ReturnType<typeof setInterval> | undefined;

    @postConstruct()
    protected init(): void {
        this.id = DashboardWindowWidget.ID;
        this.title.label = 'Dashboard';
        this.title.caption = 'Dashboard';
        this.title.iconClass = codicon('home');
        this.title.closable = true;
        this.addClass('connectome-dashboard-window');
        this.toDispose.push(this.index.onDidUpdate(() => void this.refreshNotes()));
        this.toDispose.push(this.starred.onDidChange(() => this.update()));
        void this.refreshAll();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        void this.refreshAll();
        if (!this.perfTimer) {
            this.perfTimer = setInterval(() => void this.refreshPerf(), 3000);
        }
    }

    protected override onBeforeDetach(msg: Message): void {
        super.onBeforeDetach(msg);
        if (this.perfTimer) {
            clearInterval(this.perfTimer);
            this.perfTimer = undefined;
        }
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        void this.refreshCrossExtensionData();
    }

    protected async refreshAll(): Promise<void> {
        await Promise.all([
            this.refreshNotes(),
            this.refreshCrossExtensionData(),
            this.refreshGitStatus(),
            this.refreshSystemInfo(),
            this.refreshPerf(),
            this.loadAppLauncher()
        ]);
    }

    protected async refreshNotes(): Promise<void> {
        try {
            await this.index.initialize();
            this.recent = await sortUrisByMtime(this.fileService, this.index.getAllNoteUris(), { limit: 5 });
        } catch {
            this.recent = [];
        }
        const current = this.editorManager.currentEditor;
        if (current && this.isMarkdownEditor(current)) {
            this.continueUri = current.getResourceUri();
        } else if (this.recent.length > 0) {
            this.continueUri = this.recent[0].uri;
        }
        this.update();
    }

    protected isMarkdownEditor(widget: EditorWidget): boolean {
        const uri = widget.getResourceUri();
        return !!uri && uri.path.ext.toLowerCase() === '.md';
    }

    protected async refreshCrossExtensionData(): Promise<void> {
        const [bookmarks, favorites, clip] = await Promise.all([
            this.commands.executeCommand<BookmarkLike[]>('connectome.browser.getBookmarks').catch(() => undefined),
            this.commands.executeCommand<ScriptLike[]>('connectome.scripts.getFavorites').catch(() => undefined),
            this.commands.executeCommand<{ history: ClipboardEntryLike[]; saved: ClipboardEntryLike[] }>('connectome.clipboard.getRecent').catch(() => undefined)
        ]);
        this.bookmarks = bookmarks?.slice(0, 5) ?? [];
        this.scriptFavorites = favorites ?? [];
        this.clipboardRecent = clip ?? { history: [], saved: [] };
        this.update();
    }

    protected async refreshGitStatus(): Promise<void> {
        const root = this.workspaceService.tryGetRoots()[0];
        if (!root || !window.electronConnectomeSystem) {
            this.gitStatus = { isRepo: false };
            this.update();
            return;
        }
        try {
            this.gitStatus = await window.electronConnectomeSystem.getGitStatus(FileUri.fsPath(root.resource));
        } catch {
            this.gitStatus = { isRepo: false };
        }
        this.update();
    }

    protected async refreshSystemInfo(): Promise<void> {
        try {
            this.systemInfo = await window.electronConnectomeSystem?.getSystemInfo();
        } catch {
            this.systemInfo = undefined;
        }
        this.update();
    }

    protected async refreshPerf(): Promise<void> {
        try {
            this.systemPerf = await window.electronConnectomeSystem?.getSystemPerf();
        } catch {
            this.systemPerf = undefined;
        }
        this.update();
    }

    protected async loadAppLauncher(): Promise<void> {
        this.appLauncherEntries = await this.storage.getData<AppLauncherEntry[]>(APP_LAUNCHER_STORAGE_KEY, []);
        this.update();
    }

    protected async addAppLauncherEntry(): Promise<void> {
        const api = window.electronConnectomeSystem;
        if (!api) {
            return;
        }
        const exePath = await api.pickExecutable();
        if (!exePath) {
            return;
        }
        const base = exePath.split(/[\\/]/).pop() ?? 'App';
        const label = base.replace(/\.exe$/i, '');

        const iconDataUri = await api.getFileIcon(exePath);

        const entry: AppLauncherEntry = { id: crypto.randomUUID(), label, exePath, iconDataUri };
        this.appLauncherEntries = [...this.appLauncherEntries, entry];
        await this.storage.setData(APP_LAUNCHER_STORAGE_KEY, this.appLauncherEntries);
        this.update();
    }

    protected async removeAppLauncherEntry(id: string): Promise<void> {
        this.appLauncherEntries = this.appLauncherEntries.filter(e => e.id !== id);
        await this.storage.setData(APP_LAUNCHER_STORAGE_KEY, this.appLauncherEntries);
        this.update();
    }

    protected runScript(name: string): void {
        window.dispatchEvent(new CustomEvent('connectome-scripts-run', { detail: name }));
    }

    protected openClipboardItem(item: ClipboardEntryLike): void {
        window.dispatchEvent(new CustomEvent('connectome-clipboard-open', { detail: item }));
    }

    protected render(): React.ReactNode {
        const noteCount = this.index.getAllNoteUris().length;
        const tagCount = this.index.getAllTags().size;
        const broken = this.index.getBrokenLinks().length;
        const orphans = this.index.getOrphanNotes().length;
        const starredUris = this.starred.getStarredUris().slice(0, 5);
        const now = new Date();

        return <div className='connectome-dashboard-window__root'>
            <header className='connectome-dashboard-window__hero'>
                <h1>Dashboard</h1>
                <p>{now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </header>

            <div className='connectome-dashboard-window__footer-row'>
                {this.renderCard('play-circle', 'Quick launch', this.scriptFavorites.length === 0
                    ? <p className='connectome-notes-empty'>No favorited scripts yet.</p>
                    : <div className='connectome-notes-list'>
                        {this.scriptFavorites.map(s =>
                            <div className='connectome-notes-occurrence' key={s.name} onClick={() => this.runScript(s.name)}>
                                <span className={codicon('play') + ' connectome-notes-icon'} />
                                <span className='connectome-notes-group-name'>{s.name}</span>
                            </div>)}
                    </div>)}
                {this.renderCard('clippy', 'Recent clipboard', (this.clipboardRecent.saved.length + this.clipboardRecent.history.length) === 0
                    ? <p className='connectome-notes-empty'>Nothing copied yet.</p>
                    : <div className='connectome-notes-list'>
                        {[...this.clipboardRecent.saved, ...this.clipboardRecent.history].slice(0, 5).map(item =>
                            <div className='connectome-notes-occurrence' key={item.id} onClick={() => this.openClipboardItem(item)}>
                                <span className={codicon(item.type === 'text' ? 'symbol-string' : item.type === 'image' ? 'file-media' : 'file') + ' connectome-notes-icon'} />
                                <span className='connectome-notes-group-name'>
                                    {item.type === 'text' ? (item.text ?? '').slice(0, 60) : (item.paths?.join(', ') ?? item.cachedImagePath ?? '')}
                                </span>
                            </div>)}
                    </div>)}
            </div>

            <div className='connectome-dashboard-window__grid'>
                <div className='connectome-dashboard-window__column'>
                    {this.renderCard('rocket', 'Start', <>
                        {this.renderAction('New File', () => this.commands.executeCommand('workbench.action.files.newUntitledFile'), 'new-file')}
                        {this.renderAction('Open Folder', () => this.commands.executeCommand('workbench.action.files.openFolder'), 'folder-opened')}
                    </>)}
                    {this.renderCard('edit', 'Continue writing', this.continueUri
                        ? <button type='button' className='connectome-dashboard-link' onClick={() => this.editorManager.open(this.continueUri!)}>
                            {this.continueUri.path.name}
                            <span className='connectome-notes-group-detail'>{this.index.getWorkspaceRelativePath(this.continueUri)}</span>
                        </button>
                        : <p className='connectome-notes-empty'>Open a note to continue.</p>)}
                    {this.renderCard('history', 'Recent notes', this.recent.length === 0
                        ? <p className='connectome-notes-empty'>No notes yet.</p>
                        : <div className='connectome-notes-list'>
                            {this.recent.map(({ uri, mtime }) =>
                                <div className='connectome-notes-occurrence' key={uri.toString()} onClick={() => this.editorManager.open(uri)}>
                                    <span className={codicon('markdown') + ' connectome-notes-icon'} />
                                    <span className='connectome-notes-group-name'>{uri.path.name}</span>
                                    <span className='connectome-notes-group-detail'>{formatRelativeTime(mtime)}</span>
                                </div>)}
                        </div>)}
                    {this.renderCard('star-full', 'Starred', starredUris.length === 0
                        ? <p className='connectome-notes-empty'>No starred notes.</p>
                        : <div className='connectome-notes-list'>
                            {starredUris.map(uri =>
                                <div className='connectome-notes-occurrence' key={uri.toString()} onClick={() => this.editorManager.open(uri)}>
                                    <span className={codicon('star-full') + ' connectome-notes-icon connectome-starred-icon'} />
                                    <span className='connectome-notes-group-name'>{uri.path.name}</span>
                                </div>)}
                        </div>)}
                    {this.renderCard('graph', 'Workspace', <div className='connectome-dashboard-stats'>
                        <div><strong>{noteCount}</strong> notes</div>
                        <div><strong>{tagCount}</strong> tags</div>
                        <div><strong>{orphans}</strong> orphans</div>
                        <div><strong>{broken}</strong> broken links</div>
                    </div>)}
                </div>

                <div className='connectome-dashboard-window__column'>
                    {this.renderCard('git-commit', 'Git', this.renderGitCard())}
                    {this.renderCard('calendar', 'Today', <div className='connectome-dashboard-window__today-row'>
                        <button type='button' className='theia-button connectome-dashboard-today-btn' onClick={() => void this.calendar.openToday()}>
                            Open today&apos;s note
                        </button>
                        <MiniCalendar
                            existingKeys={this.calendar.existingDailyKeys()}
                            formatDate={date => this.calendar.formatDate(date)}
                            onSelectDate={date => void this.calendar.openOrCreate(date)}
                        />
                    </div>)}
                    {this.renderCard('bookmark', 'Bookmarks', this.bookmarks.length === 0
                        ? <p className='connectome-notes-empty'>No bookmarks yet.</p>
                        : <div className='connectome-notes-list'>
                            {this.bookmarks.map(b =>
                                <div className='connectome-notes-occurrence' key={b.id} title={b.url}
                                    onClick={() => window.dispatchEvent(new CustomEvent('connectome-browser-new-tab', { detail: b.url }))}>
                                    <span className={codicon('link') + ' connectome-notes-icon'} />
                                    <span className='connectome-notes-group-name'>{b.title || b.url}</span>
                                </div>)}
                        </div>)}
                </div>

                <div className='connectome-dashboard-window__column'>
                    {this.renderCard('pulse', 'System', this.renderPerfCard())}
                    {this.renderCard('info', 'System info', this.renderSystemInfoCard())}
                    {this.renderCard('rocket', 'App Launcher', this.renderAppLauncherCard())}
                </div>
            </div>
        </div>;
    }

    protected renderCard(icon: string, title: string, content: React.ReactNode): React.ReactNode {
        return <div className='connectome-dashboard-window__card' key={title}>
            <div className='connectome-dashboard-window__card-title'>
                <span className={codicon(icon)} /> {title}
            </div>
            <div className='connectome-dashboard-window__card-content'>{content}</div>
        </div>;
    }

    protected renderAction(label: string, onClick: () => void, icon: string): React.ReactNode {
        return <div className='connectome-dashboard-window__action' onClick={onClick}>
            <span className={codicon(icon)} />
            <span>{label}</span>
        </div>;
    }

    protected renderGitCard(): React.ReactNode {
        const status = this.gitStatus;
        if (!status.isRepo) {
            return <p className='connectome-notes-empty'>Not a git repository.</p>;
        }
        if (status.error) {
            return <p className='connectome-notes-empty'>{status.error}</p>;
        }
        return <div>
            <div className='connectome-dashboard-window__git-summary'>
                <span className={codicon('git-branch')} /> {status.branch}
                <span className='connectome-notes-group-detail'>{status.changedFiles ?? 0} changed</span>
            </div>
            <div className='connectome-notes-list'>
                {(status.recentCommits ?? []).map(c =>
                    <div className='connectome-notes-occurrence' key={c.hash} title={c.message}>
                        <span className={codicon('git-commit') + ' connectome-notes-icon'} />
                        <span className='connectome-notes-group-name'>{c.message}</span>
                        <span className='connectome-notes-group-detail'>{c.hash}</span>
                    </div>)}
            </div>
        </div>;
    }

    protected renderPerfDial(label: string, percent: number | undefined): React.ReactNode {
        const value = percent ?? 0;
        const radius = 22;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - value / 100);
        return <div className='connectome-dashboard-window__dial' key={label}>
            <svg viewBox='0 0 56 56' width='56' height='56'>
                <circle cx='28' cy='28' r={radius} className='connectome-dashboard-window__dial-track' />
                <circle cx='28' cy='28' r={radius} className='connectome-dashboard-window__dial-value'
                    strokeDasharray={circumference} strokeDashoffset={offset} />
                <text x='28' y='32' textAnchor='middle' className='connectome-dashboard-window__dial-text'>
                    {percent === undefined ? '–' : `${value}%`}
                </text>
            </svg>
            <span>{label}</span>
        </div>;
    }

    protected renderPerfCard(): React.ReactNode {
        const perf = this.systemPerf;
        return <div className='connectome-dashboard-window__dials'>
            {this.renderPerfDial('CPU', perf?.cpuPercent)}
            {this.renderPerfDial('RAM', perf?.ramPercent)}
            {this.renderPerfDial('Disk', perf?.diskPercent)}
            {this.renderPerfDial(perf?.batteryCharging ? 'Battery ⚡' : 'Battery', perf?.batteryPercent)}
        </div>;
    }

    protected renderSystemInfoCard(): React.ReactNode {
        const info = this.systemInfo;
        if (!info) {
            return <p className='connectome-notes-empty'>Unavailable.</p>;
        }
        const hours = Math.floor(info.uptimeSeconds / 3600);
        const minutes = Math.floor((info.uptimeSeconds % 3600) / 60);
        return <div className='connectome-dashboard-window__info-grid'>
            <div><span className='connectome-notes-group-detail'>Host</span><strong>{info.hostname}</strong></div>
            <div><span className='connectome-notes-group-detail'>OS</span>{info.platform} ({info.arch}) {info.osVersion}</div>
            <div><span className='connectome-notes-group-detail'>Uptime</span>{hours}h {minutes}m</div>
            <div><span className='connectome-notes-group-detail'>CPU</span>{info.cpuModel} ({info.cpuCores} cores)</div>
            <div><span className='connectome-notes-group-detail'>Memory</span>{info.freeMemGB} GB free / {info.totalMemGB} GB total</div>
            <div><span className='connectome-notes-group-detail'>Home</span>{info.homeDir}</div>
            <div><span className='connectome-notes-group-detail'>Runtime</span>Node {info.nodeVersion} · Electron {info.electronVersion} · Chrome {info.chromeVersion}</div>
        </div>;
    }

    protected renderAppLauncherCard(): React.ReactNode {
        return <div className='connectome-dashboard-window__app-launcher'>
            <div className='connectome-dashboard-window__app-grid'>
                {this.appLauncherEntries.map(entry =>
                    <div className='connectome-dashboard-window__app-tile' key={entry.id}
                        title={entry.exePath}
                        onClick={() => void window.electronConnectomeSystem?.launchApp(entry.exePath)}>
                        <span
                            className='connectome-dashboard-window__app-remove'
                            onClick={e => { e.stopPropagation(); void this.removeAppLauncherEntry(entry.id); }}
                        >×</span>
                        {entry.iconDataUri
                            ? <img src={entry.iconDataUri} />
                            : <span className={codicon('symbol-file') + ' connectome-dashboard-window__app-icon'} />}
                        <span className='connectome-dashboard-window__app-label'>{entry.label}</span>
                    </div>)}
                <div className='connectome-dashboard-window__app-tile connectome-dashboard-window__app-tile--add' onClick={() => void this.addAppLauncherEntry()}>
                    <span className={codicon('add')} />
                </div>
            </div>
        </div>;
    }
}
