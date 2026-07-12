import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MenuContribution, MenuModelRegistry } from '@theia/core';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import * as monaco from '@theia/monaco-editor-core';
import { SpellCheckService } from './spell-check-service';
import { SpellCheckCommands } from './spell-check-command-contribution';
import { DIAGNOSTIC_SOURCE, SPELL_CHECK_LANGUAGE_IDS } from './spell-check-diagnostics-contribution';

/**
 * Powers the lightbulb / Ctrl+. quick-fix menu (standard Monaco behavior once
 * a CodeActionProvider exists for the language — the same mechanism
 * @theia/ai-editor, already a dependency of this app, uses for its own
 * "Fix with AI" quick fix). The suggestion/dictionary/ignore actions
 * registered here also show under Monaco's built-in "Quick Fix…" entry in
 * the editor's right-click menu.
 *
 * The explicit "Fix Spelling…" entry registered directly on
 * EditorContextMenu.MODIFICATION (see registerMenus) is a guaranteed
 * always-visible fallback for the same right-click requirement, independent
 * of whether Monaco's built-in context-menu wiring surfaces prominently
 * inside Theia.
 */
@injectable()
export class SpellCheckCodeActionProvider implements FrontendApplicationContribution, MenuContribution {

    @inject(SpellCheckService)
    protected readonly spellCheck: SpellCheckService;

    onStart(): void {
        monaco.languages.registerCodeActionProvider([...SPELL_CHECK_LANGUAGE_IDS], {
            provideCodeActions: (model, _range, context) => {
                const markers = context.markers.filter(marker => marker.source === DIAGNOSTIC_SOURCE);
                if (markers.length === 0) {
                    return { actions: [], dispose: () => { /* no-op */ } };
                }
                const actions: monaco.languages.CodeAction[] = [];
                for (const marker of markers) {
                    const word = typeof marker.code === 'string' ? marker.code : String(marker.code ?? '');
                    if (!word) {
                        continue;
                    }
                    const markerRange = new monaco.Range(
                        marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn
                    );
                    const suggestions = this.spellCheck.suggestSync(word);
                    suggestions.forEach((suggestion, index) => {
                        actions.push({
                            title: `Change to "${suggestion}"`,
                            kind: 'quickfix',
                            diagnostics: [marker],
                            isPreferred: index === 0,
                            edit: {
                                edits: [{
                                    resource: model.uri,
                                    textEdit: { range: markerRange, text: suggestion },
                                    versionId: undefined
                                }]
                            }
                        });
                    });
                    actions.push({
                        title: `Add "${word}" to Dictionary`,
                        kind: 'quickfix',
                        diagnostics: [marker],
                        command: {
                            id: SpellCheckCommands.ADD_TO_DICTIONARY.id,
                            title: SpellCheckCommands.ADD_TO_DICTIONARY.label ?? 'Add to Dictionary',
                            arguments: [word]
                        }
                    });
                    actions.push({
                        title: 'Ignore Word',
                        kind: 'quickfix',
                        diagnostics: [marker],
                        command: {
                            id: SpellCheckCommands.IGNORE_WORD.id,
                            title: SpellCheckCommands.IGNORE_WORD.label ?? 'Ignore Word',
                            arguments: [word]
                        }
                    });
                }
                return { actions, dispose: () => { /* no-op */ } };
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.MODIFICATION, {
            commandId: SpellCheckCommands.FIX.id,
            label: SpellCheckCommands.FIX.label
        });
    }
}
