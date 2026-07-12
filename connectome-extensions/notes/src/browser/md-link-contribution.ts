import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import * as monaco from '@theia/monaco-editor-core';
import { NoteIndexService } from './note-index-service';
import {
    isExternalMarkdownHref,
    parseNote,
    splitMarkdownHref,
} from './note-parser';
import {
    decodeMdPath,
    encodeMdPath,
    relativeMarkdownPath,
    resolveMarkdownLinkPath,
} from './md-path-utils';
import { WikilinkNavigationService } from './wikilink-navigation';

export namespace MdLinkCommands {
    export const OPEN: Command = {
        id: 'connectomeNotes.openMarkdownLink',
        label: 'Notes: Open Markdown Link',
    };
}

/**
 * Monaco completion + clickable links for standard markdown `[label](path)`
 * and `[label](#heading)` (complements wikilink-only support).
 */
@injectable()
export class MdLinkContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(WikilinkNavigationService)
    protected readonly navigation: WikilinkNavigationService;

    onStart(): void {
        this.registerCompletionProvider();
        this.registerLinkProvider();
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(MdLinkCommands.OPEN, {
            execute: (fromUri?: string, href?: string) => {
                if (typeof fromUri === 'string' && typeof href === 'string') {
                    return this.openHref(new URI(fromUri), href);
                }
            },
        });
    }

    protected registerCompletionProvider(): void {
        monaco.languages.registerCompletionItemProvider('markdown', {
            triggerCharacters: ['(', '#', '/', '.', '-'],
            provideCompletionItems: (model, position) => {
                const lineText = model.getLineContent(position.lineNumber);
                const before = lineText.substring(0, position.column - 1);
                // Inside a markdown link destination: `](…` not preceded by second `[`
                const dest = before.match(/\]\(([^)\n]*)$/);
                if (!dest) {
                    return { suggestions: [] };
                }
                // Avoid wikilink context `]](`
                if (before.slice(Math.max(0, before.length - dest[0].length - 1)).includes('[[')) {
                    // still ok for normal ](
                }
                const typed = dest[1];
                // `](#…` or `](path#…` → heading completions
                if (typed.includes('#')) {
                    return this.headingCompletions(model, position, typed);
                }
                return this.pathCompletions(model, position, typed);
            },
        });
    }

    protected pathCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        typed: string,
    ): monaco.languages.CompletionList {
        const fromUri = new URI(model.uri.toString());
        const range = new monaco.Range(
            position.lineNumber,
            position.column - typed.length,
            position.lineNumber,
            position.column,
        );
        const suggestions: monaco.languages.CompletionItem[] = [];
        const seen = new Set<string>();
        for (const item of this.index.getCompletionItems()) {
            if (item.isAlias) {
                continue; // path links prefer real files
            }
            let rel = relativeMarkdownPath(fromUri, item.uri);
            rel = encodeMdPath(rel);
            if (seen.has(rel)) {
                continue;
            }
            seen.add(rel);
            suggestions.push({
                label: item.label + '.md',
                kind: monaco.languages.CompletionItemKind.File,
                detail: item.detail,
                insertText: rel,
                range,
                filterText: `${item.label} ${item.detail} ${rel}`,
            });
        }
        // Same-note heading shortcut: offer `#` completions via typing `#` next
        return { suggestions };
    }

    protected headingCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        typed: string,
    ): monaco.languages.CompletionList {
        const hash = typed.lastIndexOf('#');
        const pathPart = typed.substring(0, hash);
        const fragPart = typed.substring(hash + 1);
        const fromUri = new URI(model.uri.toString());
        const target = pathPart.trim()
            ? resolveMarkdownLinkPath(fromUri, pathPart)
            : fromUri;
        const doc = this.index.getParsedNote(target) ?? (
            target.toString() === fromUri.toString() ? parseNote(model.getValue()) : undefined
        );
        if (!doc) {
            return { suggestions: [] };
        }
        const range = new monaco.Range(
            position.lineNumber,
            position.column - fragPart.length,
            position.lineNumber,
            position.column,
        );
        const suggestions: monaco.languages.CompletionItem[] = doc.headings.map(h => ({
            label: h.text,
            kind: monaco.languages.CompletionItemKind.Text,
            detail: `H${h.level} · #${h.slug}`,
            insertText: h.slug,
            range,
            filterText: `${h.text} ${h.slug}`,
        }));
        return { suggestions };
    }

    protected registerLinkProvider(): void {
        monaco.languages.registerLinkProvider('markdown', {
            provideLinks: model => {
                const modelUri = new URI(model.uri.toString());
                const parsed = parseNote(model.getValue());
                const links: monaco.languages.ILink[] = [];
                for (const link of parsed.mdLinks) {
                    if (isExternalMarkdownHref(link.href)) {
                        continue;
                    }
                    const url = new URI('command:connectomeNotes.openMarkdownLink')
                        .withQuery(JSON.stringify([modelUri.toString(), link.href]))
                        .toString();
                    links.push({
                        range: new monaco.Range(
                            link.line + 1,
                            link.hrefStartCol + 1,
                            link.line + 1,
                            link.hrefEndCol + 1,
                        ),
                        url,
                        tooltip: link.path
                            ? 'Open markdown link'
                            : (link.fragment ? `Go to #${link.fragment}` : 'Open link'),
                    });
                }
                return { links };
            },
        });
    }

    protected async openHref(fromUri: URI, href: string): Promise<void> {
        if (isExternalMarkdownHref(href)) {
            return;
        }
        const { path, fragment } = splitMarkdownHref(href);
        const target = path.trim()
            ? resolveMarkdownLinkPath(fromUri, path)
            : fromUri;

        // Prefer indexed note if resolve lands near a known note
        let noteUri = target;
        if (path.trim()) {
            const decoded = decodeMdPath(path).replace(/\.md$/i, '');
            const viaIndex = this.index.resolveWikilink(decoded, fromUri);
            if (viaIndex) {
                noteUri = viaIndex;
            } else if (!this.index.getParsedNote(target)) {
                // try with explicit .md already in resolveMarkdownLinkPath
                const alt = this.index.resolveWikilink(target.path.name, fromUri);
                if (alt) {
                    noteUri = alt;
                }
            }
        }

        if (fragment) {
            await this.navigation.openAtFragment(noteUri, fragment, fragment.startsWith('^'));
            return;
        }
        await this.navigation.openAtFragment(noteUri, undefined, false);
    }
}
