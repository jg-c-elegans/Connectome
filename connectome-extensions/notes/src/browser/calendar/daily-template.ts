/**
 * Pure daily-note template substitution (no DI).
 */

import { DEFAULT_DAILY_TEMPLATE } from '../notes-preferences';

export interface DailyTemplateContext {
    /** YYYY-MM-DD stem for the note. */
    dateKey: string;
    clipboard?: string;
    /** Optional Date for weekday; if omitted, parsed from dateKey when possible. */
    date?: Date;
}

const WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/**
 * Expand known `{{token}}` placeholders. Unknown tokens are left unchanged.
 * Empty/whitespace template falls back to the product default (`# {{date}}`).
 */
export function renderDailyTemplate(template: string, ctx: DailyTemplateContext): string {
    const source = (template ?? '').trim().length > 0 ? template : DEFAULT_DAILY_TEMPLATE;
    const date = ctx.date ?? parseDateKey(ctx.dateKey);
    const year = ctx.dateKey.slice(0, 4);
    const month = ctx.dateKey.slice(5, 7);
    const day = ctx.dateKey.slice(8, 10);
    const weekday = date ? WEEKDAYS[date.getDay()] : '';
    const clipboard = ctx.clipboard ?? '';

    const values: Record<string, string> = {
        date: ctx.dateKey,
        title: ctx.dateKey,
        clipboard,
        year,
        month,
        day,
        weekday,
    };

    let body = source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, name: string) => {
        if (Object.prototype.hasOwnProperty.call(values, name)) {
            return values[name];
        }
        return full;
    });

    body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!body.endsWith('\n')) {
        body += '\n';
    }
    return body;
}

function parseDateKey(key: string): Date | undefined {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) {
        return undefined;
    }
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
        return undefined;
    }
    return date;
}
