import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { OpenerService, open } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { NoteIndexService } from '../note-index-service';
import {
    DEFAULT_DAILY_FOLDER,
    DEFAULT_DAILY_TEMPLATE,
    NOTES_DAILY_FOLDER_PREF,
    NOTES_DAILY_TEMPLATE_PREF,
} from '../notes-preferences';
import { renderDailyTemplate } from './daily-template';

/** Matches daily note stems: YYYY-MM-DD */
export const DAILY_NOTE_STEM = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Daily notes: open or create `YYYY-MM-DD.md` under the configured workspace
 * folder (default `daily_notes/`). New files use `connectome.notes.dailyTemplate`.
 */
@injectable()
export class CalendarService {

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.index.onDidUpdate(() => this.onDidChangeEmitter.fire());
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === NOTES_DAILY_FOLDER_PREF
                || e.preferenceName === NOTES_DAILY_TEMPLATE_PREF) {
                this.onDidChangeEmitter.fire();
            }
        });
    }

    /** Normalized relative folder under workspace root (no leading/trailing slashes). */
    getDailyFolder(): string {
        const raw = this.preferences.get(NOTES_DAILY_FOLDER_PREF, DEFAULT_DAILY_FOLDER);
        return String(raw ?? DEFAULT_DAILY_FOLDER).trim().replace(/^[/\\]+|[/\\]+$/g, '');
    }

    getDailyTemplate(): string {
        const raw = this.preferences.get(NOTES_DAILY_TEMPLATE_PREF, DEFAULT_DAILY_TEMPLATE);
        return String(raw ?? DEFAULT_DAILY_TEMPLATE);
    }

    formatDate(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    parseDateKey(key: string): Date | undefined {
        const match = DAILY_NOTE_STEM.exec(key);
        if (!match) {
            return undefined;
        }
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const date = new Date(year, month, day);
        if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
            return undefined;
        }
        return date;
    }

    /** URI for a daily note key `YYYY-MM-DD` (does not create the file). */
    uriForDateKey(key: string): URI | undefined {
        if (!DAILY_NOTE_STEM.test(key)) {
            return undefined;
        }
        const roots = this.workspace.tryGetRoots();
        if (roots.length === 0) {
            return undefined;
        }
        const folder = this.getDailyFolder();
        const base = folder
            ? roots[0].resource.resolve(folder)
            : roots[0].resource;
        return base.resolve(`${key}.md`);
    }

    uriForDate(date: Date): URI | undefined {
        return this.uriForDateKey(this.formatDate(date));
    }

    /**
     * True when `uri` is a daily note under the configured folder
     * (or workspace root when the folder pref is empty).
     */
    isDailyNoteUri(uri: URI): boolean {
        if (!DAILY_NOTE_STEM.test(uri.path.name)) {
            return false;
        }
        const folderUri = this.dailyFolderUri();
        if (!folderUri) {
            return false;
        }
        const parent = uri.parent;
        return parent.toString() === folderUri.toString()
            || parent.path.toString().toLowerCase() === folderUri.path.toString().toLowerCase();
    }

    protected dailyFolderUri(): URI | undefined {
        const roots = this.workspace.tryGetRoots();
        if (roots.length === 0) {
            return undefined;
        }
        const folder = this.getDailyFolder();
        return folder ? roots[0].resource.resolve(folder) : roots[0].resource;
    }

    async openOrCreate(date: Date): Promise<URI | undefined> {
        const key = this.formatDate(date);
        const uri = this.uriForDateKey(key);
        if (!uri) {
            return undefined;
        }
        if (!(await this.fileService.exists(uri))) {
            const parent = uri.parent;
            if (!(await this.fileService.exists(parent))) {
                await this.fileService.createFolder(parent);
            }
            let clipboard = '';
            try {
                clipboard = await this.clipboard.readText() ?? '';
            } catch {
                clipboard = '';
            }
            const body = renderDailyTemplate(this.getDailyTemplate(), {
                dateKey: key,
                clipboard,
                date,
            });
            await this.fileService.create(uri, body);
            await this.index.indexUri(uri, body);
        }
        await open(this.openerService, uri);
        this.onDidChangeEmitter.fire();
        return uri;
    }

    async openToday(): Promise<URI | undefined> {
        return this.openOrCreate(new Date());
    }

    /** Set of date keys (`YYYY-MM-DD`) that already have a note in the daily folder. */
    existingDailyKeys(): Set<string> {
        const keys = new Set<string>();
        for (const uri of this.index.getAllNoteUris()) {
            if (this.isDailyNoteUri(uri)) {
                keys.add(uri.path.name);
            }
        }
        return keys;
    }

    /** Daily notes in the configured folder, newest-first by date key. */
    listDailyNotes(): URI[] {
        return this.index.getAllNoteUris()
            .filter(uri => this.isDailyNoteUri(uri))
            .sort((a, b) => b.path.name.localeCompare(a.path.name));
    }

    async ensureIndex(): Promise<void> {
        await this.index.initialize();
    }
}
