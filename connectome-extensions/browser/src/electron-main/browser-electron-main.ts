import { injectable } from '@theia/core/shared/inversify';
import {
    ElectronMainApplication,
    ElectronMainApplicationContribution
} from '@theia/core/lib/electron-main/electron-main-application';
import { app, ipcMain, session, shell, webContents } from '@theia/core/electron-shared/electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
    BROWSER_DOWNLOAD_EVENT,
    BROWSER_EXTERNAL,
    BROWSER_OPEN_PATH,
    BROWSER_SAVE_PAGE,
    BROWSER_SHOW_PATH,
    BrowserDownload,
    SavedPage
} from '../common/browser-api';
import blockedHostnames from './blocklist/ad-tracker-blocklist.json';

const BROWSER_PARTITION = 'persist:connectome-browser';

/** Static set of known ad/tracker hostnames, see blocklist/BLOCKLIST-LICENSE.txt. */
const AD_TRACKER_BLOCKLIST: ReadonlySet<string> = new Set((blockedHostnames as string[]).map(h => h.toLowerCase()));

/** True if `hostname` is (or is a subdomain of) a blocked domain. Walks parent domains, e.g. `a.b.doubleclick.net` -> `b.doubleclick.net` -> `doubleclick.net`. */
function isBlockedHostname(hostname: string): boolean {
    let host = hostname.toLowerCase();
    while (host.length > 0) {
        if (AD_TRACKER_BLOCKLIST.has(host)) {
            return true;
        }
        const dot = host.indexOf('.');
        if (dot === -1) {
            break;
        }
        host = host.slice(dot + 1);
    }
    return false;
}

@injectable()
export class BrowserElectronMain implements ElectronMainApplicationContribution {
    onStart(_application: ElectronMainApplication): void {
        const browserSession = session.fromPartition(BROWSER_PARTITION);

        // Request-level ad/tracker blocking: cancel requests to known ad/tracker hostnames
        // before they leave the browser session. Simple hostname (suffix) matching only -
        // no cosmetic filter syntax.
        browserSession.webRequest.onBeforeRequest((details, callback) => {
            let hostname: string | undefined;
            try {
                hostname = new URL(details.url).hostname;
            } catch {
                hostname = undefined;
            }
            if (hostname && isBlockedHostname(hostname)) {
                callback({ cancel: true });
                return;
            }
            callback({ cancel: false });
        });

        browserSession.on('will-download', (_event, item, sourceContents) => {
            if (sourceContents.getType() !== 'webview' || sourceContents.session !== browserSession) {
                return;
            }
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const startedAt = Date.now();
            const publish = (): void => {
                const electronState = item.getState();
                const state: BrowserDownload['state'] = electronState === 'completed'
                    ? 'completed'
                    : electronState === 'cancelled'
                        ? 'cancelled'
                        : electronState === 'interrupted'
                            ? 'failed'
                            : 'progressing';
                const download: BrowserDownload = {
                    id,
                    filename: item.getFilename(),
                    path: item.getSavePath(),
                    state,
                    receivedBytes: item.getReceivedBytes(),
                    totalBytes: item.getTotalBytes(),
                    startedAt
                };
                for (const contents of webContents.getAllWebContents()) {
                    if (!contents.isDestroyed() && contents.getType() === 'window') {
                        contents.send(BROWSER_DOWNLOAD_EVENT, download);
                    }
                }
            };
            publish();
            item.on('updated', publish);
            item.once('done', publish);
        });

        app.on('web-contents-created', (_event, contents) => {
            contents.on('will-attach-webview', (event, preferences, params) => {
                if (params.partition !== BROWSER_PARTITION) {
                    event.preventDefault();
                    return;
                }
                delete preferences.preload;
                preferences.nodeIntegration = false;
                preferences.contextIsolation = true;
                preferences.sandbox = true;
                preferences.webSecurity = true;
            });

            // Guest <webview> setup. In modern Electron (incl. 39.x) the webview tag's
            // DOM `new-window` event is unreliable / gone — window.open and target=_blank
            // must be handled via setWindowOpenHandler on the guest webContents.
            // Without this, left-clicks on many real-world links (Google results, etc.)
            // appear to do nothing; only custom "Open Link in New Tab" (which reads
            // linkURL from the context-menu params) still works.
            if (contents.getType() === 'webview') {
                contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

                // Only wire our research-browser partition (not other Theia plugin webviews).
                if (contents.session === browserSession) {
                    contents.setWindowOpenHandler(({ url }) => {
                        if (/^https?:\/\//i.test(url)) {
                            // Same-tab navigation: load in this guest instead of a popup.
                            queueMicrotask(() => {
                                if (!contents.isDestroyed()) {
                                    void contents.loadURL(url).catch(() => { /* navigation raced */ });
                                }
                            });
                            return { action: 'deny' };
                        }
                        if (/^mailto:/i.test(url)) {
                            void shell.openExternal(url);
                        }
                        return { action: 'deny' };
                    });
                }
            }
        });

        ipcMain.handle(BROWSER_SAVE_PAGE, async (
            _event, id: number, title: string, url: string
        ): Promise<SavedPage | undefined> => {
            const guest = webContents.fromId(id);
            if (!guest || guest.getType() !== 'webview' || !/^https?:/i.test(guest.getURL())) {
                return undefined;
            }
            const dir = path.join(app.getPath('userData'), 'browser', 'snapshots');
            await fs.mkdir(dir, { recursive: true });
            const safe = (title || 'page').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80);
            const file = path.join(dir, `${Date.now()}-${safe}.mhtml`);
            await guest.savePage(file, 'MHTML');
            return { id: `${Date.now()}`, title, url, path: file, savedAt: Date.now() };
        });
        ipcMain.handle(BROWSER_OPEN_PATH, (_event, filePath: string) => shell.openPath(filePath));
        ipcMain.handle(BROWSER_SHOW_PATH, (_event, filePath: string) => shell.showItemInFolder(filePath));
        ipcMain.handle(BROWSER_EXTERNAL, (_event, url: string) => {
            if (/^(https?:|mailto:)/i.test(url)) {
                return shell.openExternal(url);
            }
            return undefined;
        });
    }
}
