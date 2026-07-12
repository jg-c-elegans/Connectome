import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import * as monaco from '@theia/monaco-editor-core';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { NoteIndexService } from './note-index-service';
import {
    extractFragmentContent, parseNote, stripFrontmatterBody
} from './note-parser';
import { EmbedPreviewWidget } from './embed/embed-preview-widget';

export namespace EmbedCommands {
    export const PREVIEW_WITH_EMBEDS: Command = {
        id: 'connectomeNotes.previewWithEmbeds',
        label: 'Notes: Preview with Embeds'
    };
    export const INSERT_BLOCK_ID: Command = {
        id: 'connectomeNotes.insertBlockId',
        label: 'Notes: Insert Block ID'
    };
}

/**
 * Hover for `![[embeds]]`, block-id helper, and a simple HTML preview that
 * expands embeds (built-in markdown preview cannot load Theia plugins as
 * markdown-it extensions without a VS Code plugin package).
 */
@injectable()
export class EmbedContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    onStart(): void {
        this.registerHoverProvider();
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(EmbedCommands.PREVIEW_WITH_EMBEDS, {
            execute: () => this.openEmbedPreview(),
            isEnabled: () => !!this.activeMarkdownUri()
        });
        commands.registerCommand(EmbedCommands.INSERT_BLOCK_ID, {
            execute: () => this.insertBlockId(),
            isEnabled: () => !!this.activeMarkdownUri()
        });
    }

    protected activeMarkdownUri(): URI | undefined {
        const uri = this.editorManager.currentEditor?.editor.uri;
        if (uri && uri.path.ext.toLowerCase() === '.md') {
            return uri;
        }
        return undefined;
    }

    protected registerHoverProvider(): void {
        monaco.languages.registerHoverProvider('markdown', {
            provideHover: async (model, position) => {
                const text = model.getValue();
                const parsed = parseNote(text);
                const line = position.lineNumber - 1;
                const col = position.column - 1;
                const embed = parsed.links.find(link =>
                    link.isEmbed &&
                    link.line === line &&
                    col >= link.startCol &&
                    col <= link.endCol
                );
                if (!embed) {
                    return null;
                }
                const fromUri = new URI(model.uri.toString());
                const body = await this.resolveEmbedMarkdown(fromUri, embed.rawTarget, embed.fragment, embed.isBlockFragment, 0, new Set());
                return {
                    range: new monaco.Range(embed.line + 1, embed.startCol + 1, embed.line + 1, embed.endCol + 1),
                    contents: [
                        { value: `**Embed** \`${embed.innerText}\`` },
                        { value: body }
                    ]
                };
            }
        });
    }

    async resolveEmbedMarkdown(
        fromUri: URI,
        rawTarget: string,
        fragment: string | undefined,
        isBlock: boolean,
        depth: number,
        stack: Set<string>
    ): Promise<string> {
        if (depth > 3) {
            return '_Embed depth limit reached._';
        }
        const target = rawTarget
            ? this.index.resolveWikilink(rawTarget, fromUri)
            : fromUri;
        if (!target) {
            return `⚠️ _Unresolved embed: \`${rawTarget || fragment || '?'}\`_`;
        }
        const key = target.toString() + '#' + (fragment ?? '') + (isBlock ? '^' : '');
        if (stack.has(key)) {
            return '_Circular embed skipped._';
        }
        stack.add(key);
        const text = await this.index.readNoteText(target);
        if (text === undefined) {
            return `⚠️ _Could not read \`${this.index.getWorkspaceRelativePath(target)}\`_`;
        }
        let section = extractFragmentContent(text, fragment, isBlock);
        if (section === undefined) {
            return `⚠️ _Fragment not found in \`${this.index.getWorkspaceRelativePath(target)}\`_`;
        }
        // Expand nested embeds one level of text replacement for preview
        section = await this.expandEmbedsInText(target, section, depth + 1, stack);
        return section || '_Empty embed._';
    }

    async expandEmbedsInText(fromUri: URI, text: string, depth: number, stack: Set<string>): Promise<string> {
        const parsed = parseNote(text);
        // Rebuild by replacing from end so offsets stay valid
        const embeds = parsed.links.filter(l => l.isEmbed).sort((a, b) => b.startCol - a.startCol || b.line - a.line);
        if (embeds.length === 0) {
            return text;
        }
        const lines = text.split(/\r?\n/);
        for (const embed of embeds) {
            const body = await this.resolveEmbedMarkdown(
                fromUri, embed.rawTarget, embed.fragment, embed.isBlockFragment, depth, new Set(stack));
            const lineText = lines[embed.line];
            const replacement = `\n\n> **Embedded:** ${embed.innerText}\n>\n` +
                body.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
            lines[embed.line] =
                lineText.substring(0, embed.startCol) + replacement + lineText.substring(embed.endCol);
        }
        return lines.join('\n');
    }

    protected async openEmbedPreview(): Promise<void> {
        const uri = this.activeMarkdownUri();
        if (!uri) {
            return;
        }
        await this.index.initialize();
        const raw = await this.index.readNoteText(uri);
        if (raw === undefined) {
            await this.messages.error('Could not read the active note.');
            return;
        }
        const body = stripFrontmatterBody(raw);
        const parsed = parseNote(body);
        const embedCount = parsed.links.filter(l => l.isEmbed).length;
        const expanded = await this.expandEmbedsInText(uri, body, 0, new Set([uri.toString()]));
        if (embedCount === 0) {
            await this.messages.info(
                'No ![[embeds]] found in this note. Use ![[NoteName]] to embed another note, then open Markdown: Open Preview (built-in) or this command again.');
        }
        const html = this.markdownToSimpleHtml(expanded, uri.path.name);
        const widget = await this.widgetManager.getOrCreateWidget(EmbedPreviewWidget.ID) as EmbedPreviewWidget;
        widget.setContent(uri.path.name, html);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main' });
        }
        this.shell.activateWidget(widget.id);
    }

    protected async insertBlockId(): Promise<void> {
        const widget = this.editorManager.currentEditor;
        if (!widget || widget.editor.uri.path.ext.toLowerCase() !== '.md') {
            return;
        }
        const monacoEditor = MonacoEditor.get(widget);
        if (!monacoEditor) {
            return;
        }
        const ed = monacoEditor.getControl();
        const position = ed.getPosition();
        if (!position) {
            return;
        }
        const id = Math.random().toString(36).slice(2, 8);
        const line = ed.getModel()?.getLineContent(position.lineNumber) ?? '';
        if (/\s\^[A-Za-z0-9_-]+\s*$/.test(line)) {
            await this.messages.info('Line already has a block id.');
            return;
        }
        const col = line.length + 1;
        ed.executeEdits('connectome-block-id', [{
            range: new monaco.Range(position.lineNumber, col, position.lineNumber, col),
            text: ` ^${id}`
        }]);
        await this.messages.info(`Inserted block id ^${id}`);
    }

    /**
     * Minimal markdown→HTML for embed preview only (not a full CommonMark engine).
     */
    markdownToSimpleHtml(md: string, title: string): string {
        const escaped = (s: string) => s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const lines = md.split(/\r?\n/);
        const out: string[] = [];
        out.push(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escaped(title)}</title>`);
        // Colors match Connectome Dark editor TextMate tokens (headings/bold/italic/links/code).
        out.push(`<style>
            :root {
                --c-void: #050916; --c-card: #191d29; --c-indigo: #252850; --c-slate: #3b3f89;
                --c-purple: #5a36fa; --c-orchid: #a667f4; --c-sky: #019bfd; --c-cyan: #01c6fd;
                --c-amber: #fac93c; --c-coral: #f84a5a; --c-text: #f2f3f5;
            }
            body { font-family: var(--theia-ui-font-family, system-ui, sans-serif); padding: 1.5rem 2rem;
                   background: var(--c-void); color: var(--c-text); line-height: 1.55; max-width: 52rem; margin: 0 auto; }
            h1,h2,h3,h4,h5,h6 { color: var(--c-orchid); font-weight: 700; }
            h1,h2 { border-bottom: 1px solid var(--c-slate); padding-bottom: 0.2em; }
            strong,b { color: var(--c-amber); font-weight: 700; }
            em,i { color: var(--c-cyan); font-style: italic; }
            a { color: var(--c-purple); text-decoration: underline; }
            code { color: var(--c-sky); background: var(--c-card); border-radius: 4px; padding: 0.1em 0.35em; }
            pre { background: var(--c-card); border: 1px solid var(--c-indigo); border-radius: 6px;
                  padding: 0.75rem 1rem; overflow: auto; }
            pre code { color: var(--c-text); background: transparent; padding: 0; }
            blockquote { border-left: 4px solid var(--c-indigo); margin: 0.75rem 0;
                         padding: 0.35rem 0.85rem; color: var(--c-slate);
                         background: color-mix(in srgb, var(--c-indigo) 35%, transparent); }
            blockquote strong { color: var(--c-amber); }
            blockquote em { color: var(--c-cyan); }
            li::marker { color: var(--c-sky); }
            hr { border: none; border-top: 1px solid var(--c-slate); }
            .embed-missing { color: var(--c-coral); }
        </style></head><body>`);
        let inCode = false;
        let para: string[] = [];
        const flushPara = () => {
            if (para.length) {
                out.push('<p>' + para.join('<br>') + '</p>');
                para = [];
            }
        };
        for (const line of lines) {
            if (/^\s*```/.test(line)) {
                flushPara();
                if (!inCode) {
                    inCode = true;
                    out.push('<pre><code>');
                } else {
                    inCode = false;
                    out.push('</code></pre>');
                }
                continue;
            }
            if (inCode) {
                out.push(escaped(line) + '\n');
                continue;
            }
            const h = line.match(/^(#{1,6})\s+(.+)$/);
            if (h) {
                flushPara();
                const level = h[1].length;
                out.push(`<h${level}>${inline(h[2])}</h${level}>`);
                continue;
            }
            if (/^\s*>/.test(line)) {
                flushPara();
                out.push('<blockquote>' + inline(line.replace(/^\s*>\s?/, '')) + '</blockquote>');
                continue;
            }
            if (/^\s*$/.test(line)) {
                flushPara();
                continue;
            }
            para.push(inline(line));
        }
        flushPara();
        out.push('</body></html>');
        return out.join('\n');

        function inline(s: string): string {
            let t = escaped(s);
            t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
            t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
            return t;
        }
    }
}
