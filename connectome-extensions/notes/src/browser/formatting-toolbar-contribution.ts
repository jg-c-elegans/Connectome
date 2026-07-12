import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry, DisposableCollection, Disposable } from '@theia/core';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';

export namespace FormattingCommands {
    export const TOGGLE_BOLD: Command = { id: 'connectomeNotes.format.bold', label: 'Notes: Toggle Bold' };
    export const TOGGLE_ITALIC: Command = { id: 'connectomeNotes.format.italic', label: 'Notes: Toggle Italic' };
    export const TOGGLE_STRIKETHROUGH: Command = {
        id: 'connectomeNotes.format.strikethrough', label: 'Notes: Toggle Strikethrough'
    };
    export const TOGGLE_CODE: Command = { id: 'connectomeNotes.format.code', label: 'Notes: Toggle Inline Code' };
    export const INSERT_LINK: Command = { id: 'connectomeNotes.format.link', label: 'Notes: Insert Link' };
    export const TOGGLE_UNORDERED_LIST: Command = {
        id: 'connectomeNotes.format.unorderedList', label: 'Notes: Toggle Bullet List'
    };
    export const TOGGLE_ORDERED_LIST: Command = {
        id: 'connectomeNotes.format.orderedList', label: 'Notes: Toggle Numbered List'
    };
    export const TOGGLE_TASK_LIST: Command = {
        id: 'connectomeNotes.format.taskList', label: 'Notes: Toggle Task List'
    };
    export const SET_HEADING: Command = { id: 'connectomeNotes.format.heading', label: 'Notes: Set Heading Level' };
}

type Control = monaco.editor.IStandaloneCodeEditor;

/**
 * Pure text-transform helpers shared by the floating toolbar buttons and the
 * command-palette/keybinding entry points. Each operates on the given
 * editor's current selection.
 */
namespace MarkdownFormatting {

    export function toggleInline(control: Control, marker: string): void {
        const selection = control.getSelection();
        const model = control.getModel();
        if (!selection || !model) {
            return;
        }
        if (selection.isEmpty()) {
            const pos = selection.getStartPosition();
            const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
            control.executeEdits('connectome-format', [{ range, text: marker + marker }]);
            control.setPosition({ lineNumber: pos.lineNumber, column: pos.column + marker.length });
            control.focus();
            return;
        }
        const text = model.getValueInRange(selection);
        const isWrapped = text.startsWith(marker) && text.endsWith(marker) && text.length >= marker.length * 2;
        const newText = isWrapped ? text.slice(marker.length, text.length - marker.length) : marker + text + marker;
        control.executeEdits('connectome-format', [{ range: selection, text: newText }]);
        if (selection.startLineNumber === selection.endLineNumber) {
            const delta = isWrapped ? -marker.length : marker.length;
            control.setSelection(new monaco.Selection(
                selection.startLineNumber, selection.startColumn,
                selection.startLineNumber, selection.endColumn + delta
            ));
        }
        control.focus();
    }

    export function insertLink(control: Control): void {
        const selection = control.getSelection();
        const model = control.getModel();
        if (!selection || !model) {
            return;
        }
        const label = selection.isEmpty() ? 'link text' : model.getValueInRange(selection);
        const newText = `[${label}](url)`;
        control.executeEdits('connectome-format', [{ range: selection, text: newText }]);
        if (selection.startLineNumber === selection.endLineNumber) {
            const urlStart = selection.startColumn + label.length + 3; // '[' + label + ']('
            control.setSelection(new monaco.Selection(
                selection.startLineNumber, urlStart,
                selection.startLineNumber, urlStart + 3 // 'url'
            ));
        }
        control.focus();
    }

    function eachSelectedLine(control: Control, apply: (line: string, lineNumber: number) => string): void {
        const selection = control.getSelection();
        const model = control.getModel();
        if (!selection || !model) {
            return;
        }
        const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
        for (let i = selection.startLineNumber; i <= selection.endLineNumber; i++) {
            const line = model.getLineContent(i);
            const range = new monaco.Range(i, 1, i, line.length + 1);
            edits.push({ range, text: apply(line, i) });
        }
        control.executeEdits('connectome-format', edits);
        control.focus();
    }

    function splitIndent(line: string): { indent: string; rest: string } {
        const match = line.match(/^(\s*)(.*)$/);
        return { indent: match?.[1] ?? '', rest: match?.[2] ?? '' };
    }

    export function toggleUnorderedList(control: Control): void {
        const bulletRe = /^-\s+/;
        eachSelectedLine(control, line => {
            const { indent, rest } = splitIndent(line);
            if (rest.length === 0) {
                return line;
            }
            return bulletRe.test(rest) ? indent + rest.replace(bulletRe, '') : indent + '- ' + rest;
        });
    }

    export function toggleOrderedList(control: Control): void {
        const orderedRe = /^\d+\.\s+/;
        let index = 1;
        eachSelectedLine(control, line => {
            const { indent, rest } = splitIndent(line);
            if (rest.length === 0) {
                return line;
            }
            const numbered = indent + `${index++}. ` + rest.replace(orderedRe, '');
            return orderedRe.test(rest) ? indent + rest.replace(orderedRe, '') : numbered;
        });
    }

    export function toggleTaskList(control: Control): void {
        const taskRe = /^-\s\[[ xX]\]\s+/;
        eachSelectedLine(control, line => {
            const { indent, rest } = splitIndent(line);
            if (rest.length === 0) {
                return line;
            }
            return taskRe.test(rest) ? indent + rest.replace(taskRe, '') : indent + '- [ ] ' + rest;
        });
    }

    export function setHeading(control: Control, level: number): void {
        const headingRe = /^#{1,6}\s+/;
        const sameLevelRe = new RegExp(`^#{${level}}\\s+`);
        eachSelectedLine(control, line => {
            const { indent, rest } = splitIndent(line);
            const stripped = rest.replace(headingRe, '');
            return sameLevelRe.test(rest) ? indent + stripped : indent + '#'.repeat(level) + ' ' + stripped;
        });
    }
}

/**
 * Shows a small floating toolbar near the selection in markdown editors, and
 * registers the equivalent commands (+ keybindings for the common ones) so
 * formatting works with or without the toolbar visible.
 */
@injectable()
export class FormattingToolbarContribution
    implements FrontendApplicationContribution, CommandContribution, KeybindingContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    onStart(): void {
        this.editorManager.all.forEach(widget => this.attach(widget));
        this.editorManager.onCreated(widget => this.attach(widget));
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(FormattingCommands.TOGGLE_BOLD, this.editorCommand(c => MarkdownFormatting.toggleInline(c, '**')));
        commands.registerCommand(FormattingCommands.TOGGLE_ITALIC, this.editorCommand(c => MarkdownFormatting.toggleInline(c, '_')));
        commands.registerCommand(FormattingCommands.TOGGLE_STRIKETHROUGH,
            this.editorCommand(c => MarkdownFormatting.toggleInline(c, '~~')));
        commands.registerCommand(FormattingCommands.TOGGLE_CODE, this.editorCommand(c => MarkdownFormatting.toggleInline(c, '`')));
        commands.registerCommand(FormattingCommands.INSERT_LINK, this.editorCommand(c => MarkdownFormatting.insertLink(c)));
        commands.registerCommand(FormattingCommands.TOGGLE_UNORDERED_LIST,
            this.editorCommand(c => MarkdownFormatting.toggleUnorderedList(c)));
        commands.registerCommand(FormattingCommands.TOGGLE_ORDERED_LIST,
            this.editorCommand(c => MarkdownFormatting.toggleOrderedList(c)));
        commands.registerCommand(FormattingCommands.TOGGLE_TASK_LIST,
            this.editorCommand(c => MarkdownFormatting.toggleTaskList(c)));
        commands.registerCommand(FormattingCommands.SET_HEADING, {
            execute: (level?: number) => {
                if (typeof level === 'number') {
                    this.editorCommand(c => MarkdownFormatting.setHeading(c, level)).execute();
                }
            }
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        const when = '!editorReadonly && editorTextFocus && editorLangId == markdown';
        keybindings.registerKeybinding({ command: FormattingCommands.TOGGLE_BOLD.id, keybinding: 'ctrlcmd+b', when });
        keybindings.registerKeybinding({ command: FormattingCommands.TOGGLE_ITALIC.id, keybinding: 'ctrlcmd+i', when });
        keybindings.registerKeybinding({ command: FormattingCommands.TOGGLE_CODE.id, keybinding: 'ctrlcmd+e', when });
        keybindings.registerKeybinding({ command: FormattingCommands.INSERT_LINK.id, keybinding: 'ctrlcmd+k', when });
    }

    protected editorCommand(apply: (control: Control) => void): { execute: () => void } {
        return {
            execute: () => {
                const editor = MonacoEditor.get(this.editorManager.currentEditor);
                if (editor) {
                    apply(editor.getControl());
                }
            }
        };
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
        const toolbar = this.createToolbar(control);
        widget.node.appendChild(toolbar);

        const hide = () => { toolbar.style.display = 'none'; };
        const show = () => {
            const selection = control.getSelection();
            if (!selection || selection.isEmpty()) {
                hide();
                return;
            }
            const end = selection.getEndPosition();
            const coords = control.getScrolledVisiblePosition(end);
            if (!coords) {
                hide();
                return;
            }
            toolbar.style.display = 'flex';
            toolbar.style.left = `${coords.left}px`;
            toolbar.style.top = `${Math.max(0, coords.top - toolbar.offsetHeight - 8)}px`;
        };

        const selectionListener = control.onDidChangeCursorSelection(() => show());
        // Deferred: focusing the heading <select> blurs Monaco; hiding the toolbar
        // synchronously would set display:none on the select mid-click and kill the
        // native dropdown. Wait a tick and only hide if focus left the toolbar.
        const blurListener = control.onDidBlurEditorText(() => {
            setTimeout(() => {
                if (!toolbar.contains(document.activeElement)) {
                    hide();
                }
            }, 0);
        });

        const toDispose = new DisposableCollection(
            Disposable.create(() => selectionListener.dispose()),
            Disposable.create(() => blurListener.dispose()),
            Disposable.create(() => toolbar.remove())
        );
        widget.disposed.connect(() => toDispose.dispose());
    }

    protected createToolbar(control: Control): HTMLDivElement {
        const toolbar = document.createElement('div');
        toolbar.className = 'connectome-format-toolbar';
        toolbar.style.display = 'none';

        // Prevent the editor from losing focus/selection when a button is pressed.
        // Native <select> must keep default mousedown so the dropdown can open.
        toolbar.addEventListener('mousedown', event => {
            if (event.target instanceof HTMLSelectElement ||
                (event.target instanceof Node && (event.target as HTMLElement).closest?.('select'))) {
                return;
            }
            event.preventDefault();
        });

        const addButton = (label: string, title: string, action: () => void) => {
            const button = document.createElement('button');
            button.className = 'connectome-format-toolbar-btn';
            button.type = 'button';
            button.title = title;
            button.textContent = label;
            button.addEventListener('click', action);
            toolbar.appendChild(button);
            return button;
        };

        addButton('B', 'Bold (Ctrl+B)', () => MarkdownFormatting.toggleInline(control, '**'));
        addButton('I', 'Italic (Ctrl+I)', () => MarkdownFormatting.toggleInline(control, '_'));
        addButton('S', 'Strikethrough', () => MarkdownFormatting.toggleInline(control, '~~'));
        addButton('</>', 'Inline Code (Ctrl+E)', () => MarkdownFormatting.toggleInline(control, '`'));
        addButton('🔗', 'Link (Ctrl+K)', () => MarkdownFormatting.insertLink(control));
        addButton('•', 'Bullet List', () => MarkdownFormatting.toggleUnorderedList(control));
        addButton('1.', 'Numbered List', () => MarkdownFormatting.toggleOrderedList(control));
        addButton('☑', 'Task List', () => MarkdownFormatting.toggleTaskList(control));

        const headingSelect = document.createElement('select');
        headingSelect.className = 'connectome-format-toolbar-heading';
        headingSelect.title = 'Heading level';
        const normalOption = document.createElement('option');
        normalOption.value = '';
        normalOption.textContent = 'Text';
        headingSelect.appendChild(normalOption);
        for (let level = 1; level <= 6; level++) {
            const option = document.createElement('option');
            option.value = String(level);
            option.textContent = `H${level}`;
            headingSelect.appendChild(option);
        }
        headingSelect.addEventListener('mousedown', event => event.stopPropagation());
        headingSelect.addEventListener('change', () => {
            const level = Number(headingSelect.value);
            if (level >= 1 && level <= 6) {
                MarkdownFormatting.setHeading(control, level);
            }
            headingSelect.value = '';
            control.focus();
        });
        // Dismiss without a selection (Escape / click away): focus stays on select
        // so editor-blur may not fire again — close when focus leaves both.
        headingSelect.addEventListener('blur', () => {
            setTimeout(() => {
                if (!toolbar.contains(document.activeElement) && !control.hasTextFocus()) {
                    toolbar.style.display = 'none';
                }
            }, 0);
        });
        toolbar.appendChild(headingSelect);

        return toolbar;
    }
}
