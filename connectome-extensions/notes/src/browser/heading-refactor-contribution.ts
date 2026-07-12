import { inject, injectable } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
} from '@theia/core';
import { CommonMenus } from '@theia/core/lib/browser';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import * as monaco from '@theia/monaco-editor-core';
import { NoteIndexService } from './note-index-service';
import {
    headingsMatch,
    parseNote,
    replaceHeadingTextOnLine,
    rewriteHeadingReferences,
    slugifyHeading,
} from './note-parser';

export namespace HeadingRefactorCommands {
    export const RENAME: Command = {
        id: 'connectomeNotes.renameHeading',
        category: 'Notes',
        label: 'Rename Heading and Update Links',
    };
    export const FIND_REFS: Command = {
        id: 'connectomeNotes.findHeadingReferences',
        category: 'Notes',
        label: 'Find Heading References',
    };
}

/**
 * Rename a heading in the active markdown note and rewrite `#slug` /
 * `[[…#heading]]` / `[…](…#slug)` references across the workspace.
 * Also registers a Monaco reference provider for Peek / Find All References.
 */
@injectable()
export class HeadingRefactorContribution implements CommandContribution, MenuContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(MonacoWorkspace)
    protected readonly monacoWorkspace: MonacoWorkspace;

    private referencesRegistered = false;

    registerCommands(commands: CommandRegistry): void {
        this.ensureReferenceProvider();
        commands.registerCommand(HeadingRefactorCommands.RENAME, {
            execute: () => this.renameHeadingAtCursor(),
            isEnabled: () => !!this.headingAtCursor(),
            isVisible: () => !!this.headingAtCursor(),
        });
        commands.registerCommand(HeadingRefactorCommands.FIND_REFS, {
            execute: () => this.findHeadingReferencesCommand(),
            isEnabled: () => !!this.headingAtCursor(),
            isVisible: () => !!this.headingAtCursor(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: HeadingRefactorCommands.RENAME.id,
            label: 'Rename Heading and Update Links',
            order: 'connectome-h1',
        });
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: HeadingRefactorCommands.FIND_REFS.id,
            label: 'Find Heading References',
            order: 'connectome-h2',
        });
        menus.registerMenuAction(EditorContextMenu.MODIFICATION, {
            commandId: HeadingRefactorCommands.RENAME.id,
            label: 'Rename Heading and Update Links',
            order: 'connectome-h1',
        });
        menus.registerMenuAction(EditorContextMenu.MODIFICATION, {
            commandId: HeadingRefactorCommands.FIND_REFS.id,
            label: 'Find Heading References',
            order: 'connectome-h2',
        });
    }

    protected ensureReferenceProvider(): void {
        if (this.referencesRegistered) {
            return;
        }
        this.referencesRegistered = true;
        monaco.languages.registerReferenceProvider('markdown', {
            provideReferences: (model, position) => {
                const heading = this.headingAtPosition(model, position);
                if (!heading) {
                    return [];
                }
                return this.collectReferenceLocations(new URI(model.uri.toString()), heading.text);
            },
        });
    }

    protected headingAtCursor(): { uri: URI; text: string; line: number; level: number } | undefined {
        const widget = this.editorManager.currentEditor;
        if (!widget || widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return undefined;
        }
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return undefined;
        }
        const control = editor.getControl();
        const model = control.getModel();
        const pos = control.getPosition();
        if (!model || !pos) {
            return undefined;
        }
        return this.headingAtPosition(model, pos);
    }

    protected headingAtPosition(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
    ): { uri: URI; text: string; line: number; level: number } | undefined {
        const uri = new URI(model.uri.toString());
        if (uri.path.ext.toLowerCase() !== '.md') {
            return undefined;
        }
        const parsed = parseNote(model.getValue());
        const line0 = position.lineNumber - 1;
        const heading = parsed.headings.find(h => h.line === line0);
        if (!heading) {
            return undefined;
        }
        return { uri, text: heading.text, line: heading.line, level: heading.level };
    }

    protected async renameHeadingAtCursor(): Promise<void> {
        const current = this.headingAtCursor();
        if (!current) {
            return;
        }
        const dialog = new SingleTextInputDialog({
            title: 'Rename heading',
            initialValue: current.text,
            confirmButtonLabel: 'Rename',
            validate: value => {
                const v = value.trim();
                if (!v) {
                    return 'Heading cannot be empty';
                }
                return '';
            },
        });
        const name = await dialog.open();
        if (name === undefined) {
            return;
        }
        const newText = name.trim();
        if (newText === current.text) {
            return;
        }

        const noteKeys = new Set(
            this.index.getNoteNames(current.uri).map(n => n.toLowerCase().replace(/\.md$/, '')),
        );
        noteKeys.add(current.uri.path.name.toLowerCase());
        const rel = this.index.getWorkspaceRelativePath(current.uri).replace(/\.md$/i, '');
        if (rel) {
            noteKeys.add(rel.toLowerCase().replace(/\\/g, '/'));
        }

        let fileCount = 0;
        for (const source of this.index.getAllNoteUris()) {
            const text = await this.index.readNoteText(source);
            if (text === undefined) {
                continue;
            }
            let next = rewriteHeadingReferences(text, noteKeys, current.text, newText);
            if (source.toString() === current.uri.toString()) {
                next = replaceHeadingTextOnLine(next, current.line, newText);
            }
            if (next === text) {
                continue;
            }
            fileCount++;
            await this.writeNoteText(source, next);
        }

        // Ensure active buffer updated if somehow skipped
        const open = this.monacoWorkspace.getTextDocument(current.uri.toString());
        if (open) {
            const still = open.getText();
            const fixed = replaceHeadingTextOnLine(
                rewriteHeadingReferences(still, noteKeys, current.text, newText),
                current.line,
                newText,
            );
            if (fixed !== still) {
                await this.writeNoteText(current.uri, fixed);
            }
        }

        await this.messages.info(
            `Renamed heading to “${newText}”` +
            (fileCount ? ` and updated links in ${fileCount} file(s).` : '.'),
        );
    }

    protected async findHeadingReferencesCommand(): Promise<void> {
        const current = this.headingAtCursor();
        if (!current) {
            return;
        }
        const editor = MonacoEditor.get(this.editorManager.currentEditor!);
        if (!editor) {
            return;
        }
        // Trigger Monaco's built-in find-references UI when available
        const control = editor.getControl();
        await control.getAction('editor.action.referenceSearch.trigger')?.run();
        const locs = await this.collectReferenceLocations(current.uri, current.text);
        if (locs.length === 0) {
            await this.messages.info(`No references found for heading “${current.text}”.`);
        } else {
            await this.messages.info(
                `Found ${locs.length} reference(s) for “${current.text}” (see peek if available).`,
            );
        }
    }

    protected async collectReferenceLocations(
        noteUri: URI,
        headingText: string,
    ): Promise<monaco.languages.Location[]> {
        const noteKeys = new Set(
            this.index.getNoteNames(noteUri).map(n => n.toLowerCase().replace(/\.md$/, '')),
        );
        noteKeys.add(noteUri.path.name.toLowerCase());
        const rel = this.index.getWorkspaceRelativePath(noteUri).replace(/\.md$/i, '');
        if (rel) {
            noteKeys.add(rel.toLowerCase().replace(/\\/g, '/'));
        }
        const oldSlug = slugifyHeading(headingText);
        const locations: monaco.languages.Location[] = [];

        // Definition
        const defDoc = this.index.getParsedNote(noteUri);
        const defHeading = defDoc?.headings.find(h => headingsMatch(h.text, headingText));
        if (defHeading) {
            locations.push({
                uri: monaco.Uri.parse(noteUri.toString()),
                range: new monaco.Range(defHeading.line + 1, 1, defHeading.line + 1, 1),
            });
        }

        for (const source of this.index.getAllNoteUris()) {
            const text = await this.index.readNoteText(source);
            if (text === undefined) {
                continue;
            }
            const parsed = parseNote(text);
            for (const link of parsed.links) {
                if (!link.fragment || link.isBlockFragment) {
                    continue;
                }
                if (!headingsMatch(link.fragment, headingText) && slugifyHeading(link.fragment) !== oldSlug) {
                    continue;
                }
                const key = link.rawTarget.trim().toLowerCase().replace(/\.md$/, '');
                if (key && !noteKeys.has(key) && ![...noteKeys].some(k => key.endsWith('/' + k) || key === k)) {
                    continue;
                }
                if (!key && source.toString() !== noteUri.toString()) {
                    continue; // [[#heading]] only same-file
                }
                locations.push({
                    uri: monaco.Uri.parse(source.toString()),
                    range: new monaco.Range(link.line + 1, link.startCol + 1, link.line + 1, link.endCol + 1),
                });
            }
            for (const md of parsed.mdLinks) {
                if (!md.fragment) {
                    continue;
                }
                if (!headingsMatch(md.fragment, headingText) && slugifyHeading(md.fragment) !== oldSlug) {
                    continue;
                }
                const key = md.path.trim().toLowerCase().replace(/^\.\//, '').replace(/\.md$/, '');
                if (md.path) {
                    const matchesKey = noteKeys.has(key) ||
                        [...noteKeys].some(k => key === k || key.endsWith('/' + k) || key.endsWith(k));
                    if (!matchesKey) {
                        // resolve path against source
                        continue;
                    }
                } else if (source.toString() !== noteUri.toString()) {
                    continue;
                }
                locations.push({
                    uri: monaco.Uri.parse(source.toString()),
                    range: new monaco.Range(md.line + 1, md.hrefStartCol + 1, md.line + 1, md.hrefEndCol + 1),
                });
            }
        }
        return locations;
    }

    protected async writeNoteText(uri: URI, next: string): Promise<void> {
        const openModel = this.monacoWorkspace.getTextDocument(uri.toString());
        if (openModel) {
            const model = openModel.textEditorModel;
            const fullRange = model.getFullModelRange();
            model.pushEditOperations([], [{ range: fullRange, text: next }], () => null);
        } else {
            await this.fileService.write(uri, next);
        }
        await this.index.indexUri(uri, next);
    }
}
