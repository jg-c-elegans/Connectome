import { injectable, inject } from '@theia/core/shared/inversify';
import {
    Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry
} from '@theia/core';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { EditorManager } from '@theia/editor/lib/browser';
import { SpellCheckService } from './spell-check-service';
import { SpellCheckStateService } from './spell-check-state';
import { SPELL_CHECKED_EXTENSIONS } from './spell-check-diagnostics-contribution';

export namespace SpellCheckCommands {
    export const TOGGLE: Command = {
        id: 'connectomeSpellcheck.toggle',
        label: 'Spell Check'
    };
    export const ADD_TO_DICTIONARY: Command = {
        id: 'connectomeSpellcheck.addToDictionary',
        label: 'Spell Check: Add Word to Dictionary'
    };
    export const IGNORE_WORD: Command = {
        id: 'connectomeSpellcheck.ignoreWord',
        label: 'Spell Check: Ignore Word'
    };
    export const FIX: Command = {
        id: 'connectomeSpellcheck.fixAtCursor',
        label: 'Fix Spelling…'
    };
}

/**
 * View-menu checkbox toggle (mirrors LivePreviewCommandContribution), plus
 * the commands the code-action "Add to Dictionary" / "Ignore Word" buttons
 * invoke, plus the explicit right-click "Fix Spelling…" fallback that
 * re-dispatches Monaco's built-in quick-fix widget at the cursor.
 */
@injectable()
export class SpellCheckCommandContribution implements CommandContribution, MenuContribution {

    @inject(SpellCheckStateService)
    protected readonly state: SpellCheckStateService;

    @inject(SpellCheckService)
    protected readonly spellCheck: SpellCheckService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SpellCheckCommands.TOGGLE, {
            isToggled: () => this.state.enabled,
            execute: () => this.state.toggle()
        });
        commands.registerCommand(SpellCheckCommands.ADD_TO_DICTIONARY, {
            execute: (word?: string) => {
                if (typeof word === 'string' && word) {
                    return this.spellCheck.addToDictionary(word);
                }
            }
        });
        commands.registerCommand(SpellCheckCommands.IGNORE_WORD, {
            execute: (word?: string) => {
                if (typeof word === 'string' && word) {
                    this.spellCheck.ignoreWord(word);
                }
            }
        });
        commands.registerCommand(SpellCheckCommands.FIX, {
            isVisible: () => this.isSpellCheckedEditorActive(),
            isEnabled: () => this.isSpellCheckedEditorActive(),
            execute: () => this.commands.executeCommand('editor.action.quickFix')
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: SpellCheckCommands.TOGGLE.id,
            label: 'Spell Check',
            order: '6'
        });
    }

    /**
     * Extension-based check for whether the active editor is one spell-check
     * covers — used only to gate the right-click menu item's visibility, not
     * the actual diagnostics (that's driven by Monaco's real language id via
     * SpellCheckDiagnosticsContribution). Mirrors RenameNoteContribution's
     * `uri.path.ext`-based active-editor check.
     */
    protected isSpellCheckedEditorActive(): boolean {
        const uri = this.editorManager.currentEditor?.editor.uri;
        if (!uri) {
            return false;
        }
        return SPELL_CHECKED_EXTENSIONS.has(uri.path.ext.toLowerCase());
    }
}
