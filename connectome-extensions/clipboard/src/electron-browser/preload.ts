import { contextBridge, ipcRenderer } from '@theia/core/electron-shared/electron';
import {
    CLIPBOARD_HISTORY_ITEM_EVENT,
    CLIPBOARD_OPEN_PATH,
    CLIPBOARD_REQUEST_SYNC,
    CLIPBOARD_WATCHER_STATUS_EVENT,
    ClipboardEntry,
    ClipboardSyncPayload,
    ClipboardWatcherStatus,
    ConnectomeClipboardAPI
} from '../common/clipboard-api';

const api: ConnectomeClipboardAPI = {
    onHistoryItem: listener => {
        const handler = (_event: unknown, entry: ClipboardEntry): void => listener(entry);
        ipcRenderer.on(CLIPBOARD_HISTORY_ITEM_EVENT, handler);
        return () => ipcRenderer.removeListener(CLIPBOARD_HISTORY_ITEM_EVENT, handler);
    },
    onWatcherStatus: listener => {
        const handler = (_event: unknown, status: ClipboardWatcherStatus, message?: string): void =>
            listener(status, message);
        ipcRenderer.on(CLIPBOARD_WATCHER_STATUS_EVENT, handler);
        return () => ipcRenderer.removeListener(CLIPBOARD_WATCHER_STATUS_EVENT, handler);
    },
    requestSync: () => ipcRenderer.invoke(CLIPBOARD_REQUEST_SYNC) as Promise<ClipboardSyncPayload>,
    openPath: filePath => ipcRenderer.invoke(CLIPBOARD_OPEN_PATH, filePath)
};

export function preload(): void {
    contextBridge.exposeInMainWorld('electronConnectomeClipboard', api);
}
