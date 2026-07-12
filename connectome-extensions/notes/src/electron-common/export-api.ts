export interface TheiaNotesExportAPI {
    /**
     * Renders the given standalone HTML document to a PDF file at `path` using
     * a hidden Electron `BrowserWindow` + `webContents.printToPDF()`. Resolves
     * `true` on success.
     */
    printToPdf(html: string, path: string): Promise<boolean>;
}

declare global {
    interface Window {
        electronConnectomeNotes?: TheiaNotesExportAPI;
    }
}

export const CHANNEL_PRINT_TO_PDF = 'connectomeNotes:printToPdf';
