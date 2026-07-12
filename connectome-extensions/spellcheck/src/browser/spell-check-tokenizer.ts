/**
 * Pure text-tokenizing helpers for spell-checking. No DI, no I/O — unit-testable.
 * Lines and columns are 0-based, matching LSP Diagnostic ranges.
 */
import * as monaco from '@theia/monaco-editor-core';

export interface SpellCheckToken {
    word: string;
    line: number;
    startCol: number;
    endCol: number;
}

const FENCE_REGEX = /^\s*(```|~~~)/;
const FRONTMATTER_DELIM = '---';

const WIKILINK_REGEX = /!?\[\[[^[\]\n]+?\]\]/g;
const INLINE_CODE_REGEX = /`[^`\n]*`/g;
const HTML_TAG_REGEX = /<\/?[A-Za-z][^<>\n]*>/g;
const BARE_URL_REGEX = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const MD_LINK_URL_REGEX = /(\[[^[\]\n]*\])\(([^()\n]*)\)/g;

const WORD_REGEX = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

function blankAll(text: string, regex: RegExp): string {
    return text.replace(regex, match => ' '.repeat(match.length));
}

/** Blanks only the `(url)` portion of `[text](url)`, keeping the display text checkable. */
function blankMarkdownLinkUrls(text: string): string {
    return text.replace(MD_LINK_URL_REGEX, (_full, bracket: string, url: string) => bracket + '(' + ' '.repeat(url.length) + ')');
}

/** Splits an already-isolated alphabetic run on camelCase/PascalCase boundaries. */
function splitCamelCase(raw: string): Array<{ text: string; offset: number }> {
    const re = /[A-Z]+(?![a-z])|[A-Z]?[a-z']+|[A-Z]+/g;
    const parts: Array<{ text: string; offset: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(raw)) !== null) {
        if (match[0].length > 0) {
            parts.push({ text: match[0], offset: match.index });
        }
    }
    return parts.length > 0 ? parts : [{ text: raw, offset: 0 }];
}

/** Heuristic for identifier-like fragments that shouldn't be treated as prose: short words and short acronyms. */
function isLikelySkippable(word: string): boolean {
    if (word.length <= 2) {
        return true;
    }
    if (word.length <= 5 && word === word.toUpperCase()) {
        return true;
    }
    return false;
}

function extractWords(text: string, line: number, colOffset: number): SpellCheckToken[] {
    const tokens: SpellCheckToken[] = [];
    WORD_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD_REGEX.exec(text)) !== null) {
        const raw = match[0];
        for (const part of splitCamelCase(raw)) {
            const word = part.text.replace(/'/g, '');
            if (!word || isLikelySkippable(word)) {
                continue;
            }
            const start = colOffset + match.index + part.offset;
            tokens.push({ word, line, startCol: start, endCol: start + part.text.length });
        }
    }
    return tokens;
}

/**
 * Tokenizes a markdown/plaintext document for spell-checking: drops YAML
 * frontmatter and fenced code blocks entirely, then blanks inline code
 * spans, HTML tags, bare URLs, link/wikilink target syntax (keeping link
 * display text checkable) before extracting words.
 */
export function tokenizeProse(text: string): SpellCheckToken[] {
    const lines = text.split(/\r?\n/);
    const tokens: SpellCheckToken[] = [];

    let bodyStart = 0;
    if (lines[0] !== undefined && lines[0].trim() === FRONTMATTER_DELIM) {
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === FRONTMATTER_DELIM) {
                bodyStart = i + 1;
                break;
            }
        }
    }

    let inFence = false;
    for (let line = bodyStart; line < lines.length; line++) {
        if (FENCE_REGEX.test(lines[line])) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }
        let lineText = lines[line];
        lineText = blankAll(lineText, INLINE_CODE_REGEX);
        lineText = blankAll(lineText, HTML_TAG_REGEX);
        lineText = blankAll(lineText, BARE_URL_REGEX);
        lineText = blankMarkdownLinkUrls(lineText);
        lineText = blankAll(lineText, WIKILINK_REGEX);
        tokens.push(...extractWords(lineText, line, 0));
    }
    return tokens;
}

const COMMENT_OR_STRING_TYPE = /comment|string/i;

/**
 * Tokenizes a code-editor model for spell-checking: only words inside
 * comment/string tokens are checked — identifiers and keywords are never
 * flagged. Uses `monaco.editor.tokenize`, the public per-line tokenization
 * API (Monarch scope strings like "comment.line.double-slash.ts"), rather
 * than `ITextModel.getLineTokens`/`StandardTokenType`, which are internal-only
 * and not part of the API surface Theia's `@theia/monaco-editor-core`
 * package actually ships.
 */
export function tokenizeCode(model: monaco.editor.ITextModel): SpellCheckToken[] {
    const tokens: SpellCheckToken[] = [];
    const languageId = model.getLanguageId();
    const lineCount = model.getLineCount();
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
        const lineText = model.getLineContent(lineNumber);
        const lineTokens = monaco.editor.tokenize(lineText, languageId)[0] ?? [];
        for (let i = 0; i < lineTokens.length; i++) {
            const token = lineTokens[i];
            if (!COMMENT_OR_STRING_TYPE.test(token.type)) {
                continue;
            }
            const end = i + 1 < lineTokens.length ? lineTokens[i + 1].offset : lineText.length;
            tokens.push(...extractWords(lineText.substring(token.offset, end), lineNumber - 1, token.offset));
        }
    }
    return tokens;
}
