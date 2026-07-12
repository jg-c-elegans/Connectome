import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, CommonCommands } from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry, DisposableCollection, Disposable } from '@theia/core';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { NoteAssetService } from './asset-service';

interface ClipboardImage {
    bytes: Uint8Array;
    mime: string;
    fileName: string;
}

/**
 * Image paste for markdown editors.
 *
 * Electron's default Paste command only reads text via `clipboardService.readText()`
 * and never fires a DOM `paste` event with image data when the clipboard holds a
 * screenshot. We register a higher-priority Paste handler for markdown editors that
 * reads images via `navigator.clipboard.read()` (and still accepts DOM paste as a
 * fallback for environments that deliver image items).
 */
@injectable()
export class PasteImageContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteAssetService)
    protected readonly assets: NoteAssetService;

    onStart(): void {
        this.editorManager.all.forEach(widget => this.attachDomPaste(widget));
        this.editorManager.onCreated(widget => this.attachDomPaste(widget));
    }

    registerCommands(commands: CommandRegistry): void {
        // unshift'd handler → preferred over the stock Electron text-only paste
        commands.registerHandler(CommonCommands.PASTE.id, {
            isEnabled: () => this.isMarkdownEditorFocused(),
            isVisible: () => this.isMarkdownEditorFocused(),
            execute: () => this.handlePasteCommand()
        });
    }

    protected isMarkdownEditorFocused(): boolean {
        const widget = this.editorManager.currentEditor;
        if (!widget || widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return false;
        }
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return false;
        }
        return editor.getControl().hasTextFocus() || widget.node.contains(document.activeElement);
    }

    protected async handlePasteCommand(): Promise<void> {
        const widget = this.editorManager.currentEditor;
        if (!widget || widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return;
        }
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return;
        }

        const image = await this.readImageFromNavigatorClipboard();
        if (image) {
            await this.insertImageBytes(editor, image);
            return;
        }

        // No image — paste text the same way Electron's default handler would
        await this.pasteTextIntoEditor(editor);
    }

    protected async pasteTextIntoEditor(editor: MonacoEditor): Promise<void> {
        let text = '';
        try {
            const electronCore = (window as unknown as { electronTheiaCore?: { readClipboard?: () => string } })
                .electronTheiaCore;
            if (electronCore?.readClipboard) {
                text = electronCore.readClipboard() || '';
            } else if (navigator.clipboard?.readText) {
                text = await navigator.clipboard.readText();
            }
        } catch {
            text = '';
        }
        if (!text) {
            return;
        }
        const control = editor.getControl();
        const selection = control.getSelection();
        const position = control.getPosition() ?? new monaco.Position(1, 1);
        const range = selection ?? new monaco.Range(
            position.lineNumber, position.column, position.lineNumber, position.column);
        control.executeEdits('connectome-paste-text', [{ range, text }]);
        control.focus();
    }

    /**
     * DOM paste fallback (paths where Electron does fire paste with image items).
     */
    protected attachDomPaste(widget: EditorWidget): void {
        if (widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return;
        }
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return;
        }
        const onPaste = (event: ClipboardEvent) => {
            void this.handleDomPaste(editor, event);
        };
        widget.node.addEventListener('paste', onPaste, true);
        const toDispose = new DisposableCollection(
            Disposable.create(() => widget.node.removeEventListener('paste', onPaste, true))
        );
        widget.disposed.connect(() => toDispose.dispose());
    }

    protected async handleDomPaste(editor: MonacoEditor, event: ClipboardEvent): Promise<void> {
        const image = await this.readImageFromDataTransfer(event.clipboardData);
        if (!image) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        try {
            await this.insertImageBytes(editor, image);
        } catch (error) {
            console.error('[connectome-notes] paste image failed', error);
        }
    }

    protected async readImageFromDataTransfer(data: DataTransfer | null): Promise<ClipboardImage | undefined> {
        if (!data) {
            return undefined;
        }
        const tryFile = async (file: File): Promise<ClipboardImage | undefined> => {
            if (!file.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)) {
                return undefined;
            }
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (bytes.byteLength === 0) {
                return undefined;
            }
            const mime = file.type || 'image/png';
            return {
                bytes,
                mime,
                fileName: file.name || `pasted-image${this.extensionForMime(mime)}`
            };
        };

        if (data.items) {
            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i];
                if (!item.type.startsWith('image/')) {
                    continue;
                }
                const file = item.getAsFile();
                if (file) {
                    const image = await tryFile(file);
                    if (image) {
                        return image;
                    }
                }
            }
        }
        if (data.files && data.files.length > 0) {
            for (let i = 0; i < data.files.length; i++) {
                const file = data.files.item(i);
                if (!file) {
                    continue;
                }
                const image = await tryFile(file);
                if (image) {
                    return image;
                }
            }
        }
        return undefined;
    }

    protected async readImageFromNavigatorClipboard(): Promise<ClipboardImage | undefined> {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            return undefined;
        }
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (!imageType) {
                    continue;
                }
                const blob = await item.getType(imageType);
                const buffer = await blob.arrayBuffer();
                if (buffer.byteLength === 0) {
                    continue;
                }
                const ext = this.extensionForMime(imageType);
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                return {
                    bytes: new Uint8Array(buffer),
                    mime: imageType,
                    fileName: `pasted-image-${stamp}${ext}`
                };
            }
        } catch (error) {
            console.debug('[connectome-notes] navigator.clipboard.read image failed', error);
        }
        return undefined;
    }

    protected async insertImageBytes(editor: MonacoEditor, image: ClipboardImage): Promise<void> {
        if (!image.bytes || image.bytes.byteLength === 0) {
            console.error('[connectome-notes] paste image had empty payload');
            return;
        }
        const noteUri = editor.uri;
        const assetsDir = await this.assets.resolveAssetsDir(noteUri);
        const name = image.fileName.includes('.')
            ? image.fileName
            : `${image.fileName}${this.extensionForMime(image.mime)}`;
        const destination = await this.assets.writeBytesToAssets(
            assetsDir, name.replace(/[/\\]/g, '_'), image.bytes);
        const snippet = this.assets.markdownFor(noteUri, destination, 'pasted-image');
        const control = editor.getControl();
        const position = control.getPosition() ?? new monaco.Position(1, 1);
        const selection = control.getSelection();
        const range = selection && !selection.isEmpty()
            ? selection
            : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
        control.executeEdits('connectome-paste-image', [{ range, text: snippet }]);
        const endCol = range.startColumn + snippet.length;
        control.setPosition({ lineNumber: range.startLineNumber, column: endCol });
        control.focus();
    }

    protected extensionForMime(mime: string): string {
        switch (mime) {
            case 'image/jpeg': return '.jpg';
            case 'image/gif': return '.gif';
            case 'image/webp': return '.webp';
            case 'image/svg+xml': return '.svg';
            case 'image/bmp': return '.bmp';
            default: return '.png';
        }
    }
}
