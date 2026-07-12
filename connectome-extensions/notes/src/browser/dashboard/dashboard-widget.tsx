import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NoteIndexService } from '../note-index-service';
import { StarredNotesService } from '../starred/starred-notes-service';
import { CalendarService } from '../calendar/calendar-service';
import { formatRelativeTime, sortUrisByMtime, UriWithMtime } from '../activity/note-mtime';

@injectable()
export class DashboardWidget extends ReactWidget {

    static readonly ID = 'connectome-dashboard-home';
    static readonly LABEL = 'Home';

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

    protected recent: UriWithMtime[] = [];
    protected continueUri: URI | undefined;
    protected loading = true;

    @postConstruct()
    protected init(): void {
        this.id = DashboardWidget.ID;
        this.title.label = DashboardWidget.LABEL;
        this.title.caption = 'Workspace overview';
        this.title.iconClass = codicon('home');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.addClass('connectome-dashboard-widget');
        this.toDispose.push(this.index.onDidUpdate(() => void this.refresh()));
        this.toDispose.push(this.starred.onDidChange(() => this.update()));
        this.toDispose.push(this.calendar.onDidChange(() => this.update()));
        this.toDispose.push(this.editorManager.onCurrentEditorChanged(() => {
            this.updateContinue();
            this.update();
        }));
        void this.refresh();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        void this.refresh();
    }

    async refresh(): Promise<void> {
        this.loading = true;
        this.update();
        try {
            await this.index.initialize();
            this.recent = await sortUrisByMtime(
                this.fileService,
                this.index.getAllNoteUris(),
                { limit: 5 }
            );
            this.updateContinue();
        } catch {
            this.recent = [];
        } finally {
            this.loading = false;
            this.update();
        }
    }

    protected updateContinue(): void {
        const current = this.editorManager.currentEditor;
        if (current && this.isMarkdownEditor(current)) {
            const uri = current.getResourceUri();
            if (uri) {
                this.continueUri = uri;
                return;
            }
        }
        // Fall back to most recently edited note
        if (this.recent.length > 0) {
            this.continueUri = this.recent[0].uri;
        } else {
            this.continueUri = undefined;
        }
    }

    protected isMarkdownEditor(widget: EditorWidget): boolean {
        const uri = widget.getResourceUri();
        return !!uri && uri.path.ext.toLowerCase() === '.md';
    }

    protected render(): React.ReactNode {
        const noteCount = this.index.getAllNoteUris().length;
        const tagCount = this.index.getAllTags().size;
        const broken = this.index.getBrokenLinks().length;
        const orphans = this.index.getOrphanNotes().length;
        const starred = this.starred.getStarredUris().slice(0, 5);

        return <div className='connectome-dashboard'>
            <div className='connectome-dashboard-card'>
                <div className='connectome-dashboard-card-title'>
                    <span className={codicon('edit')} /> Continue writing
                </div>
                {this.continueUri
                    ? <button type='button' className='connectome-dashboard-link'
                        onClick={() => this.editorManager.open(this.continueUri!)}>
                        {this.continueUri.path.name}
                        <span className='connectome-notes-group-detail'>
                            {this.index.getWorkspaceRelativePath(this.continueUri)}
                        </span>
                    </button>
                    : <p className='connectome-notes-empty'>Open a note to continue.</p>}
            </div>

            <div className='connectome-dashboard-card'>
                <div className='connectome-dashboard-card-title'>
                    <span className={codicon('calendar')} /> Today
                </div>
                <div className='connectome-dashboard-today-row'>
                    <button type='button' className='theia-button connectome-dashboard-today-btn'
                        onClick={() => void this.calendar.openToday()}>
                        Open today&apos;s note
                    </button>
                </div>
            </div>

            <div className='connectome-dashboard-card'>
                <div className='connectome-dashboard-card-title'>
                    <span className={codicon('history')} /> Recent notes
                </div>
                {this.loading && this.recent.length === 0
                    ? <p className='connectome-notes-empty'>Loading…</p>
                    : this.recent.length === 0
                        ? <p className='connectome-notes-empty'>No notes yet.</p>
                        : <div className='connectome-notes-list'>
                            {this.recent.map(({ uri, mtime }) =>
                                <div className='connectome-notes-occurrence' key={uri.toString()}
                                    onClick={() => this.editorManager.open(uri)}>
                                    <span className={codicon('markdown') + ' connectome-notes-icon'} />
                                    <span className='connectome-notes-group-name'>{uri.path.name}</span>
                                    <span className='connectome-notes-group-detail'>
                                        {formatRelativeTime(mtime)}
                                    </span>
                                </div>
                            )}
                        </div>}
            </div>

            <div className='connectome-dashboard-card'>
                <div className='connectome-dashboard-card-title'>
                    <span className={codicon('star-full')} /> Starred
                </div>
                {starred.length === 0
                    ? <p className='connectome-notes-empty'>No starred notes.</p>
                    : <div className='connectome-notes-list'>
                        {starred.map(uri =>
                            <div className='connectome-notes-occurrence' key={uri.toString()}
                                onClick={() => this.editorManager.open(uri)}>
                                <span className={codicon('star-full') + ' connectome-notes-icon connectome-starred-icon'} />
                                <span className='connectome-notes-group-name'>{uri.path.name}</span>
                            </div>
                        )}
                    </div>}
            </div>

            <div className='connectome-dashboard-card'>
                <div className='connectome-dashboard-card-title'>
                    <span className={codicon('graph')} /> Workspace
                </div>
                <div className='connectome-dashboard-stats'>
                    <div><strong>{noteCount}</strong> notes</div>
                    <div><strong>{tagCount}</strong> tags</div>
                    <div><strong>{orphans}</strong> orphans</div>
                    <div><strong>{broken}</strong> broken links</div>
                </div>
                {broken > 0 &&
                    <button type='button' className='theia-button secondary connectome-dashboard-action'
                        onClick={() => void this.commands.executeCommand('connectomeNotes.diagnostics.toggle')}>
                        Open Notes Diagnostics
                    </button>}
            </div>
        </div>;
    }
}
