import { ipcRenderer, contextBridge } from '@theia/core/electron-shared/electron';
import { CHANNEL_PRINT_TO_PDF, TheiaNotesExportAPI } from '../electron-common/export-api';

const api: TheiaNotesExportAPI = {
    printToPdf: (html: string, path: string) => ipcRenderer.invoke(CHANNEL_PRINT_TO_PDF, html, path)
};

export function preload(): void {
    contextBridge.exposeInMainWorld('electronConnectomeNotes', api);
}
