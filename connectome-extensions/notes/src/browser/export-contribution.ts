import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { FileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import MarkdownIt from 'markdown-it';
import { parseNote } from './note-parser';
import { buildExportHtml } from './export-html-template';

export namespace ExportCommands {
    export const EXPORT_HTML: Command = { id: 'connectomeNotes.export.html', label: 'Notes: Export Note as HTML' };
    export const EXPORT_PDF: Command = { id: 'connectomeNotes.export.pdf', label: 'Notes: Export Note as PDF' };
}

/**
 * Exports the active markdown note to a standalone HTML file, and (on the
 * Electron desktop app) to PDF via a hidden `BrowserWindow` in the
 * electron-main process (`export-electron-main.ts`).
 */
@injectable()
export class ExportContribution implements CommandContribution {

    protected readonly markdown = new MarkdownIt({ html: true, linkify: true });

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileDialogService)
    protected readonly fileDialogService: FileDialogService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ExportCommands.EXPORT_HTML, {
            isEnabled: () => this.isMarkdownEditorActive(),
            execute: () => this.exportHtml()
        });
        commands.registerCommand(ExportCommands.EXPORT_PDF, {
            isEnabled: () => this.isMarkdownEditorActive(),
            execute: () => this.exportPdf()
        });
    }

    protected isMarkdownEditorActive(): boolean {
        const uri = this.editorManager.currentEditor?.editor.uri;
        return uri?.path.ext.toLowerCase() === '.md';
    }

    protected async exportHtml(): Promise<void> {
        const rendered = this.renderActiveNote();
        if (!rendered) {
            return;
        }
        const target = await this.fileDialogService.showSaveDialog({
            title: 'Export Note as HTML',
            inputValue: `${rendered.stem}.html`
        });
        if (!target) {
            return;
        }
        await this.fileService.write(target, rendered.html);
        this.messages.info(`Exported “${rendered.title}” to ${target.path.base}.`);
    }

    protected async exportPdf(): Promise<void> {
        if (!window.electronConnectomeNotes) {
            this.messages.error('PDF export is only available in the Connectome desktop app.');
            return;
        }
        const rendered = this.renderActiveNote();
        if (!rendered) {
            return;
        }
        const target = await this.fileDialogService.showSaveDialog({
            title: 'Export Note as PDF',
            inputValue: `${rendered.stem}.pdf`
        });
        if (!target) {
            return;
        }
        try {
            await window.electronConnectomeNotes.printToPdf(rendered.html, FileUri.fsPath(target));
            this.messages.info(`Exported “${rendered.title}” to ${target.path.base}.`);
        } catch (error) {
            console.error('[connectome-notes] PDF export failed', error);
            this.messages.error(`PDF export failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    protected renderActiveNote(): { title: string; stem: string; html: string } | undefined {
        const editor = MonacoEditor.get(this.editorManager.currentEditor);
        if (!editor || editor.uri.path.ext.toLowerCase() !== '.md') {
            this.messages.warn('Open a markdown note to export it.');
            return undefined;
        }
        const source = editor.getControl().getModel()?.getValue() ?? '';
        const parsed = parseNote(source);
        const stem = editor.uri.path.name;
        const title = parsed.frontmatter?.title || stem;
        const bodyHtml = this.markdown.render(source);
        const html = buildExportHtml(title, bodyHtml);
        return { title, stem, html };
    }
}
