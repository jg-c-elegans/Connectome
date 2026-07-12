/**
 * Pure text-parsing helpers for markdown notes. No DI, no I/O — unit-testable.
 * Lines and columns are 0-based.
 */

export interface ParsedLink {
    /**
     * File portion of the wikilink (alias `|...` and fragment `#...` stripped).
     * Empty string means same-note fragment only (`[[#Heading]]` / `[[#^id]]`).
     */
    rawTarget: string;
    /** Heading text, block id (without `^`), or undefined. */
    fragment: string | undefined;
    /** True when fragment is a block id (`#^...`). */
    isBlockFragment: boolean;
    /** True for `![[...]]` embeds. */
    isEmbed: boolean;
    /** Full inner text between `[[` and `]]` (before stripping). */
    innerText: string;
    line: number;
    startCol: number;
    endCol: number;
    lineText: string;
}

export interface ParsedTag {
    /** Tag text without the leading `#`, original casing. */
    tag: string;
    line: number;
    startCol: number;
    /** True when the tag came from YAML frontmatter rather than inline `#tag`. */
    fromFrontmatter?: boolean;
}

export interface ParsedBlock {
    id: string;
    line: number;
    startCol: number;
    /** Full line text containing the block id. */
    lineText: string;
}

export interface ParsedHeading {
    level: number;
    text: string;
    /** GitHub-ish slug used for flexible matching. */
    slug: string;
    line: number;
}

export interface ParsedTask {
    line: number;
    checkboxStartCol: number;
    checkboxEndCol: number;
    text: string;
    indentation: number;
    completed: boolean;
}

export interface ParsedFrontmatter {
    raw: string;
    /** End line index (0-based) of the closing `---` line, inclusive. Body starts after this. */
    endLine: number;
    title?: string;
    aliases: string[];
    tags: string[];
}

export interface ParsedNote {
    links: ParsedLink[];
    /** Standard markdown links `[label](href)` / images `![alt](href)`. */
    mdLinks: ParsedMdLink[];
    tags: ParsedTag[];
    blocks: ParsedBlock[];
    headings: ParsedHeading[];
    tasks: ParsedTask[];
    frontmatter?: ParsedFrontmatter;
}

/**
 * Ordinary markdown link or image: `[label](href)` / `![alt](href)`.
 * `href` may include a `#fragment` and optional title: `url "title"`.
 */
export interface ParsedMdLink {
    label: string;
    /** Full destination as written (path + optional #fragment, no title). */
    href: string;
    /** Path portion only (may be empty for same-note `#heading`). */
    path: string;
    fragment?: string;
    isImage: boolean;
    line: number;
    /** Column of `[` or `![`. */
    startCol: number;
    endCol: number;
    /** Column range of the raw href inside `(...)`. */
    hrefStartCol: number;
    hrefEndCol: number;
    lineText: string;
}

/** Match `[[...]]` or `![[...]]`. */
export const WIKILINK_REGEX = /(!?)\[\[([^\[\]\n]+?)\]\]/g;
/**
 * Markdown links / images. Label may be empty. Href stops at `)` or whitespace
 * before an optional `"title"`. Does not match wikilinks (`[[`).
 */
export const MD_LINK_REGEX = /(!?)\[([^\]]*?)\]\((<([^>\n]+)>|([^)\s]+))(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;
// `#` at line start or after whitespace/bracket, followed by a letter/digit —
// which excludes ATX headings (`# Title`) and mid-word `#`.
const TAG_REGEX = /(^|[\s({\[])#([\p{L}\p{N}][\p{L}\p{N}/_-]*)/gu;
const FENCE_REGEX = /^\s*(```|~~~)/;
const HEADING_REGEX = /^(#{1,6})\s+(.+?)(?:\s+#*\s*)?$/;
const BLOCK_ID_REGEX = /\s\^([A-Za-z0-9_-]+)\s*$/;
const TASK_REGEX = /^(\s*)-\s+(\[([ xX])\])\s*(.*)$/;

export interface WikilinkParts {
    /** File target without alias/fragment; may be empty for same-note fragments. */
    rawTarget: string;
    fragment: string | undefined;
    isBlockFragment: boolean;
    /** Display alias after `|`, if any. */
    alias: string | undefined;
}

export function parseWikilinkInner(inner: string): WikilinkParts {
    let body = inner.trim();
    let alias: string | undefined;
    const pipe = body.indexOf('|');
    if (pipe >= 0) {
        alias = body.substring(pipe + 1).trim() || undefined;
        body = body.substring(0, pipe).trim();
    }
    let fragment: string | undefined;
    let isBlockFragment = false;
    const hash = body.indexOf('#');
    if (hash >= 0) {
        const frag = body.substring(hash + 1).trim();
        body = body.substring(0, hash).trim();
        if (frag.startsWith('^')) {
            isBlockFragment = true;
            fragment = frag.substring(1).trim() || undefined;
        } else {
            fragment = frag || undefined;
        }
    }
    let rawTarget = body;
    if (rawTarget.toLowerCase().endsWith('.md')) {
        rawTarget = rawTarget.substring(0, rawTarget.length - 3);
    }
    return { rawTarget, fragment, isBlockFragment, alias };
}

/** @deprecated Prefer parseWikilinkInner; kept for call sites that only need the file target. */
export function normalizeWikilinkTarget(raw: string): string {
    return parseWikilinkInner(raw).rawTarget;
}

export function slugifyHeading(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s+/g, '-');
}

export function headingsMatch(a: string, b: string): boolean {
    const left = a.trim();
    const right = b.trim();
    if (!left || !right) {
        return false;
    }
    if (left.toLowerCase() === right.toLowerCase()) {
        return true;
    }
    return slugifyHeading(left) === slugifyHeading(right);
}

/**
 * Minimal frontmatter parser for `title`, `aliases`, and `tags`.
 * Tolerates simple YAML list and inline `[a, b]` forms. Malformed input returns
 * whatever keys were successfully read (never throws).
 */
export function parseFrontmatter(text: string): ParsedFrontmatter | undefined {
    if (!text.startsWith('---')) {
        return undefined;
    }
    const lines = text.split(/\r?\n/);
    if (lines[0].trim() !== '---') {
        return undefined;
    }
    let endLine = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            endLine = i;
            break;
        }
    }
    if (endLine < 0) {
        return undefined;
    }
    const raw = lines.slice(1, endLine).join('\n');
    const result: ParsedFrontmatter = { raw, endLine, aliases: [], tags: [] };
    const bodyLines = lines.slice(1, endLine);
    let i = 0;
    while (i < bodyLines.length) {
        const line = bodyLines[i];
        const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!kv) {
            i++;
            continue;
        }
        const key = kv[1].toLowerCase();
        let value = kv[2].trim();
        if (value === '' || value === '|' || value === '>') {
            const items: string[] = [];
            i++;
            while (i < bodyLines.length) {
                const listItem = bodyLines[i].match(/^\s*-\s+(.+)$/);
                if (!listItem) {
                    break;
                }
                items.push(stripQuotes(listItem[1].trim()));
                i++;
            }
            assignFrontmatterList(result, key, items);
            continue;
        }
        if (value.startsWith('[') && value.endsWith(']')) {
            const items = value
                .substring(1, value.length - 1)
                .split(',')
                .map(part => stripQuotes(part.trim()))
                .filter(Boolean);
            assignFrontmatterList(result, key, items);
            i++;
            continue;
        }
        if (key === 'title') {
            result.title = stripQuotes(value);
        } else if (key === 'aliases' || key === 'alias') {
            result.aliases = value.split(/[,\s]+/).map(stripQuotes).filter(Boolean);
        } else if (key === 'tags' || key === 'tag') {
            result.tags = value.split(/[,\s]+/).map(t => t.replace(/^#/, '')).map(stripQuotes).filter(Boolean);
        }
        i++;
    }
    return result;
}

function assignFrontmatterList(result: ParsedFrontmatter, key: string, items: string[]): void {
    if (key === 'aliases' || key === 'alias') {
        result.aliases = items;
    } else if (key === 'tags' || key === 'tag') {
        result.tags = items.map(t => t.replace(/^#/, ''));
    } else if (key === 'title' && items.length === 1) {
        result.title = items[0];
    }
}

function stripQuotes(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.substring(1, value.length - 1);
    }
    return value;
}

export function splitMarkdownHref(rawHref: string): { path: string; fragment?: string } {
    const href = rawHref.trim();
    const hash = href.indexOf('#');
    if (hash < 0) {
        return { path: href };
    }
    return {
        path: href.substring(0, hash),
        fragment: href.substring(hash + 1) || undefined,
    };
}

/** True for http(s), mailto, data, and other scheme-based destinations. */
export function isExternalMarkdownHref(href: string): boolean {
    const path = splitMarkdownHref(href).path.trim();
    if (!path) {
        return false; // pure fragment
    }
    return /^[a-z][a-z0-9+.-]*:/i.test(path);
}

export function parseMarkdownLinksInLine(lineText: string, line: number): ParsedMdLink[] {
    const result: ParsedMdLink[] = [];
    MD_LINK_REGEX.lastIndex = 0;
    for (const match of lineText.matchAll(MD_LINK_REGEX)) {
        const isImage = match[1] === '!';
        const label = match[2] ?? '';
        const rawHref = (match[4] ?? match[5] ?? '').trim();
        if (!rawHref) {
            continue;
        }
        const { path, fragment } = splitMarkdownHref(rawHref);
        const full = match[0];
        const startCol = match.index!;
        // href starts after "](" or "](<"
        const openParen = full.lastIndexOf('(');
        const hrefLocalStart = openParen + 1 + (full[openParen + 1] === '<' ? 1 : 0);
        const hrefStartCol = startCol + hrefLocalStart;
        const hrefEndCol = hrefStartCol + rawHref.length;
        result.push({
            label,
            href: rawHref,
            path,
            fragment,
            isImage,
            line,
            startCol,
            endCol: startCol + full.length,
            hrefStartCol,
            hrefEndCol,
            lineText,
        });
    }
    return result;
}

export function parseNote(text: string): ParsedNote {
    const links: ParsedLink[] = [];
    const mdLinks: ParsedMdLink[] = [];
    const tags: ParsedTag[] = [];
    const blocks: ParsedBlock[] = [];
    const headings: ParsedHeading[] = [];
    const tasks: ParsedTask[] = [];
    const frontmatter = parseFrontmatter(text);
    if (frontmatter) {
        for (const tag of frontmatter.tags) {
            tags.push({ tag, line: 0, startCol: 0, fromFrontmatter: true });
        }
    }

    const lines = text.split(/\r?\n/);
    let inFence = false;
    const startLine = frontmatter ? frontmatter.endLine + 1 : 0;
    for (let line = 0; line < lines.length; line++) {
        const lineText = lines[line];
        if (FENCE_REGEX.test(lineText)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }
        // Skip pure frontmatter region for tags/headings/blocks (links rarely appear there)
        if (frontmatter && line > 0 && line < frontmatter.endLine) {
            continue;
        }
        if (line >= startLine || !frontmatter) {
            const taskMatch = lineText.match(TASK_REGEX);
            if (taskMatch) {
                const checkboxStartCol = taskMatch[1].length + 2;
                tasks.push({
                    line,
                    checkboxStartCol,
                    checkboxEndCol: checkboxStartCol + taskMatch[2].length,
                    text: taskMatch[4],
                    indentation: taskMatch[1].length,
                    completed: taskMatch[3].toLowerCase() === 'x'
                });
            }
            const headingMatch = lineText.match(HEADING_REGEX);
            if (headingMatch) {
                const textPart = headingMatch[2].trim();
                headings.push({
                    level: headingMatch[1].length,
                    text: textPart,
                    slug: slugifyHeading(textPart),
                    line
                });
            }
            const blockMatch = lineText.match(BLOCK_ID_REGEX);
            if (blockMatch) {
                blocks.push({
                    id: blockMatch[1],
                    line,
                    startCol: blockMatch.index! + 1,
                    lineText
                });
            }
        }
        for (const match of lineText.matchAll(WIKILINK_REGEX)) {
            const isEmbed = match[1] === '!';
            const innerText = match[2];
            const parts = parseWikilinkInner(innerText);
            // Skip completely empty targets (e.g. `[[|alias]]`)
            if (!parts.rawTarget && !parts.fragment) {
                continue;
            }
            links.push({
                rawTarget: parts.rawTarget,
                fragment: parts.fragment,
                isBlockFragment: parts.isBlockFragment,
                isEmbed,
                innerText,
                line,
                startCol: match.index!,
                endCol: match.index! + match[0].length,
                lineText
            });
        }
        for (const md of parseMarkdownLinksInLine(lineText, line)) {
            mdLinks.push(md);
        }
        // Inline tags only outside frontmatter
        if (frontmatter && line <= frontmatter.endLine) {
            continue;
        }
        for (const match of lineText.matchAll(TAG_REGEX)) {
            const tag = match[2];
            if (/^\d+$/.test(tag)) {
                continue; // likely an issue reference like #123
            }
            tags.push({
                tag,
                line,
                startCol: match.index! + match[1].length
            });
        }
    }
    return { links, mdLinks, tags, blocks, headings, tasks, frontmatter };
}

/**
 * Extract the body of a note for a heading section (from heading line until next
 * same-or-higher level heading) or a single block line.
 */
export function extractFragmentContent(text: string, fragment: string | undefined, isBlock: boolean): string | undefined {
    if (!fragment) {
        return stripFrontmatterBody(text);
    }
    const parsed = parseNote(text);
    if (isBlock) {
        const block = parsed.blocks.find(b => b.id.toLowerCase() === fragment.toLowerCase());
        if (!block) {
            return undefined;
        }
        return block.lineText.replace(BLOCK_ID_REGEX, '').trimEnd();
    }
    const heading = parsed.headings.find(h => headingsMatch(h.text, fragment) || h.slug === slugifyHeading(fragment));
    if (!heading) {
        return undefined;
    }
    const lines = text.split(/\r?\n/);
    const collected: string[] = [lines[heading.line]];
    for (let i = heading.line + 1; i < lines.length; i++) {
        const next = lines[i].match(HEADING_REGEX);
        if (next && next[1].length <= heading.level) {
            break;
        }
        collected.push(lines[i]);
    }
    return collected.join('\n');
}

export function stripFrontmatterBody(text: string): string {
    const fm = parseFrontmatter(text);
    if (!fm) {
        return text;
    }
    const lines = text.split(/\r?\n/);
    return lines.slice(fm.endLine + 1).join('\n').replace(/^\s*\n/, '');
}

/**
 * Rewrite wikilink file targets in `text` that resolve to `oldNames` (lowercased
 * stems or path keys) so they use `newTarget` as the file portion.
 * Fragments and aliases are preserved.
 */
export function rewriteWikilinkTargets(text: string, oldNames: Set<string>, newTarget: string): string {
    if (oldNames.size === 0) {
        return text;
    }
    return text.replace(WIKILINK_REGEX, (full, bang: string, inner: string) => {
        const parts = parseWikilinkInner(inner);
        const key = parts.rawTarget.trim().toLowerCase().replace(/\.md$/, '');
        if (!key || !targetKeyMatches(key, oldNames)) {
            return full;
        }
        let rebuilt = newTarget;
        if (parts.fragment) {
            rebuilt += parts.isBlockFragment ? `#^${parts.fragment}` : `#${parts.fragment}`;
        }
        // Preserve display alias from original inner text
        const pipe = inner.indexOf('|');
        if (pipe >= 0) {
            rebuilt += '|' + inner.substring(pipe + 1);
        }
        return `${bang}[[${rebuilt}]]`;
    });
}

function targetKeyMatches(key: string, oldNames: Set<string>): boolean {
    if (!key) {
        return false;
    }
    if (oldNames.has(key)) {
        return true;
    }
    for (const old of oldNames) {
        if (old.includes('/') && (key === old || key.endsWith('/' + old) || key.endsWith(old))) {
            return true;
        }
        // basename match for paths like ./foo.md vs foo
        if (!old.includes('/') && (key === old || key.endsWith('/' + old))) {
            return true;
        }
    }
    return false;
}

/**
 * Rewrite ordinary markdown link destinations that point at the renamed note.
 * `matchHref` receives the path portion (no fragment) and returns the new path
 * to write, or undefined to leave the link alone. Fragments and titles are preserved.
 */
export function rewriteMarkdownLinkTargets(
    text: string,
    matchHref: (path: string, fullHref: string) => string | undefined,
): string {
    return text.replace(MD_LINK_REGEX, (full, bang: string, label: string, _g3: string, angle: string, bare: string) => {
        const rawHref = (angle ?? bare ?? '').trim();
        if (!rawHref || isExternalMarkdownHref(rawHref)) {
            return full;
        }
        const { path, fragment } = splitMarkdownHref(rawHref);
        const nextPath = matchHref(path, rawHref);
        if (nextPath === undefined) {
            return full;
        }
        let nextHref = nextPath;
        if (fragment !== undefined) {
            nextHref += `#${fragment}`;
        }
        return rebuildMdLink(full, bang, label, rawHref, nextHref, !!angle);
    });
}

/** Rebuild `[label](href…)` while preserving an optional title after the destination. */
function rebuildMdLink(
    full: string,
    bang: string,
    label: string,
    oldHref: string,
    newHref: string,
    usedAngle: boolean,
): string {
    const openIdx = full.indexOf('(');
    const closeIdx = full.lastIndexOf(')');
    if (openIdx < 0 || closeIdx < 0) {
        return full;
    }
    const inside = full.substring(openIdx + 1, closeIdx);
    let titlePart = '';
    if (usedAngle) {
        const rest = inside.substring(oldHref.length + 2).trimStart();
        if (rest) {
            titlePart = ' ' + rest;
        }
    } else {
        const rest = inside.substring(oldHref.length).trimStart();
        if (rest) {
            titlePart = ' ' + rest;
        }
    }
    const hrefOut = usedAngle ? `<${newHref}>` : newHref;
    return `${bang}[${label}](${hrefOut}${titlePart})`;
}

/**
 * Update heading fragments in wikilinks and markdown links when a heading is renamed.
 * - Same-note: `#old` / `[[#old]]`
 * - Cross-note: path/name must match `noteKeys` (lowercased stems/paths), or path empty for `#…`
 */
export function rewriteHeadingReferences(
    text: string,
    noteKeys: Set<string>,
    oldHeading: string,
    newHeading: string,
): string {
    const oldSlug = slugifyHeading(oldHeading);
    const newSlug = slugifyHeading(newHeading);
    if (!oldSlug) {
        return text;
    }

    const fragmentMatches = (frag: string | undefined): boolean => {
        if (!frag || frag.startsWith('^')) {
            return false;
        }
        return headingsMatch(frag, oldHeading) || slugifyHeading(frag) === oldSlug;
    };

    let next = text.replace(WIKILINK_REGEX, (full, bang: string, inner: string) => {
        const parts = parseWikilinkInner(inner);
        if (!fragmentMatches(parts.fragment) || parts.isBlockFragment) {
            return full;
        }
        const key = parts.rawTarget.trim().toLowerCase().replace(/\.md$/, '');
        // same-note fragment (empty target) always; else note key must match
        if (key && !targetKeyMatches(key, noteKeys)) {
            return full;
        }
        const filePart = parts.rawTarget;
        let rebuilt = filePart;
        rebuilt += `#${newHeading}`;
        const pipe = inner.indexOf('|');
        if (pipe >= 0) {
            rebuilt += '|' + inner.substring(pipe + 1);
        }
        return `${bang}[[${rebuilt}]]`;
    });

    next = next.replace(MD_LINK_REGEX, (full, bang: string, label: string, _g3: string, angle: string, bare: string) => {
        const rawHref = (angle ?? bare ?? '').trim();
        if (!rawHref || isExternalMarkdownHref(rawHref)) {
            return full;
        }
        const { path, fragment } = splitMarkdownHref(rawHref);
        if (!fragmentMatches(fragment)) {
            return full;
        }
        const key = path.trim().toLowerCase().replace(/^\.\//, '').replace(/\.md$/, '');
        if (path && !targetKeyMatches(key, noteKeys)) {
            // Also allow path that is only a basename match via targetKeyMatches
            return full;
        }
        const nextHref = `${path}#${newSlug}`;
        return rebuildMdLink(full, bang, label, rawHref, nextHref, !!angle);
    });

    return next;
}

/**
 * Replace the heading text on a specific 0-based line. Preserves ATX level and
 * optional trailing `#` closing sequence.
 */
export function replaceHeadingTextOnLine(text: string, line: number, newHeadingText: string): string {
    const lines = text.split(/\r?\n/);
    if (line < 0 || line >= lines.length) {
        return text;
    }
    const match = lines[line].match(HEADING_REGEX);
    if (!match) {
        return text;
    }
    const level = match[1];
    const trailing = lines[line].endsWith('#') && /\s+#+\s*$/.test(lines[line])
        ? lines[line].match(/(\s+#+\s*)$/)?.[1] ?? ''
        : '';
    lines[line] = `${level} ${newHeadingText.trim()}${trailing}`;
    // Preserve original line ending style loosely via join \n (Monaco normalizes).
    return lines.join('\n');
}
