/**
 * Pure GFM pipe-table helpers for Monaco raw markdown editing.
 * Aligns columns with spaces the way common markdown formatters do.
 */

export interface MarkdownTable {
    /** 0-based inclusive line range in the document. */
    startLine: number;
    endLine: number;
    /** Leading whitespace shared by table lines (from first line). */
    indent: string;
    /** Row cells (already trimmed). Header is rows[0]; separator is not in rows. */
    rows: string[][];
    /** Alignment per column from separator: left | center | right. */
    alignments: Array<'left' | 'center' | 'right'>;
}

const TABLE_LINE = /^\s*\|.*\|\s*$/;

export function isTableLine(line: string): boolean {
    return TABLE_LINE.test(line) || isSeparatorLine(line);
}

export function isSeparatorLine(line: string): boolean {
    if (!line.includes('|') || !line.includes('-')) {
        return false;
    }
    // Strip outer pipes and require each cell to look like --- / :--- / ---: / :---:
    const cells = splitRow(line);
    if (cells.length === 0) {
        return false;
    }
    return cells.every(c => /^:?-+:?$/.test(c.replace(/\s+/g, '')));
}

/** Split a table row into cell strings (trimmed). Handles optional outer pipes. */
export function splitRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith('|')) {
        s = s.slice(1);
    }
    if (s.endsWith('|')) {
        s = s.slice(0, -1);
    }
    // Don't treat empty line as one empty cell for non-table content
    if (s.length === 0 && !line.includes('|')) {
        return [];
    }
    return s.split('|').map(c => c.trim());
}

function parseAlignments(separatorLine: string, columnCount: number): Array<'left' | 'center' | 'right'> {
    const cells = splitRow(separatorLine);
    const aligns: Array<'left' | 'center' | 'right'> = [];
    for (let i = 0; i < columnCount; i++) {
        const raw = (cells[i] ?? '---').replace(/\s+/g, '');
        const left = raw.startsWith(':');
        const right = raw.endsWith(':');
        if (left && right) {
            aligns.push('center');
        } else if (right) {
            aligns.push('right');
        } else {
            aligns.push('left');
        }
    }
    return aligns;
}

/**
 * Find the pipe table containing `line` (0-based), or undefined.
 */
export function findTableAtLine(lines: readonly string[], line: number): MarkdownTable | undefined {
    if (line < 0 || line >= lines.length || !isTableLine(lines[line])) {
        return undefined;
    }
    let start = line;
    while (start > 0 && isTableLine(lines[start - 1])) {
        start--;
    }
    let end = line;
    while (end + 1 < lines.length && isTableLine(lines[end + 1])) {
        end++;
    }

    const block = lines.slice(start, end + 1);
    if (block.length < 2) {
        return undefined;
    }

    // Find separator row (usually second line)
    let sepIndex = -1;
    for (let i = 0; i < block.length; i++) {
        if (isSeparatorLine(block[i])) {
            sepIndex = i;
            break;
        }
    }
    if (sepIndex < 0) {
        // Treat first row as header and synthesize default separator
        sepIndex = 1;
    }

    const indentMatch = block[0].match(/^(\s*)/);
    const indent = indentMatch?.[1] ?? '';

    const dataRows: string[][] = [];
    for (let i = 0; i < block.length; i++) {
        if (i === sepIndex || isSeparatorLine(block[i])) {
            continue;
        }
        dataRows.push(splitRow(block[i]));
    }
    if (dataRows.length === 0) {
        return undefined;
    }

    const columnCount = Math.max(...dataRows.map(r => r.length), 1);
    const normalized = dataRows.map(r => {
        const copy = r.slice();
        while (copy.length < columnCount) {
            copy.push('');
        }
        return copy.slice(0, columnCount);
    });

    const sepLine = block[Math.min(sepIndex, block.length - 1)];
    const alignments = isSeparatorLine(sepLine)
        ? parseAlignments(sepLine, columnCount)
        : Array(columnCount).fill('left') as Array<'left' | 'center' | 'right'>;

    return {
        startLine: start,
        endLine: end,
        indent,
        rows: normalized,
        alignments,
    };
}

function padCell(text: string, width: number, align: 'left' | 'center' | 'right'): string {
    const t = text ?? '';
    const pad = Math.max(0, width - t.length);
    if (align === 'right') {
        return ' '.repeat(pad) + t;
    }
    if (align === 'center') {
        const left = Math.floor(pad / 2);
        const right = pad - left;
        return ' '.repeat(left) + t + ' '.repeat(right);
    }
    return t + ' '.repeat(pad);
}

function separatorCell(width: number, align: 'left' | 'center' | 'right'): string {
    const w = Math.max(3, width);
    if (align === 'center') {
        return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
    }
    if (align === 'right') {
        return '-'.repeat(Math.max(1, w - 1)) + ':';
    }
    // left: :--- style optional; plain --- is fine and matches screenshots
    return '-'.repeat(w);
}

/**
 * Format a table to aligned pipes (screenshot-style column padding).
 */
export function formatMarkdownTable(table: MarkdownTable): string {
    const cols = table.rows[0]?.length ?? 0;
    if (cols === 0) {
        return '';
    }
    const widths: number[] = [];
    for (let c = 0; c < cols; c++) {
        let w = 3;
        for (const row of table.rows) {
            w = Math.max(w, (row[c] ?? '').length);
        }
        // Separator needs at least 3 dashes (alignment colons fit inside pad)
        widths.push(Math.max(3, w));
    }

    const lines: string[] = [];
    const formatRow = (cells: string[]): string => {
        const parts = cells.map((cell, i) => {
            const align = table.alignments[i] ?? 'left';
            return ' ' + padCell(cell, widths[i], align) + ' ';
        });
        return table.indent + '|' + parts.join('|') + '|';
    };

    // Header
    lines.push(formatRow(table.rows[0]));
    // Separator
    const sepParts = table.alignments.map((align, i) => {
        const cell = separatorCell(widths[i], align);
        // Pad separator cell content to width for visual consistency with screenshots
        const inner = cell.length < widths[i] ? cell + '-'.repeat(widths[i] - cell.length) : cell;
        // Re-apply alignment colons after pad for left/right if needed
        let fixed = inner;
        if (align === 'left' && !fixed.startsWith(':')) {
            // keep plain dashes
        } else if (align === 'right') {
            fixed = '-'.repeat(Math.max(1, widths[i] - 1)) + ':';
        } else if (align === 'center') {
            fixed = ':' + '-'.repeat(Math.max(1, widths[i] - 2)) + ':';
        } else {
            fixed = '-'.repeat(widths[i]);
        }
        return ' ' + fixed + ' ';
    });
    lines.push(table.indent + '|' + sepParts.join('|') + '|');

    for (let r = 1; r < table.rows.length; r++) {
        lines.push(formatRow(table.rows[r]));
    }
    return lines.join('\n');
}

export function createEmptyTable(rows: number, cols: number, indent = ''): string {
    const r = Math.max(1, rows);
    const c = Math.max(1, cols);
    const header = Array.from({ length: c }, (_, i) => `Header ${i + 1}`);
    const empty = Array.from({ length: c }, () => '');
    const body = Array.from({ length: Math.max(0, r - 1) }, () => empty.slice());
    const table: MarkdownTable = {
        startLine: 0,
        endLine: 0,
        indent,
        rows: [header, ...body],
        alignments: Array(c).fill('left'),
    };
    return formatMarkdownTable(table);
}

export function insertRow(table: MarkdownTable, atRow: number): MarkdownTable {
    const cols = table.rows[0]?.length ?? 0;
    const empty = Array.from({ length: cols }, () => '');
    const rows = table.rows.slice();
    const idx = Math.max(1, Math.min(atRow, rows.length)); // keep header at 0
    rows.splice(idx, 0, empty);
    return { ...table, rows };
}

export function insertColumn(table: MarkdownTable, atCol: number): MarkdownTable {
    const cols = table.rows[0]?.length ?? 0;
    const idx = Math.max(0, Math.min(atCol, cols));
    const rows = table.rows.map((row, r) => {
        const copy = row.slice();
        copy.splice(idx, 0, r === 0 ? `Header ${cols + 1}` : '');
        return copy;
    });
    const alignments = table.alignments.slice();
    alignments.splice(idx, 0, 'left');
    return { ...table, rows, alignments };
}

export function removeRow(table: MarkdownTable, rowIndex: number): MarkdownTable | undefined {
    if (table.rows.length <= 1) {
        return undefined; // keep at least header
    }
    if (rowIndex <= 0) {
        return undefined; // don't remove header via this
    }
    if (rowIndex >= table.rows.length) {
        return undefined;
    }
    const rows = table.rows.slice();
    rows.splice(rowIndex, 1);
    return { ...table, rows };
}

export function removeColumn(table: MarkdownTable, colIndex: number): MarkdownTable | undefined {
    const cols = table.rows[0]?.length ?? 0;
    if (cols <= 1 || colIndex < 0 || colIndex >= cols) {
        return undefined;
    }
    const rows = table.rows.map(row => {
        const copy = row.slice();
        copy.splice(colIndex, 1);
        return copy;
    });
    const alignments = table.alignments.slice();
    alignments.splice(colIndex, 1);
    return { ...table, rows, alignments };
}

/**
 * Map a column index within a formatted line to a character range (1-based columns for Monaco).
 * Returns the content range inside the cell (excluding padding spaces ideally — we select full cell text region).
 */
export function cellRangeInLine(
    formattedLine: string,
    cellIndex: number,
): { startCol: number; endCol: number } | undefined {
    // Walk pipes: positions of | delimiters
    const pipePositions: number[] = [];
    for (let i = 0; i < formattedLine.length; i++) {
        if (formattedLine[i] === '|') {
            pipePositions.push(i);
        }
    }
    if (pipePositions.length < 2) {
        return undefined;
    }
    // cells are between consecutive pipes
    if (cellIndex < 0 || cellIndex >= pipePositions.length - 1) {
        return undefined;
    }
    const left = pipePositions[cellIndex];
    const right = pipePositions[cellIndex + 1];
    // 1-based: content after left | and space
    let start = left + 2; // skip "| "
    let end = right; // exclusive in monaco is column at right |
    // trim selection to non-space content if present
    while (start < end && formattedLine[start - 1] === ' ') {
        start++;
    }
    while (end > start && formattedLine[end - 2] === ' ') {
        end--;
    }
    if (start >= end) {
        // empty cell — place cursor after "| "
        start = left + 2;
        end = start;
    }
    return { startCol: start, endCol: end };
}

/**
 * Given cursor column (1-based) on a table line, which cell index are we in?
 */
export function cellIndexAtColumn(line: string, column1Based: number): number {
    const col0 = column1Based - 1;
    const pipePositions: number[] = [];
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '|') {
            pipePositions.push(i);
        }
    }
    if (pipePositions.length < 2) {
        return 0;
    }
    for (let i = 0; i < pipePositions.length - 1; i++) {
        if (col0 >= pipePositions[i] && col0 < pipePositions[i + 1]) {
            return i;
        }
    }
    return Math.max(0, pipePositions.length - 2);
}

/**
 * Data-row index (0 = header) for a document line inside the table.
 * Returns -1 for separator line.
 */
export function dataRowIndexForLine(table: MarkdownTable, line: number, lines: readonly string[]): number {
    if (line < table.startLine || line > table.endLine) {
        return -1;
    }
    if (isSeparatorLine(lines[line])) {
        return -1;
    }
    let dataIndex = 0;
    for (let L = table.startLine; L <= table.endLine; L++) {
        if (isSeparatorLine(lines[L])) {
            continue;
        }
        if (L === line) {
            return dataIndex;
        }
        dataIndex++;
    }
    return -1;
}
