import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';

/**
 * Card-layout breathing room above the first editor line.
 *
 * Must use Monaco's layout-aware `padding.top` — never CSS `top` on
 * `.overflow-guard`. The view's mouse target node is the outer `.monaco-editor`
 * (not the guard), so shifting the guard desyncs painted glyphs from hit-tests
 * (wrapped lines, end of blocks, "click anywhere on the line" all fail).
 */
export const CONNECTOME_EDITOR_TOP_PAD_PX = 14;

@injectable()
export class ConnectomeEditorPaddingContribution implements FrontendApplicationContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    onStart(): void {
        this.editorManager.all.forEach(w => this.apply(w));
        this.editorManager.onCreated(w => this.apply(w));
    }

    protected apply(widget: EditorWidget): void {
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return;
        }
        editor.getControl().updateOptions({
            padding: { top: CONNECTOME_EDITOR_TOP_PAD_PX, bottom: 0 }
        });
    }
}
