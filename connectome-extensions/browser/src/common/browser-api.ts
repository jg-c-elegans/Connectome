export const BROWSER_SAVE_PAGE = 'connectomeBrowser:savePage';
export const BROWSER_OPEN_PATH = 'connectomeBrowser:openPath';
export const BROWSER_SHOW_PATH = 'connectomeBrowser:showPath';
export const BROWSER_EXTERNAL = 'connectomeBrowser:openExternal';
export const BROWSER_DOWNLOAD_EVENT = 'connectomeBrowser:downloadEvent';

export interface BrowserBookmark { id: string; title: string; url: string; createdAt: number }
export interface BrowserHistoryEntry { id: string; title: string; url: string; visitedAt: number; favicon?: string }
export interface SavedPage { id: string; title: string; url: string; path: string; savedAt: number }
export interface BrowserDownload {
    id: string;
    filename: string;
    path: string;
    state: 'progressing' | 'completed' | 'cancelled' | 'failed';
    receivedBytes: number;
    totalBytes: number;
    startedAt: number;
}
export type BrowserSearchEngine = 'duckduckgo' | 'google' | 'bing';
export interface BrowserData {
    version: 1;
    bookmarks: BrowserBookmark[];
    history: BrowserHistoryEntry[];
    savedPages: SavedPage[];
    downloads: BrowserDownload[];
    searchEngine?: BrowserSearchEngine;
}
export interface ConnectomeBrowserAPI {
    savePage(webContentsId: number, title: string, url: string): Promise<SavedPage | undefined>;
    openPath(path: string): Promise<string>;
    showPath(path: string): Promise<void>;
    openExternal(url: string): Promise<void>;
    onDownload(listener: (download: BrowserDownload) => void): () => void;
}
declare global { interface Window { electronConnectomeBrowser?: ConnectomeBrowserAPI } }
