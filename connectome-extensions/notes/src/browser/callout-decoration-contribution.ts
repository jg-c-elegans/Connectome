import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { DisposableCollection, Disposable } from '@theia/core';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';

export const CALLOUT_LINE = /^\s*>\s*\[!([A-Za-z][\w-]*)\](?:\s+(.*))?$/;
export const CALLOUT_CONT = /^\s*>/;

export const CALLOUT_TYPE_CLASS: Record<string, string> = {
    note: 'connectome-callout-gutter-note',
    info: 'connectome-callout-gutter-note',
    tip: 'connectome-callout-gutter-tip',
    hint: 'connectome-callout-gutter-tip',
    success: 'connectome-callout-gutter-tip',
    warning: 'connectome-callout-gutter-warning',
    caution: 'connectome-callout-gutter-warning',
    todo: 'connectome-callout-gutter-warning',
    important: 'connectome-callout-gutter-important',
    question: 'connectome-callout-gutter-important',
    danger: 'connectome-callout-gutter-danger',
    error: 'connectome-callout-gutter-danger',
    bug: 'connectome-callout-gutter-danger',
    example: 'connectome-callout-gutter-example',
    quote: 'connectome-callout-gutter-example'
};

/**
 * Light editor gutter decorations for Obsidian-style callout start lines.
 */
@injectable()
export class CalloutDecorationContribution implements FrontendApplicationContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected readonly collections = new Map<string, monaco.editor.IEditorDecorationsCollection>();
    protected readonly toDispose = new DisposableCollection();

    onStart(): void {
        this.editorManager.all.forEach(w => this.attach(w));
        this.toDispose.push(this.editorManager.onCreated(w => this.attach(w)));
    }

    protected attach(widget: EditorWidget): void {
        if (widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return;
        }
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return;
        }
        const control = editor.getControl();
        const key = widget.editor.uri.toString();
        const refresh = () => this.refresh(control, key);
        refresh();
        const sub = control.onDidChangeModelContent(() => refresh());
        const modelSub = control.onDidChangeModel(() => refresh());
        widget.disposed.connect(() => {
            sub.dispose();
            modelSub.dispose();
            this.collections.get(key)?.clear();
            this.collections.delete(key);
        });
        this.toDispose.push(Disposable.create(() => {
            sub.dispose();
            modelSub.dispose();
        }));
    }

    protected refresh(control: monaco.editor.IStandaloneCodeEditor, key: string): void {
        const model = control.getModel();
        if (!model) {
            return;
        }
        const decorations: monaco.editor.IModelDeltaDecoration[] = [];
        const lineCount = model.getLineCount();
        for (let line = 1; line <= lineCount; line++) {
            const text = model.getLineContent(line);
            const match = text.match(CALLOUT_LINE);
            if (!match) {
                continue;
            }
            const type = match[1].toLowerCase();
            const cls = CALLOUT_TYPE_CLASS[type] || 'connectome-callout-gutter-note';
            // Mark the callout block range (start + continuation > lines)
            let end = line;
            while (end + 1 <= lineCount && CALLOUT_CONT.test(model.getLineContent(end + 1))) {
                end++;
            }
            decorations.push({
                range: new monaco.Range(line, 1, end, 1),
                options: {
                    isWholeLine: true,
                    linesDecorationsClassName: cls,
                    className: 'connectome-callout-line',
                    overviewRuler: {
                        color: 'rgba(90, 54, 250, 0.5)',
                        position: monaco.editor.OverviewRulerLane.Left
                    },
                    hoverMessage: { value: `Callout: **${type}**` }
                }
            });
            line = end;
        }
        let collection = this.collections.get(key);
        if (!collection) {
            collection = control.createDecorationsCollection([]);
            this.collections.set(key, collection);
        }
        collection.set(decorations);
    }
}
