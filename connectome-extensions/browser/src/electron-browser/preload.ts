import { contextBridge, ipcRenderer } from '@theia/core/electron-shared/electron';
import { BROWSER_DOWNLOAD_EVENT, BROWSER_EXTERNAL, BROWSER_OPEN_PATH, BROWSER_SAVE_PAGE, BROWSER_SHOW_PATH, BrowserDownload, ConnectomeBrowserAPI } from '../common/browser-api';
const api: ConnectomeBrowserAPI = {
    savePage: (id, title, url) => ipcRenderer.invoke(BROWSER_SAVE_PAGE, id, title, url),
    openPath: path => ipcRenderer.invoke(BROWSER_OPEN_PATH, path),
    showPath: path => ipcRenderer.invoke(BROWSER_SHOW_PATH, path),
    openExternal: url => ipcRenderer.invoke(BROWSER_EXTERNAL, url),
    onDownload: listener => {
        const handler = (_event: unknown, download: BrowserDownload): void => listener(download);
        ipcRenderer.on(BROWSER_DOWNLOAD_EVENT, handler);
        return () => ipcRenderer.removeListener(BROWSER_DOWNLOAD_EVENT, handler);
    }
};
export function preload(): void { contextBridge.exposeInMainWorld('electronConnectomeBrowser', api); }
