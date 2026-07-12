import { injectable } from '@theia/core/shared/inversify';
import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { MaybePromise } from '@theia/core';
import { ipcMain, BrowserWindow } from '@theia/core/electron-shared/electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CHANNEL_PRINT_TO_PDF } from '../electron-common/export-api';

/**
 * Handles PDF export (B9) by loading the rendered note HTML into a hidden,
 * offscreen `BrowserWindow` and using Electron's native `printToPDF` — avoids
 * any external Pandoc/headless-browser dependency.
 */
@injectable()
export class ExportElectronMain implements ElectronMainApplicationContribution {

    onStart(_application: ElectronMainApplication): MaybePromise<void> {
        ipcMain.handle(CHANNEL_PRINT_TO_PDF, async (_event, html: string, targetPath: string) => {
            const tmpFile = path.join(os.tmpdir(), `connectome-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
            await fs.promises.writeFile(tmpFile, html, 'utf8');
            const window = new BrowserWindow({
                show: false,
                webPreferences: { offscreen: true }
            });
            try {
                await window.loadFile(tmpFile);
                const pdfBuffer = await window.webContents.printToPDF({
                    printBackground: true,
                    pageSize: 'A4'
                });
                await fs.promises.writeFile(targetPath, pdfBuffer);
                return true;
            } finally {
                window.destroy();
                fs.promises.unlink(tmpFile).catch(() => { /* best effort */ });
            }
        });
    }
}
