import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { CommonMenus } from '@theia/core/lib/browser';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { NoteIndexService } from './note-index-service';
import {
    isExternalMarkdownHref,
    rewriteMarkdownLinkTargets,
    rewriteWikilinkTargets,
} from './note-parser';
import {
    encodeMdPath,
    relativeMarkdownPath,
    resolveMarkdownLinkPath,
} from './md-path-utils';

export namespace RenameNoteCommands {
    export const RENAME: Command = {
        id: 'connectomeNotes.renameNote',
        label: 'Notes: Rename Note and Update Links'
    };
}

/**
 * Renames/moves the active markdown note and rewrites wikilinks **and**
 * standard markdown `[]()` destinations across the workspace.
 */
@injectable()
export class RenameNoteContribution implements CommandContribution, MenuContribution {

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

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(RenameNoteCommands.RENAME, {
            execute: () => this.renameActive(),
            isEnabled: () => this.activeMarkdown() !== undefined
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: RenameNoteCommands.RENAME.id,
            label: 'Rename Note and Update Links'
        });
    }

    protected activeMarkdown(): URI | undefined {
        const uri = this.editorManager.currentEditor?.editor.uri;
        if (uri && uri.path.ext.toLowerCase() === '.md') {
            return uri;
        }
        return undefined;
    }

    protected async renameActive(): Promise<void> {
        const oldUri = this.activeMarkdown();
        if (!oldUri) {
            return;
        }
        const oldNames = new Set(
            this.index.getNoteNames(oldUri).map(n => n.toLowerCase().replace(/\.md$/, ''))
        );
        oldNames.add(oldUri.path.name.toLowerCase());
        const rel = this.index.getWorkspaceRelativePath(oldUri).replace(/\.md$/i, '');
        if (rel) {
            oldNames.add(rel.toLowerCase().replace(/\\/g, '/'));
        }

        const dialog = new SingleTextInputDialog({
            title: 'Rename note',
            initialValue: oldUri.path.name,
            confirmButtonLabel: 'Rename',
            validate: value => {
                const v = value.trim();
                if (!v) {
                    return 'Name cannot be empty';
                }
                if (/[<>:"|?*]/.test(v) || v.includes('/') || v.includes('\\')) {
                    return 'Use a simple file name without path separators';
                }
                return '';
            }
        });
        const name = await dialog.open();
        if (name === undefined) {
            return;
        }
        let base = name.trim();
        if (base.toLowerCase().endsWith('.md')) {
            base = base.substring(0, base.length - 3);
        }
        const newUri = oldUri.parent.resolve(base + '.md');
        if (newUri.toString() === oldUri.toString()) {
            return;
        }
        if (await this.fileService.exists(newUri)) {
            await this.messages.error(`A file already exists at ${this.index.getWorkspaceRelativePath(newUri)}`);
            return;
        }

        let fileCount = 0;
        for (const source of this.index.getAllNoteUris()) {
            if (source.toString() === oldUri.toString()) {
                continue;
            }
            const text = await this.index.readNoteText(source);
            if (text === undefined) {
                continue;
            }
            let next = rewriteWikilinkTargets(text, oldNames, base);
            next = rewriteMarkdownLinkTargets(next, path => {
                if (!path || isExternalMarkdownHref(path)) {
                    return undefined;
                }
                try {
                    const resolved = resolveMarkdownLinkPath(source, path);
                    if (this.sameNote(resolved, oldUri)) {
                        return encodeMdPath(relativeMarkdownPath(source, newUri));
                    }
                } catch {
                    // fall through to name match
                }
                const key = path.trim().toLowerCase().replace(/^\.\//, '').replace(/\.md$/i, '');
                if (oldNames.has(key) || [...oldNames].some(n => key === n || key.endsWith('/' + n))) {
                    return encodeMdPath(relativeMarkdownPath(source, newUri));
                }
                return undefined;
            });
            if (next === text) {
                continue;
            }
            fileCount++;
            const openModel = this.monacoWorkspace.getTextDocument(source.toString());
            if (openModel) {
                const model = openModel.textEditorModel;
                const fullRange = model.getFullModelRange();
                model.pushEditOperations([], [{ range: fullRange, text: next }], () => null);
            } else {
                await this.fileService.write(source, next);
            }
            await this.index.indexUri(source, next);
        }

        await this.fileService.move(oldUri, newUri);
        await this.index.removeUri(oldUri);
        await this.index.indexUri(newUri);
        await this.editorManager.open(newUri);
        await this.messages.info(
            `Renamed to ${base}.md` + (fileCount ? ` and updated links in ${fileCount} file(s).` : '.')
        );
    }

    protected sameNote(a: URI, b: URI): boolean {
        if (a.toString() === b.toString()) {
            return true;
        }
        try {
            return a.path.toString().toLowerCase() === b.path.toString().toLowerCase();
        } catch {
            return false;
        }
    }
}
