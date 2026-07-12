import { inject, injectable } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
} from '@theia/core';
import {
    KeybindingContribution,
    KeybindingRegistry,
} from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import {
    cellIndexAtColumn,
    cellRangeInLine,
    createEmptyTable,
    dataRowIndexForLine,
    findTableAtLine,
    formatMarkdownTable,
    insertColumn,
    insertRow,
    isSeparatorLine,
    MarkdownTable,
    removeColumn,
    removeRow,
} from './markdown-table';

export namespace TableCommands {
    export const INSERT: Command = {
        id: 'connectome.notes.table.insert',
        category: 'Notes',
        label: 'Insert Table',
    };
    export const FORMAT: Command = {
        id: 'connectome.notes.table.format',
        category: 'Notes',
        label: 'Format Table',
    };
    export const NEXT_CELL: Command = {
        id: 'connectome.notes.table.nextCell',
        category: 'Notes',
        label: 'Table: Next Cell',
    };
    export const PREV_CELL: Command = {
        id: 'connectome.notes.table.prevCell',
        category: 'Notes',
        label: 'Table: Previous Cell',
    };
    export const ADD_ROW: Command = {
        id: 'connectome.notes.table.addRow',
        category: 'Notes',
        label: 'Table: Add Row Below',
    };
    export const ADD_COLUMN: Command = {
        id: 'connectome.notes.table.addColumn',
        category: 'Notes',
        label: 'Table: Add Column Right',
    };
    export const DELETE_ROW: Command = {
        id: 'connectome.notes.table.deleteRow',
        category: 'Notes',
        label: 'Table: Delete Row',
    };
    export const DELETE_COLUMN: Command = {
        id: 'connectome.notes.table.deleteColumn',
        category: 'Notes',
        label: 'Table: Delete Column',
    };
}

/**
 * Smart GFM pipe tables in the **raw Monaco** markdown editor only
 * (not the WYSIWYG markdown-editor plugin).
 *
 * - Insert / format (column-aligned reflow)
 * - Tab / Shift+Tab cell navigation (reflows on move)
 * - Add/remove row or column
 */
@injectable()
export class MarkdownTableContribution
    implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TableCommands.INSERT, {
            execute: () => this.insertTable(),
            isEnabled: () => this.isMarkdownMonaco(),
            isVisible: () => this.isMarkdownMonaco(),
        });
        commands.registerCommand(TableCommands.FORMAT, {
            execute: () => this.formatTableAtCursor(),
            isEnabled: () => !!this.tableContext(),
            isVisible: () => !!this.tableContext(),
        });
        commands.registerCommand(TableCommands.NEXT_CELL, {
            execute: () => this.moveCell(1),
            isEnabled: () => !!this.tableContext(),
        });
        commands.registerCommand(TableCommands.PREV_CELL, {
            execute: () => this.moveCell(-1),
            isEnabled: () => !!this.tableContext(),
        });
        commands.registerCommand(TableCommands.ADD_ROW, {
            execute: () => this.mutateTable(t => {
                const ctx = this.tableContext();
                const row = ctx ? Math.max(1, ctx.dataRow + 1) : t.rows.length;
                return insertRow(t, row);
            }),
            isEnabled: () => !!this.tableContext(),
            isVisible: () => !!this.tableContext(),
        });
        commands.registerCommand(TableCommands.ADD_COLUMN, {
            execute: () => this.mutateTable(t => {
                const ctx = this.tableContext();
                const col = ctx ? ctx.cell + 1 : t.rows[0].length;
                return insertColumn(t, col);
            }),
            isEnabled: () => !!this.tableContext(),
            isVisible: () => !!this.tableContext(),
        });
        commands.registerCommand(TableCommands.DELETE_ROW, {
            execute: () => this.mutateTable(t => {
                const ctx = this.tableContext();
                if (!ctx || ctx.dataRow <= 0) {
                    return t;
                }
                return removeRow(t, ctx.dataRow) ?? t;
            }),
            isEnabled: () => {
                const ctx = this.tableContext();
                return !!ctx && ctx.dataRow > 0;
            },
            isVisible: () => !!this.tableContext(),
        });
        commands.registerCommand(TableCommands.DELETE_COLUMN, {
            execute: () => this.mutateTable(t => {
                const ctx = this.tableContext();
                if (!ctx) {
                    return t;
                }
                return removeColumn(t, ctx.cell) ?? t;
            }),
            isEnabled: () => {
                const ctx = this.tableContext();
                return !!ctx && (ctx.table.rows[0]?.length ?? 0) > 1;
            },
            isVisible: () => !!this.tableContext(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        const group = EditorContextMenu.MODIFICATION;
        menus.registerMenuAction(group, {
            commandId: TableCommands.INSERT.id,
            label: 'Insert Table',
            order: 'connectome-t0',
        });
        menus.registerMenuAction(group, {
            commandId: TableCommands.FORMAT.id,
            label: 'Format Table',
            order: 'connectome-t1',
        });
        menus.registerMenuAction(group, {
            commandId: TableCommands.ADD_ROW.id,
            label: 'Table: Add Row Below',
            order: 'connectome-t2',
        });
        menus.registerMenuAction(group, {
            commandId: TableCommands.ADD_COLUMN.id,
            label: 'Table: Add Column Right',
            order: 'connectome-t3',
        });
        menus.registerMenuAction(group, {
            commandId: TableCommands.DELETE_ROW.id,
            label: 'Table: Delete Row',
            order: 'connectome-t4',
        });
        menus.registerMenuAction(group, {
            commandId: TableCommands.DELETE_COLUMN.id,
            label: 'Table: Delete Column',
            order: 'connectome-t5',
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        const when =
            'editorTextFocus && editorLangId == markdown && !editorReadonly && !suggestWidgetVisible && !editorHasMultipleSelections';
        keybindings.registerKeybinding({
            command: TableCommands.NEXT_CELL.id,
            keybinding: 'tab',
            when,
        });
        keybindings.registerKeybinding({
            command: TableCommands.PREV_CELL.id,
            keybinding: 'shift+tab',
            when,
        });
        keybindings.registerKeybinding({
            command: TableCommands.FORMAT.id,
            keybinding: 'alt+shift+f',
            when,
        });
    }

    protected isMarkdownMonaco(): boolean {
        const widget = this.editorManager.currentEditor;
        if (!widget || widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return false;
        }
        return !!MonacoEditor.get(widget);
    }

    protected getControl(): monaco.editor.IStandaloneCodeEditor | undefined {
        const widget = this.editorManager.currentEditor;
        if (!widget || widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return undefined;
        }
        return MonacoEditor.get(widget)?.getControl();
    }

    protected tableContext(): {
        control: monaco.editor.IStandaloneCodeEditor;
        model: monaco.editor.ITextModel;
        table: MarkdownTable;
        lines: string[];
        line: number;
        dataRow: number;
        cell: number;
    } | undefined {
        const control = this.getControl();
        const model = control?.getModel();
        const pos = control?.getPosition();
        if (!control || !model || !pos) {
            return undefined;
        }
        const lines = model.getLinesContent();
        const line0 = pos.lineNumber - 1;
        const table = findTableAtLine(lines, line0);
        if (!table) {
            return undefined;
        }
        // Skip pure separator focus for mutations that need a data row — still allow format
        let dataRow = dataRowIndexForLine(table, line0, lines);
        if (dataRow < 0) {
            // On separator: treat as header row for navigation purposes
            dataRow = 0;
        }
        const lineText = lines[line0];
        const cell = cellIndexAtColumn(lineText, pos.column);
        return { control, model, table, lines, line: line0, dataRow, cell };
    }

    protected insertTable(): void {
        const control = this.getControl();
        const model = control?.getModel();
        if (!control || !model) {
            return;
        }
        const pos = control.getPosition() ?? new monaco.Position(1, 1);
        const lineContent = model.getLineContent(pos.lineNumber);
        const indent = lineContent.match(/^\s*/)?.[0] ?? '';
        let text = createEmptyTable(3, 3, indent);
        // Ensure blank line separation if inserting mid-document
        const needsLeadingNl = pos.column > 1 || (pos.lineNumber > 1 && model.getLineContent(pos.lineNumber).trim() !== '');
        if (pos.column > 1) {
            text = '\n' + text;
        } else if (needsLeadingNl && pos.lineNumber > 1) {
            const prev = model.getLineContent(pos.lineNumber - 1);
            if (prev.trim() !== '') {
                text = '\n' + text;
            }
        }
        if (!text.endsWith('\n')) {
            text += '\n';
        }
        const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
        control.pushUndoStop();
        control.executeEdits('connectome-table', [{ range, text, forceMoveMarkers: true }]);
        control.pushUndoStop();
        // Place cursor in first body cell
        const insertLine = pos.lineNumber + (text.startsWith('\n') ? 1 : 0);
        // After format: line insertLine = header, +1 sep, +2 first body
        const bodyLine = insertLine + 2;
        const bodyText = model.getLineContent(Math.min(bodyLine, model.getLineCount()));
        const cell = cellRangeInLine(bodyText, 0);
        if (cell) {
            control.setPosition({ lineNumber: bodyLine, column: cell.startCol });
        }
        control.focus();
    }

    protected formatTableAtCursor(): void {
        const ctx = this.tableContext();
        if (!ctx) {
            return;
        }
        this.applyTable(ctx.control, ctx.model, ctx.table, ctx.dataRow, ctx.cell);
    }

    protected moveCell(delta: number): void {
        const ctx = this.tableContext();
        if (!ctx) {
            return;
        }
        const cols = ctx.table.rows[0]?.length ?? 1;
        const rows = ctx.table.rows.length;
        let row = ctx.dataRow;
        let col = ctx.cell + delta;
        while (col >= cols) {
            col -= cols;
            row++;
        }
        while (col < 0) {
            col += cols;
            row--;
        }
        if (row < 0) {
            row = 0;
            col = 0;
        }
        // Past last cell: add a new row and go there
        let table = ctx.table;
        if (row >= rows) {
            table = insertRow(table, rows);
            row = table.rows.length - 1;
            col = 0;
        }
        this.applyTable(ctx.control, ctx.model, table, row, col);
    }

    protected mutateTable(mutator: (t: MarkdownTable) => MarkdownTable): void {
        const ctx = this.tableContext();
        if (!ctx) {
            return;
        }
        const next = mutator(ctx.table);
        this.applyTable(ctx.control, ctx.model, next, ctx.dataRow, ctx.cell);
    }

    /**
     * Replace the table range with a formatted version and place the cursor
     * in (dataRow, cell).
     */
    protected applyTable(
        control: monaco.editor.IStandaloneCodeEditor,
        model: monaco.editor.ITextModel,
        table: MarkdownTable,
        dataRow: number,
        cell: number,
    ): void {
        const formatted = formatMarkdownTable(table);
        const range = new monaco.Range(
            table.startLine + 1,
            1,
            table.endLine + 1,
            model.getLineMaxColumn(table.endLine + 1),
        );
        control.pushUndoStop();
        control.executeEdits('connectome-table', [{
            range,
            text: formatted,
            forceMoveMarkers: true,
        }]);
        control.pushUndoStop();

        // Map data row → document line after format (header, sep, body...)
        const safeRow = Math.max(0, Math.min(dataRow, table.rows.length - 1));
        const safeCell = Math.max(0, Math.min(cell, (table.rows[0]?.length ?? 1) - 1));
        // formatted structure: line0 header, line1 sep, then body rows
        const line1Based = table.startLine + 1 + (safeRow === 0 ? 0 : 1 + safeRow);
        const lineText = model.getLineContent(Math.min(line1Based, model.getLineCount()));
        // If we landed on separator somehow, skip to next
        let targetLine = line1Based;
        if (isSeparatorLine(lineText) && targetLine < model.getLineCount()) {
            targetLine++;
        }
        const targetText = model.getLineContent(Math.min(targetLine, model.getLineCount()));
        const cellRange = cellRangeInLine(targetText, safeCell);
        if (cellRange) {
            if (cellRange.startCol === cellRange.endCol) {
                control.setPosition({ lineNumber: targetLine, column: cellRange.startCol });
            } else {
                control.setSelection(new monaco.Selection(
                    targetLine, cellRange.startCol,
                    targetLine, cellRange.endCol,
                ));
            }
        }
        control.revealLineInCenterIfOutsideViewport(targetLine);
        control.focus();
    }
}
