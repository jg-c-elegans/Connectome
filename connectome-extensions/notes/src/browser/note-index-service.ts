import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { Emitter, Event, DisposableCollection } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangeType, FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import {
    ParsedLink, ParsedNote, parseNote, headingsMatch, slugifyHeading
} from './note-parser';

export interface LinkOccurrence extends ParsedLink {
    sourceUri: string;
}

export interface TagOccurrence {
    sourceUri: string;
    line: number;
    startCol: number;
}

export interface TagInfo {
    /** First-seen casing, used for display; the map key is lowercased. */
    display: string;
    occurrences: TagOccurrence[];
}

export interface UnlinkedMention {
    sourceUri: string;
    line: number;
    startCol: number;
    endCol: number;
    lineText: string;
    matchedText: string;
}

export interface BrokenLink {
    sourceUri: string;
    link: ParsedLink;
}

export interface TaskOccurrence {
    sourceUri: string;
    line: number;
    checkboxStartCol: number;
    checkboxEndCol: number;
    text: string;
    indentation: number;
    completed: boolean;
}

export interface CompletionNoteItem {
    /** Text inserted for the file portion of a wikilink. */
    insertText: string;
    /** Primary label in the completion list. */
    label: string;
    detail: string;
    uri: URI;
    /** True when label is an alias rather than the filename stem. */
    isAlias: boolean;
}

/**
 * Workspace-wide index of wikilinks, tags, aliases, blocks, and headings.
 * Disk state lives in `docs`; unsaved editor buffers override via `dirty`
 * (debounced) so panels can update before save.
 */
@injectable()
export class NoteIndexService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(FileSearchService)
    protected readonly fileSearchService: FileSearchService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(MonacoWorkspace) @optional()
    protected readonly monacoWorkspace: MonacoWorkspace | undefined;

    protected readonly docs = new Map<string, ParsedNote>();
    /** Live editor overrides (unsaved). */
    protected readonly dirty = new Map<string, ParsedNote>();
    /** basename (sans `.md`, lowercased) -> note URIs */
    protected nameToUris = new Map<string, string[]>();
    /** alias (lowercased) -> note URIs */
    protected aliasToUris = new Map<string, string[]>();
    /** lowercased workspace-relative-ish path (URI path string) -> note URI, for `dir/name` wikilinks */
    protected pathIndex = new Map<string, string>();

    protected readonly onDidUpdateEmitter = new Emitter<void>();
    readonly onDidUpdate: Event<void> = this.onDidUpdateEmitter.event;

    protected readonly toDispose = new DisposableCollection();
    protected initialized = false;
    protected fireTimeout: ReturnType<typeof setTimeout> | undefined;
    protected dirtyTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        const roots = await this.workspaceService.roots;
        if (roots.length === 0) {
            return;
        }
        for (const root of roots) {
            this.toDispose.push(this.fileService.watch(root.resource, { recursive: true, excludes: [] }));
        }
        this.toDispose.push(this.fileService.onDidFilesChange(event => this.handleFileChanges(event)));
        this.attachLiveBuffers();

        const rootUris = roots.map(root => root.resource.toString());
        const candidates = await this.fileSearchService.find('', {
            rootUris,
            includePatterns: ['**/*.md'],
            excludePatterns: ['**/node_modules/**'],
            useGitIgnore: true,
            limit: 10000,
            fuzzyMatch: false
        });
        const concurrency = 15;
        for (let i = 0; i < candidates.length; i += concurrency) {
            await Promise.all(candidates.slice(i, i + concurrency).map(uri => this.readAndParse(uri)));
        }
        this.rebuildDerivedIndexes();
        this.onDidUpdateEmitter.fire();
    }

    dispose(): void {
        this.toDispose.dispose();
        for (const t of this.dirtyTimeouts.values()) {
            clearTimeout(t);
        }
        this.dirtyTimeouts.clear();
    }

    protected attachLiveBuffers(): void {
        if (!this.monacoWorkspace) {
            return;
        }
        this.toDispose.push(this.monacoWorkspace.onDidChangeTextDocument(event => {
            const uri = new URI(event.model.uri);
            if (uri.path.ext.toLowerCase() !== '.md') {
                return;
            }
            this.scheduleDirty(uri.toString(), event.model.getText());
        }));
        this.toDispose.push(this.monacoWorkspace.onDidSaveTextDocument(model => {
            const uri = new URI(model.uri);
            if (uri.path.ext.toLowerCase() !== '.md') {
                return;
            }
            const key = uri.toString();
            this.dirty.delete(key);
            this.docs.set(key, parseNote(model.getText()));
            this.fireSoon();
        }));
        this.toDispose.push(this.monacoWorkspace.onDidOpenTextDocument(model => {
            const uri = new URI(model.uri);
            if (uri.path.ext.toLowerCase() !== '.md') {
                return;
            }
            // Seed from open buffer so panels work before first disk read finishes
            if (!this.docs.has(uri.toString())) {
                this.docs.set(uri.toString(), parseNote(model.getText()));
                this.fireSoon();
            }
        }));
    }

    protected scheduleDirty(uri: string, text: string): void {
        const existing = this.dirtyTimeouts.get(uri);
        if (existing !== undefined) {
            clearTimeout(existing);
        }
        this.dirtyTimeouts.set(uri, setTimeout(() => {
            this.dirtyTimeouts.delete(uri);
            this.dirty.set(uri, parseNote(text));
            this.fireSoon();
        }, 250));
    }

    /** Effective parsed note (dirty buffer wins over disk). */
    getParsedNote(uri: URI | string): ParsedNote | undefined {
        const key = typeof uri === 'string' ? uri : uri.toString();
        return this.dirty.get(key) ?? this.docs.get(key);
    }

    getAllNoteUris(): URI[] {
        const keys = new Set([...this.docs.keys(), ...this.dirty.keys()]);
        return [...keys].map(uri => new URI(uri));
    }

    getBacklinks(target: URI): LinkOccurrence[] {
        const result: LinkOccurrence[] = [];
        const targetStr = target.toString();
        for (const sourceUri of this.allSourceKeys()) {
            if (sourceUri === targetStr) {
                continue;
            }
            const doc = this.getParsedNote(sourceUri);
            if (!doc) {
                continue;
            }
            const source = new URI(sourceUri);
            for (const link of doc.links) {
                if (link.isEmbed) {
                    // still counts as a backlink
                }
                const resolved = this.resolveWikilink(link.rawTarget, source);
                if (resolved && resolved.toString() === targetStr) {
                    result.push({ sourceUri, ...link });
                }
            }
        }
        return result;
    }

    getAllTags(): Map<string, TagInfo> {
        const result = new Map<string, TagInfo>();
        for (const sourceUri of this.allSourceKeys()) {
            const doc = this.getParsedNote(sourceUri);
            if (!doc) {
                continue;
            }
            for (const tag of doc.tags) {
                const key = tag.tag.toLowerCase();
                let info = result.get(key);
                if (!info) {
                    info = { display: tag.tag, occurrences: [] };
                    result.set(key, info);
                }
                info.occurrences.push({ sourceUri, line: tag.line, startCol: tag.startCol });
            }
        }
        return result;
    }

    getTasks(): TaskOccurrence[] {
        const result: TaskOccurrence[] = [];
        for (const sourceUri of this.allSourceKeys()) {
            const doc = this.getParsedNote(sourceUri);
            for (const task of doc?.tasks ?? []) {
                result.push({ sourceUri, ...task });
            }
        }
        return result.sort((a, b) => Number(a.completed) - Number(b.completed) ||
            a.sourceUri.localeCompare(b.sourceUri) || a.line - b.line);
    }

    /**
     * Names that identify this note for mentions / rewrite: stem, title, aliases,
     * and workspace-relative path without `.md`.
     */
    getNoteNames(uri: URI): string[] {
        const names = new Set<string>();
        names.add(uri.path.name);
        const rel = this.getWorkspaceRelativePath(uri).replace(/\.md$/i, '');
        if (rel) {
            names.add(rel);
            const parts = rel.split('/');
            if (parts.length > 1) {
                names.add(parts[parts.length - 1]);
            }
        }
        const doc = this.getParsedNote(uri);
        if (doc?.frontmatter?.title) {
            names.add(doc.frontmatter.title);
        }
        for (const alias of doc?.frontmatter?.aliases ?? []) {
            names.add(alias);
        }
        return [...names].filter(Boolean);
    }

    getCompletionItems(): CompletionNoteItem[] {
        const items: CompletionNoteItem[] = [];
        const seen = new Set<string>();
        for (const uri of this.getAllNoteUris()) {
            const detail = this.getWorkspaceRelativePath(uri);
            const stem = uri.path.name;
            const stemKey = 'stem:' + uri.toString();
            if (!seen.has(stemKey)) {
                seen.add(stemKey);
                items.push({
                    insertText: stem,
                    label: stem,
                    detail,
                    uri,
                    isAlias: false
                });
            }
            const doc = this.getParsedNote(uri);
            for (const alias of doc?.frontmatter?.aliases ?? []) {
                const aliasKey = 'alias:' + alias.toLowerCase() + ':' + uri.toString();
                if (seen.has(aliasKey)) {
                    continue;
                }
                seen.add(aliasKey);
                items.push({
                    insertText: alias,
                    label: alias,
                    detail: `${detail} (alias)`,
                    uri,
                    isAlias: true
                });
            }
        }
        return items.sort((a, b) => a.label.localeCompare(b.label));
    }

    /**
     * Resolve a wikilink file target to a note URI.
     * Targets with `/` match by path suffix; otherwise by basename or alias.
     * Ambiguity: prefer a note in the same directory as the source,
     * then the shallowest path, then alphabetical. Returns undefined when
     * multiple alias matches cannot be disambiguated by directory heuristics
     * equally — actually still picks best; use resolveWikilinkDetailed for ambiguity info.
     */
    resolveWikilink(rawTarget: string, fromUri: URI): URI | undefined {
        return this.resolveWikilinkDetailed(rawTarget, fromUri).uri;
    }

    resolveWikilinkDetailed(rawTarget: string, fromUri: URI): { uri: URI | undefined; ambiguous: boolean } {
        const key = rawTarget.trim().toLowerCase().replace(/\.md$/, '');
        if (!key) {
            // same-note fragment
            return { uri: fromUri, ambiguous: false };
        }
        if (key.includes('/')) {
            const suffix = '/' + key + '.md';
            const candidates: string[] = [];
            for (const [path, uri] of this.pathIndex.entries()) {
                if (path.endsWith(suffix) || path.endsWith(key + '.md') || path === key + '.md') {
                    candidates.push(uri);
                }
            }
            // also try relative to source parent
            const relative = fromUri.parent.resolve(key + '.md').toString();
            if (this.docs.has(relative) || this.dirty.has(relative)) {
                return { uri: new URI(relative), ambiguous: false };
            }
            const best = this.pickBest(candidates, fromUri);
            return { uri: best, ambiguous: candidates.length > 1 };
        }
        const byName = this.nameToUris.get(key) ?? [];
        const byAlias = this.aliasToUris.get(key) ?? [];
        const merged = [...new Set([...byName, ...byAlias])];
        if (merged.length === 0) {
            return { uri: undefined, ambiguous: false };
        }
        if (merged.length > 1 && byAlias.length > 1 && byName.length === 0) {
            // pure alias collision: only auto-pick if same-dir heuristic separates them
            const best = this.pickBest(merged, fromUri);
            const sameDir = merged.filter(u => new URI(u).parent.toString() === fromUri.parent.toString());
            if (sameDir.length !== 1 && !best) {
                return { uri: undefined, ambiguous: true };
            }
            // if multiple remain equally good, mark ambiguous and still return best pick for navigation
            return { uri: best, ambiguous: sameDir.length !== 1 && merged.length > 1 };
        }
        return { uri: this.pickBest(merged, fromUri), ambiguous: merged.length > 1 };
    }

    findHeadingLine(uri: URI, heading: string): number | undefined {
        const doc = this.getParsedNote(uri);
        if (!doc) {
            return undefined;
        }
        const match = doc.headings.find(h => headingsMatch(h.text, heading) || h.slug === slugifyHeading(heading));
        return match?.line;
    }

    findBlockLine(uri: URI, blockId: string): number | undefined {
        const doc = this.getParsedNote(uri);
        if (!doc) {
            return undefined;
        }
        const match = doc.blocks.find(b => b.id.toLowerCase() === blockId.toLowerCase());
        return match?.line;
    }

    async getUnlinkedMentions(target: URI): Promise<UnlinkedMention[]> {
        const names = this.getNoteNames(target)
            .filter(n => n.length >= 2)
            .sort((a, b) => b.length - a.length);
        if (names.length === 0) {
            return [];
        }
        const targetStr = target.toString();
        const result: UnlinkedMention[] = [];
        for (const sourceUri of this.allSourceKeys()) {
            if (sourceUri === targetStr) {
                continue;
            }
            const text = await this.readNoteText(new URI(sourceUri));
            if (text === undefined) {
                continue;
            }
            const doc = this.getParsedNote(sourceUri);
            const linkedRanges = (doc?.links ?? [])
                .filter(link => {
                    const resolved = this.resolveWikilink(link.rawTarget, new URI(sourceUri));
                    return resolved?.toString() === targetStr;
                })
                .map(link => ({ start: link.startCol, end: link.endCol, line: link.line }));

            const lines = text.split(/\r?\n/);
            let inFence = false;
            for (let line = 0; line < lines.length; line++) {
                const lineText = lines[line];
                if (/^\s*(```|~~~)/.test(lineText)) {
                    inFence = !inFence;
                    continue;
                }
                if (inFence) {
                    continue;
                }
                for (const name of names) {
                    const re = new RegExp(this.escapeRegExp(name), 'gi');
                    let match: RegExpExecArray | null;
                    while ((match = re.exec(lineText)) !== null) {
                        const startCol = match.index;
                        const endCol = startCol + match[0].length;
                        const insideLink = linkedRanges.some(r =>
                            r.line === line && startCol >= r.start && endCol <= r.end);
                        // Also skip if inside any wikilink brackets on the line
                        const insideAnyWikilink = this.isInsideWikilink(lineText, startCol);
                        if (insideLink || insideAnyWikilink) {
                            continue;
                        }
                        result.push({
                            sourceUri,
                            line,
                            startCol,
                            endCol,
                            lineText,
                            matchedText: match[0]
                        });
                    }
                }
            }
        }
        return result;
    }

    getBrokenLinks(): BrokenLink[] {
        const result: BrokenLink[] = [];
        for (const sourceUri of this.allSourceKeys()) {
            const doc = this.getParsedNote(sourceUri);
            if (!doc) {
                continue;
            }
            const source = new URI(sourceUri);
            for (const link of doc.links) {
                if (!link.rawTarget) {
                    // same-note fragment — check fragment existence
                    if (link.fragment) {
                        const line = link.isBlockFragment
                            ? this.findBlockLine(source, link.fragment)
                            : this.findHeadingLine(source, link.fragment);
                        if (line === undefined) {
                            result.push({ sourceUri, link });
                        }
                    }
                    continue;
                }
                const resolved = this.resolveWikilinkDetailed(link.rawTarget, source);
                if (!resolved.uri) {
                    result.push({ sourceUri, link });
                } else if (link.fragment) {
                    const line = link.isBlockFragment
                        ? this.findBlockLine(resolved.uri, link.fragment)
                        : this.findHeadingLine(resolved.uri, link.fragment);
                    if (line === undefined) {
                        result.push({ sourceUri, link });
                    }
                }
            }
        }
        return result;
    }

    /**
     * Resolved note-to-note edges (source -> target) for every wikilink that resolves
     * to another note. Same resolution loop as `getOrphanNotes()`'s inbound-set
     * computation, exposed as an edge list instead of collapsed into a Set.
     */
    getLinkGraph(): { source: URI; target: URI }[] {
        const result: { source: URI; target: URI }[] = [];
        for (const sourceUri of this.allSourceKeys()) {
            const doc = this.getParsedNote(sourceUri);
            if (!doc) {
                continue;
            }
            const source = new URI(sourceUri);
            for (const link of doc.links) {
                if (!link.rawTarget) {
                    continue;
                }
                const resolved = this.resolveWikilink(link.rawTarget, source);
                if (resolved) {
                    result.push({ source, target: resolved });
                }
            }
        }
        return result;
    }

    getOrphanNotes(): URI[] {
        const inbound = new Set<string>();
        for (const sourceUri of this.allSourceKeys()) {
            const doc = this.getParsedNote(sourceUri);
            if (!doc) {
                continue;
            }
            const source = new URI(sourceUri);
            for (const link of doc.links) {
                if (!link.rawTarget) {
                    continue;
                }
                const resolved = this.resolveWikilink(link.rawTarget, source);
                if (resolved) {
                    inbound.add(resolved.toString());
                }
            }
        }
        return this.getAllNoteUris().filter(uri => !inbound.has(uri.toString()));
    }

    /**
     * Force-index a URI after create/rename so links resolve immediately.
     */
    async indexUri(uri: URI, text?: string): Promise<void> {
        const key = uri.toString();
        if (text !== undefined) {
            this.docs.set(key, parseNote(text));
            this.dirty.delete(key);
        } else {
            await this.readAndParse(key);
        }
        this.rebuildDerivedIndexes();
        this.onDidUpdateEmitter.fire();
    }

    async removeUri(uri: URI): Promise<void> {
        const key = uri.toString();
        this.docs.delete(key);
        this.dirty.delete(key);
        this.rebuildDerivedIndexes();
        this.onDidUpdateEmitter.fire();
    }

    getWorkspaceRelativePath(uri: URI): string {
        for (const root of this.workspaceService.tryGetRoots()) {
            const relative = root.resource.relative(uri);
            if (relative) {
                return relative.toString();
            }
        }
        return uri.path.toString();
    }

    /** Read note text from dirty monaco model or disk (async). */
    async readNoteText(uri: URI): Promise<string | undefined> {
        if (this.monacoWorkspace) {
            const model = this.monacoWorkspace.getTextDocument(uri.toString());
            if (model) {
                return model.getText();
            }
        }
        try {
            const content = await this.fileService.read(uri);
            return content.value;
        } catch {
            return undefined;
        }
    }

    protected allSourceKeys(): string[] {
        return [...new Set([...this.docs.keys(), ...this.dirty.keys()])];
    }

    protected isInsideWikilink(lineText: string, col: number): boolean {
        let i = 0;
        while (i < lineText.length) {
            const start = lineText.indexOf('[[', i);
            if (start < 0) {
                return false;
            }
            const end = lineText.indexOf(']]', start + 2);
            if (end < 0) {
                return col >= start;
            }
            if (col >= start && col <= end + 2) {
                return true;
            }
            i = end + 2;
        }
        return false;
    }

    protected escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    protected pickBest(candidates: string[], fromUri: URI): URI | undefined {
        if (candidates.length === 0) {
            return undefined;
        }
        if (candidates.length === 1) {
            return new URI(candidates[0]);
        }
        const fromParent = fromUri.parent.toString();
        const depth = (uri: string) => uri.split('/').length;
        const sorted = [...candidates].sort((a, b) => {
            const aSameDir = new URI(a).parent.toString() === fromParent ? 0 : 1;
            const bSameDir = new URI(b).parent.toString() === fromParent ? 0 : 1;
            if (aSameDir !== bSameDir) {
                return aSameDir - bSameDir;
            }
            if (depth(a) !== depth(b)) {
                return depth(a) - depth(b);
            }
            return a.localeCompare(b);
        });
        return new URI(sorted[0]);
    }

    protected async readAndParse(uri: string): Promise<void> {
        try {
            const content = await this.fileService.read(new URI(uri));
            // Do not clobber a dirtier live buffer
            if (!this.dirty.has(uri)) {
                this.docs.set(uri, parseNote(content.value));
            } else {
                this.docs.set(uri, parseNote(content.value));
            }
        } catch {
            this.docs.delete(uri);
        }
    }

    protected handleFileChanges(event: FileChangesEvent): void {
        let touched = false;
        for (const change of event.changes) {
            if (change.resource.path.ext.toLowerCase() !== '.md') {
                continue;
            }
            const uri = change.resource.toString();
            touched = true;
            if (change.type === FileChangeType.DELETED) {
                this.docs.delete(uri);
                this.dirty.delete(uri);
            } else {
                this.readAndParse(uri).then(() => this.fireSoon());
            }
        }
        if (touched) {
            this.fireSoon();
        }
    }

    protected fireSoon(): void {
        if (this.fireTimeout !== undefined) {
            clearTimeout(this.fireTimeout);
        }
        this.fireTimeout = setTimeout(() => {
            this.fireTimeout = undefined;
            this.rebuildDerivedIndexes();
            this.onDidUpdateEmitter.fire();
        }, 200);
    }

    protected rebuildDerivedIndexes(): void {
        this.nameToUris = new Map();
        this.aliasToUris = new Map();
        this.pathIndex = new Map();
        for (const uriStr of this.allSourceKeys()) {
            const uri = new URI(uriStr);
            const name = uri.path.name.toLowerCase();
            const list = this.nameToUris.get(name);
            if (list) {
                list.push(uriStr);
            } else {
                this.nameToUris.set(name, [uriStr]);
            }
            this.pathIndex.set(uri.path.toString().toLowerCase(), uriStr);
            const rel = this.getWorkspaceRelativePath(uri).toLowerCase().replace(/\.md$/, '');
            if (rel) {
                this.pathIndex.set(rel.replace(/\\/g, '/'), uriStr);
            }
            const doc = this.getParsedNote(uriStr);
            for (const alias of doc?.frontmatter?.aliases ?? []) {
                const key = alias.toLowerCase();
                const aliasList = this.aliasToUris.get(key);
                if (aliasList) {
                    if (!aliasList.includes(uriStr)) {
                        aliasList.push(uriStr);
                    }
                } else {
                    this.aliasToUris.set(key, [uriStr]);
                }
            }
            if (doc?.frontmatter?.title) {
                const key = doc.frontmatter.title.toLowerCase();
                const titleList = this.aliasToUris.get(key);
                if (titleList) {
                    if (!titleList.includes(uriStr)) {
                        titleList.push(uriStr);
                    }
                } else {
                    this.aliasToUris.set(key, [uriStr]);
                }
            }
        }
    }
}
