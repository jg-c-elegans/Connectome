import * as React from '@theia/core/shared/react';
import { MantineProvider } from '@mantine/core';
import { Calendar } from '@mantine/dates';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';

export interface MiniCalendarProps {
    /** Date keys (`YYYY-MM-DD`) that already have a daily note. */
    existingKeys: Set<string>;
    formatDate: (date: Date) => string;
    /** Fired on left-click (select) or right-click (same action, per user request). */
    onSelectDate: (date: Date) => void;
}

/**
 * Mantine's Calendar scoped to just this card via its own MantineProvider — Mantine's CSS is
 * driven by `--mantine-*` custom properties, so we override the handful that matter (body/text/
 * primary color) to the app's existing Theia CSS variables rather than adopting Mantine's palette
 * wholesale. Keeps Mantine visually out of the rest of the app.
 *
 * `getRootElement` is required, not cosmetic: MantineProvider otherwise stamps
 * `data-mantine-color-scheme` on `document.documentElement`, and Mantine's base stylesheet uses
 * that attribute to theme `body`/generic elements — which bled dark, low-contrast text into the
 * *rest* of the dashboard (every card, not just the calendar) the first time this shipped.
 * Scoping the attribute to this component's own wrapper div keeps that leak contained.
 */
export function MiniCalendar(props: MiniCalendarProps): React.ReactElement {
    const { existingKeys, formatDate, onSelectDate } = props;
    const rootRef = React.useRef<HTMLDivElement>(null);

    return <div
        ref={rootRef}
        className='connectome-dashboard-window__mini-calendar'
        style={{
            // @ts-expect-error -- CSS custom properties aren't in React's CSSProperties type.
            '--mantine-color-body': 'var(--theia-editorWidget-background, var(--theia-editor-background))',
            '--mantine-color-text': 'var(--theia-foreground)',
            '--mantine-color-default-border': 'var(--theia-editorWidget-border, rgba(128,128,128,0.3))',
            '--mantine-color-default-hover': 'var(--theia-list-hoverBackground)',
            '--mantine-primary-color-filled': 'var(--theia-focusBorder, #3794ff)',
            '--mantine-primary-color-light': 'var(--theia-list-activeSelectionBackground, rgba(55,148,255,0.2))',
        }}
    >
        <MantineProvider defaultColorScheme='dark' getRootElement={() => rootRef.current ?? document.body}>
            <Calendar
                size='md'
                getDayProps={date => {
                    const key = formatDate(date);
                    const hasNote = existingKeys.has(key);
                    return {
                        onClick: () => onSelectDate(date),
                        onContextMenu: (event: React.MouseEvent) => {
                            event.preventDefault();
                            onSelectDate(date);
                        },
                        style: hasNote ? {
                            fontWeight: 700,
                            textDecoration: 'underline',
                            textUnderlineOffset: '3px'
                        } : undefined
                    };
                }}
            />
        </MantineProvider>
    </div>;
}
