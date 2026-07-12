/**
 * Table-of-contents helpers for markdown notes.
 * Pure text — no DI. Uses parseNote headings + GitHub-ish unique slugs.
 */

import { ParsedHeading, parseNote } from './note-parser';

/** Markers so Insert/Update can find and replace an existing TOC block. */
export const TOC_START_MARKER = '<!-- connectome-toc-start -->';
export const TOC_END_MARKER = '<!-- connectome-toc-end -->';

export interface TocRegion {
    /** Inclusive start offset in full document text. */
    startOffset: number;
    /** Exclusive end offset (past end marker). */
    endOffset: number;
    /** 0-based first line of the region. */
    startLine: number;
    /** 0-based last line of the region (inclusive). */
    endLine: number;
}

export interface TocHeading {
    level: number;
    text: string;
    /** Unique anchor slug for this document. */
    slug: string;
    line: number;
}

/**
 * Locate an existing Connectome TOC block. Returns undefined if markers missing
 * or end marker not found after start.
 */
export function findTocRegion(text: string): TocRegion | undefined {
    const startOffset = text.indexOf(TOC_START_MARKER);
    if (startOffset < 0) {
        return undefined;
    }
    const endMarkerAt = text.indexOf(TOC_END_MARKER, startOffset + TOC_START_MARKER.length);
    if (endMarkerAt < 0) {
        return undefined;
    }
    const endOffset = endMarkerAt + TOC_END_MARKER.length;
    return {
        startOffset,
        endOffset,
        startLine: offsetToLine(text, startOffset),
        endLine: offsetToLine(text, endOffset - 1),
    };
}

export function offsetToLine(text: string, offset: number): number {
    let line = 0;
    const limit = Math.min(offset, text.length);
    for (let i = 0; i < limit; i++) {
        if (text.charCodeAt(i) === 10 /* \n */) {
            line++;
        }
    }
    return line;
}

/**
 * Assign unique slugs (GitHub-style: bare, then `-1`, `-2`, …).
 */
export function withUniqueSlugs(headings: readonly ParsedHeading[]): TocHeading[] {
    const seen = new Map<string, number>();
    return headings.map(h => {
        const base = h.slug || 'section';
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const slug = count === 0 ? base : `${base}-${count}`;
        return {
            level: h.level,
            text: h.text,
            slug,
            line: h.line,
        };
    });
}

/**
 * Build TOC list body (without markers) from headings.
 * Indentation is relative to the shallowest heading level present.
 */
export function buildTocList(headings: readonly TocHeading[]): string {
    if (headings.length === 0) {
        return '_No headings found._';
    }
    const minLevel = Math.min(...headings.map(h => h.level));
    const lines: string[] = [];
    for (const h of headings) {
        const depth = Math.max(0, h.level - minLevel);
        const indent = '  '.repeat(depth);
        const label = escapeLinkText(h.text);
        lines.push(`${indent}- [${label}](#${h.slug})`);
    }
    return lines.join('\n');
}

/**
 * Full TOC block including markers, trailing newline for clean insert.
 */
export function buildTocBlock(headings: readonly TocHeading[]): string {
    const list = buildTocList(headings);
    return `${TOC_START_MARKER}\n${list}\n${TOC_END_MARKER}\n`;
}

/**
 * Headings from the document that should appear in the TOC
 * (excludes headings that sit inside an existing TOC region).
 */
export function collectTocHeadings(text: string): TocHeading[] {
    const region = findTocRegion(text);
    const parsed = parseNote(text);
    const filtered = region
        ? parsed.headings.filter(h => h.line < region.startLine || h.line > region.endLine)
        : parsed.headings;
    return withUniqueSlugs(filtered.filter(h => h.text.trim().length > 0));
}

/** Escape markdown link label specials. */
export function escapeLinkText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
}

/**
 * Plan a range replace for insert-or-update.
 * - If a marked TOC exists, replace that region.
 * - Else insert a new block at `insertOffset` (UTF-16 code unit offset).
 */
export function planTocEdit(text: string, insertOffset: number): {
    /** Inclusive start offset of the range to replace (insert = start === end). */
    startOffset: number;
    /** Exclusive end offset of the range to replace. */
    endOffset: number;
    /** Full TOC block (markers + list), including trailing newline. */
    replacement: string;
} {
    const headings = collectTocHeadings(text);
    const block = buildTocBlock(headings);
    const region = findTocRegion(text);
    if (region) {
        return {
            startOffset: region.startOffset,
            endOffset: region.endOffset,
            replacement: block,
        };
    }
    const clamped = Math.max(0, Math.min(insertOffset, text.length));
    // Prefer inserting on its own line: if mid-line, start after the current line.
    let at = clamped;
    if (clamped > 0 && clamped < text.length) {
        const lineStart = text.lastIndexOf('\n', clamped - 1) + 1;
        if (clamped > lineStart && text[clamped] !== '\n') {
            const nextNl = text.indexOf('\n', clamped);
            at = nextNl < 0 ? text.length : nextNl + 1;
        }
    }
    // Ensure a leading newline when inserting mid-document without one.
    let prefix = '';
    if (at > 0 && text[at - 1] !== '\n') {
        prefix = '\n';
    }
    return {
        startOffset: at,
        endOffset: at,
        replacement: prefix + block,
    };
}
