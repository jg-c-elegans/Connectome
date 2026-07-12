import { inject, injectable } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
} from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { planTocEdit } from './toc';

export namespace TocCommands {
    export const INSERT_OR_UPDATE: Command = {
        id: 'connectome.notes.insertOrUpdateToc',
        category: 'Notes',
        label: 'Insert/Update Table of Contents',
    };
}

/**
 * Command: generate an indented, anchor-linked TOC at the cursor, or refresh
 * an existing block delimited by `<!-- connectome-toc-start/end -->`.
 */
@injectable()
export class TocContribution implements CommandContribution, MenuContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TocCommands.INSERT_OR_UPDATE, {
            execute: () => this.insertOrUpdateToc(),
            isEnabled: () => this.isMarkdownEditorActive(),
            isVisible: () => this.isMarkdownEditorActive(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.MODIFICATION, {
            commandId: TocCommands.INSERT_OR_UPDATE.id,
            label: 'Insert/Update Table of Contents',
            order: 'connectome-toc',
        });
    }

    protected isMarkdownEditorActive(): boolean {
        const widget = this.editorManager.currentEditor;
        if (!widget || widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return false;
        }
        return !!MonacoEditor.get(widget);
    }

    protected insertOrUpdateToc(): void {
        const widget = this.editorManager.currentEditor;
        if (!widget || widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return;
        }
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return;
        }
        const control = editor.getControl();
        const model = control.getModel();
        if (!model) {
            return;
        }

        const text = model.getValue();
        const selection = control.getSelection();
        const insertOffset = selection
            ? model.getOffsetAt(selection.getStartPosition())
            : model.getOffsetAt(control.getPosition() ?? new monaco.Position(1, 1));

        const plan = planTocEdit(text, insertOffset);
        const currentSlice = text.slice(plan.startOffset, plan.endOffset);
        if (currentSlice === plan.replacement) {
            return;
        }

        const start = model.getPositionAt(plan.startOffset);
        const end = model.getPositionAt(plan.endOffset);
        const range = monaco.Range.fromPositions(start, end);

        control.pushUndoStop();
        control.executeEdits('connectome-toc', [{
            range,
            text: plan.replacement,
            forceMoveMarkers: true,
        }]);
        control.pushUndoStop();

        const endOffset = plan.startOffset + plan.replacement.length;
        const endPos = model.getPositionAt(Math.min(endOffset, model.getValueLength()));
        control.setPosition(endPos);
        control.revealPositionInCenterIfOutsideViewport(endPos);
        control.focus();
    }
}
