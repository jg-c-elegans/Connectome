import { injectable, inject } from '@theia/core/shared/inversify';
import {
    FrontendApplicationContribution, OpenHandler, WidgetOpenerOptions, Widget
} from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry, MaybePromise } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import * as monaco from '@theia/monaco-editor-core';
import { NoteIndexService } from './note-index-service';
import { parseNote, parseWikilinkInner } from './note-parser';
import { WikilinkNavigationService, WIKILINK_SCHEME } from './wikilink-navigation';

export namespace WikilinkCommands {
    export const OPEN: Command = {
        id: 'connectomeNotes.openWikilink',
        label: 'Notes: Open Wikilink'
    };
}

/**
 * Monaco language features for `[[wikilinks]]` / `![[embeds]]`: completion,
 * clickable links (including unresolved → create), and open-handler navigation
 * with heading/block fragments.
 */
@injectable()
export class WikilinkContribution implements FrontendApplicationContribution, OpenHandler, CommandContribution {

    readonly id = 'connectome-wikilink-open-handler';

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(WikilinkNavigationService)
    protected readonly navigation: WikilinkNavigationService;

    onStart(): void {
        this.index.initialize();
        this.registerCompletionProvider();
        this.registerLinkProvider();
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(WikilinkCommands.OPEN, {
            execute: (fromUri?: string, inner?: string) => {
                if (typeof fromUri === 'string' && typeof inner === 'string') {
                    return this.navigation.openFromInner(new URI(fromUri), inner);
                }
            }
        });
    }

    canHandle(uri: URI, _options?: WidgetOpenerOptions): MaybePromise<number> {
        return uri.scheme === WIKILINK_SCHEME ? 500 : -1;
    }

    async open(uri: URI, _options?: WidgetOpenerOptions): Promise<Widget | undefined> {
        const parsed = this.navigation.parseLinkUri(uri);
        if (!parsed) {
            return undefined;
        }
        await this.navigation.openFromInner(parsed.from, parsed.inner);
        return undefined;
    }

    protected registerCompletionProvider(): void {
        monaco.languages.registerCompletionItemProvider('markdown', {
            triggerCharacters: ['['],
            provideCompletionItems: (model, position) => {
                const lineText = model.getLineContent(position.lineNumber);
                const before = lineText.substring(0, position.column - 1);
                const match = before.match(/\[\[([^\[\]]*)$/);
                if (!match) {
                    return { suggestions: [] };
                }
                const typed = match[1];
                // If user is typing a fragment (`Note#...`), only complete headings of that note later
                if (typed.includes('#')) {
                    return this.fragmentCompletions(model, position, typed);
                }
                const after = lineText.substring(position.column - 1);
                const closing = after.startsWith(']]') ? '' : ']]';
                const range = new monaco.Range(
                    position.lineNumber, position.column - typed.length,
                    position.lineNumber, position.column
                );
                const suggestions = this.index.getCompletionItems().map(item => ({
                    label: item.label,
                    kind: item.isAlias
                        ? monaco.languages.CompletionItemKind.Reference
                        : monaco.languages.CompletionItemKind.File,
                    detail: item.detail,
                    insertText: item.insertText + closing,
                    range,
                    filterText: item.label + ' ' + item.detail
                }));
                return { suggestions };
            }
        });
    }

    protected fragmentCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        typed: string
    ): monaco.languages.CompletionList {
        const hash = typed.lastIndexOf('#');
        const filePart = typed.substring(0, hash);
        const fragPart = typed.substring(hash + 1);
        const fromUri = new URI(model.uri.toString());
        const target = filePart
            ? this.index.resolveWikilink(parseWikilinkInner(filePart).rawTarget || filePart, fromUri)
            : fromUri;
        if (!target) {
            return { suggestions: [] };
        }
        const doc = this.index.getParsedNote(target);
        if (!doc) {
            return { suggestions: [] };
        }
        const after = model.getLineContent(position.lineNumber).substring(position.column - 1);
        const closing = after.startsWith(']]') ? '' : ']]';
        const range = new monaco.Range(
            position.lineNumber, position.column - fragPart.length,
            position.lineNumber, position.column
        );
        const suggestions: monaco.languages.CompletionItem[] = [];
        if (!fragPart.startsWith('^')) {
            for (const heading of doc.headings) {
                suggestions.push({
                    label: heading.text,
                    kind: monaco.languages.CompletionItemKind.Text,
                    detail: `H${heading.level}`,
                    insertText: heading.text + closing,
                    range,
                    filterText: heading.text
                });
            }
        }
        for (const block of doc.blocks) {
            suggestions.push({
                label: '^' + block.id,
                kind: monaco.languages.CompletionItemKind.Snippet,
                detail: 'Block',
                insertText: '^' + block.id + closing,
                range,
                filterText: block.id
            });
        }
        return { suggestions };
    }

    protected registerLinkProvider(): void {
        monaco.languages.registerLinkProvider('markdown', {
            provideLinks: model => {
                const modelUri = new URI(model.uri.toString());
                const parsed = parseNote(model.getValue());
                const links: monaco.languages.ILink[] = [];
                for (const link of parsed.links) {
                    const url = this.navigation.buildLinkUri(modelUri, link.innerText).toString();
                    const resolved = link.rawTarget
                        ? this.index.resolveWikilink(link.rawTarget, modelUri)
                        : modelUri;
                    links.push({
                        range: new monaco.Range(link.line + 1, link.startCol + 1, link.line + 1, link.endCol + 1),
                        url,
                        tooltip: resolved
                            ? (link.isEmbed ? 'Open embed target' : 'Open note')
                            : 'Create note…'
                    });
                }
                return { links };
            }
        });
    }
}
