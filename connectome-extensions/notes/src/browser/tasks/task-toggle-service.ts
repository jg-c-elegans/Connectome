import { inject, injectable } from '@theia/core/shared/inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { TaskOccurrence } from '../note-index-service';

@injectable()
export class TaskToggleService {
    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MessageService)
    protected readonly messages: MessageService;

    async toggle(task: TaskOccurrence): Promise<boolean> {
        const widget = await this.editorManager.open(new URI(task.sourceUri));
        const editor = MonacoEditor.get(widget);
        const model = editor?.getControl().getModel();
        if (!editor || !model) {
            await this.messages.warn('Could not open this task for editing.');
            return false;
        }
        const line = model.getLineContent(task.line + 1);
        const current = line.substring(task.checkboxStartCol, task.checkboxEndCol);
        const expected = task.completed ? /^\[[xX]\]$/ : /^\[ \]$/;
        if (!expected.test(current)) {
            await this.messages.warn('This task changed since it was indexed. Refreshing without editing it.');
            return false;
        }
        const replacement = task.completed ? '[ ]' : '[x]';
        const range = new monaco.Range(
            task.line + 1, task.checkboxStartCol + 1,
            task.line + 1, task.checkboxEndCol + 1
        );
        editor.getControl().executeEdits('connectome-toggle-task', [{ range, text: replacement }]);
        await widget.saveable.save();
        return true;
    }
}
