export const CLIPBOARD_HISTORY_ITEM_EVENT = 'connectomeClipboard:historyItem';
export const CLIPBOARD_WATCHER_STATUS_EVENT = 'connectomeClipboard:watcherStatus';
export const CLIPBOARD_OPEN_PATH = 'connectomeClipboard:openPath';
/** Renderer → main: re-send buffered status + history (fixes race before window exists). */
export const CLIPBOARD_REQUEST_SYNC = 'connectomeClipboard:requestSync';

export type ClipboardEntryType = 'text' | 'file' | 'image';

export interface ClipboardEntry {
    id: string;
    type: ClipboardEntryType;
    /** type: text */
    text?: string;
    /** type: file — real file(s) copied (e.g. from Explorer) */
    paths?: string[];
    /** type: image — bitmap saved to a local cache dir as BMP (not PNG) */
    cachedImagePath?: string;
    timestamp: number;
}

export type ClipboardWatcherStatus = 'running' | 'disabled' | 'error';

export interface ClipboardSyncPayload {
    status: ClipboardWatcherStatus;
    message?: string;
    entries: ClipboardEntry[];
}

export interface ConnectomeClipboardAPI {
    onHistoryItem(listener: (entry: ClipboardEntry) => void): () => void;
    onWatcherStatus(listener: (status: ClipboardWatcherStatus, message?: string) => void): () => void;
    /** Ask main to re-broadcast buffered watcher status and history entries. */
    requestSync(): Promise<ClipboardSyncPayload>;
    openPath(path: string): Promise<string>;
}

declare global { interface Window { electronConnectomeClipboard?: ConnectomeClipboardAPI } }
