import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { BrowserData, BrowserDownload, BrowserHistoryEntry, BrowserSearchEngine, SavedPage } from '../common/browser-api';

const KEY = 'connectome.browser.data.v1';

const SEARCH_ENGINE_URLS: Record<BrowserSearchEngine, string> = {
    duckduckgo: 'https://duckduckgo.com/?q=',
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q='
};

@injectable()
export class BrowserService {
    protected data: BrowserData = this.load();
    protected readonly changeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.changeEmitter.event;

    /** Currently focused browser tab chrome (main-area widget). */
    active: {
        navigate(url: string): void;
        url: string;
        pageTitle: string;
        webContentsId?: number;
        id?: string;
        updateChrome?(): void;
    } | undefined;

    get snapshot(): BrowserData {
        return this.data;
    }

    get searchEngine(): BrowserSearchEngine {
        return this.data.searchEngine || 'duckduckgo';
    }

    setSearchEngine(engine: BrowserSearchEngine): void {
        this.data.searchEngine = engine;
        this.save();
    }

    normalize(input: string): string {
        const value = input.trim();
        if (/^(https?:\/\/|file:\/\/)/i.test(value)) {
            return value;
        }
        if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)) {
            return `http://${value}`;
        }
        if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) {
            return `https://${value}`;
        }
        return `${SEARCH_ENGINE_URLS[this.searchEngine]}${encodeURIComponent(value)}`;
    }

    isBookmarked(url: string): boolean {
        return this.data.bookmarks.some(item => item.url === url);
    }

    addHistory(entry: Omit<BrowserHistoryEntry, 'id' | 'visitedAt'>): void {
        const previous = this.data.history[0];
        if (previous?.url === entry.url) {
            this.data.history[0] = { ...previous, ...entry, visitedAt: Date.now() };
        } else {
            this.data.history.unshift({ ...entry, id: crypto.randomUUID(), visitedAt: Date.now() });
        }
        this.data.history = this.data.history.slice(0, 5000);
        this.save();
    }

    /**
     * @returns true if the URL is now bookmarked, false if removed.
     */
    toggleBookmark(title: string, url: string): boolean {
        const index = this.data.bookmarks.findIndex(item => item.url === url);
        if (index >= 0) {
            this.data.bookmarks.splice(index, 1);
            this.save();
            return false;
        }
        this.data.bookmarks.unshift({ id: crypto.randomUUID(), title, url, createdAt: Date.now() });
        this.save();
        return true;
    }

    addSaved(page: SavedPage): void {
        this.data.savedPages.unshift(page);
        this.save();
    }

    upsertDownload(download: BrowserDownload): void {
        const index = this.data.downloads.findIndex(item => item.id === download.id);
        if (index >= 0) {
            this.data.downloads[index] = download;
        } else {
            this.data.downloads.unshift(download);
        }
        this.save();
    }

    remove(kind: 'bookmarks' | 'history' | 'savedPages' | 'downloads', id: string): void {
        const list = this.data[kind] as Array<{ id: string }>;
        const index = list.findIndex(x => x.id === id);
        if (index >= 0) {
            list.splice(index, 1);
            this.save();
        }
    }

    clearHistory(): void {
        this.data.history = [];
        this.save();
    }

    protected save(): void {
        localStorage.setItem(KEY, JSON.stringify(this.data));
        this.changeEmitter.fire();
    }

    protected load(): BrowserData {
        try {
            const value = JSON.parse(localStorage.getItem(KEY) || '');
            if (value.version === 1) {
                value.downloads = (value.downloads || []).map((download: BrowserDownload) =>
                    download.state === 'progressing' ? { ...download, state: 'failed' as const } : download
                );
                return value;
            }
        } catch {
            /* empty or corrupt */
        }
        return { version: 1, bookmarks: [], history: [], savedPages: [], downloads: [] };
    }
}
