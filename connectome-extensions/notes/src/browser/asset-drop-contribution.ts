import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { DisposableCollection, Disposable } from '@theia/core';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { NoteAssetService } from './asset-service';

/**
 * Handles OS file drops onto markdown editors: copies the dropped file into an
 * `assets/` folder next to the note and inserts markdown image/link syntax at
 * the drop position.
 */
@injectable()
export class AssetDropContribution implements FrontendApplicationContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteAssetService)
    protected readonly assets: NoteAssetService;

    onStart(): void {
        this.editorManager.all.forEach(widget => this.attach(widget));
        this.editorManager.onCreated(widget => this.attach(widget));
    }

    protected attach(widget: EditorWidget): void {
        if (widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return;
        }
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return;
        }
        const onDragOver = (event: DragEvent) => {
            if (this.hasFiles(event)) {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer!.dropEffect = 'copy';
            }
        };
        const onDrop = (event: DragEvent) => {
            if (this.hasFiles(event)) {
                event.preventDefault();
                event.stopPropagation();
                this.handleDrop(editor, event).catch(error =>
                    console.error('[connectome-notes] asset drop failed', error));
            }
        };
        widget.node.addEventListener('dragover', onDragOver, true);
        widget.node.addEventListener('drop', onDrop, true);
        const toDispose = new DisposableCollection(
            Disposable.create(() => widget.node.removeEventListener('dragover', onDragOver, true)),
            Disposable.create(() => widget.node.removeEventListener('drop', onDrop, true))
        );
        widget.disposed.connect(() => toDispose.dispose());
    }

    protected hasFiles(event: DragEvent): boolean {
        return !!event.dataTransfer && Array.prototype.includes.call(event.dataTransfer.types, 'Files');
    }

    protected async handleDrop(editor: MonacoEditor, event: DragEvent): Promise<void> {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) {
            return;
        }
        const control = editor.getControl();
        const target = control.getTargetAtClientPoint(event.clientX, event.clientY);
        const position = target?.position ?? control.getPosition() ?? new monaco.Position(1, 1);

        const noteUri = editor.uri;
        const assetsDir = await this.assets.resolveAssetsDir(noteUri);
        const snippets: string[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files.item(i);
            if (!file) {
                continue;
            }
            const destination = await this.assets.copyFileToAssets(file, assetsDir);
            snippets.push(this.assets.markdownFor(noteUri, destination));
        }
        if (snippets.length === 0) {
            return;
        }
        const text = snippets.join('\n');
        const range = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
        control.executeEdits('connectome-asset-drop', [{ range, text }]);
        const lines = text.split('\n');
        const endLine = position.lineNumber + lines.length - 1;
        const endColumn = (lines.length === 1 ? position.column : 1) + lines[lines.length - 1].length;
        control.setPosition({ lineNumber: endLine, column: endColumn });
        control.focus();
    }
}
