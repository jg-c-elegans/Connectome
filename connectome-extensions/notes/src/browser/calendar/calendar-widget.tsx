import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { CalendarService } from './calendar-service';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

@injectable()
export class CalendarWidget extends ReactWidget {

    static readonly ID = 'connectome-calendar-month';
    static readonly LABEL = 'Calendar';

    @inject(CalendarService)
    protected readonly calendar: CalendarService;

    protected viewYear = new Date().getFullYear();
    protected viewMonth = new Date().getMonth(); // 0-based

    @postConstruct()
    protected init(): void {
        this.id = CalendarWidget.ID;
        this.title.label = CalendarWidget.LABEL;
        this.title.caption = 'Daily notes calendar';
        this.title.iconClass = codicon('calendar');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.addClass('connectome-calendar-widget');
        this.toDispose.push(this.calendar.onDidChange(() => this.update()));
        void this.calendar.ensureIndex().then(() => this.update());
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        void this.calendar.ensureIndex().then(() => this.update());
    }

    protected render(): React.ReactNode {
        const todayKey = this.calendar.formatDate(new Date());
        const existing = this.calendar.existingDailyKeys();
        const monthLabel = new Date(this.viewYear, this.viewMonth, 1)
            .toLocaleString(undefined, { month: 'long', year: 'numeric' });
        const cells = this.buildCells();

        return <div className='connectome-calendar'>
            <div className='connectome-calendar-header'>
                <button className='theia-button secondary connectome-calendar-nav'
                    title='Previous month'
                    onClick={() => this.shiftMonth(-1)}>
                    <span className={codicon('chevron-left')} />
                </button>
                <span className='connectome-calendar-month-label'>{monthLabel}</span>
                <button className='theia-button secondary connectome-calendar-nav'
                    title='Next month'
                    onClick={() => this.shiftMonth(1)}>
                    <span className={codicon('chevron-right')} />
                </button>
            </div>
            <div className='connectome-calendar-weekdays'>
                {WEEKDAYS.map(d => <span key={d} className='connectome-calendar-weekday'>{d}</span>)}
            </div>
            <div className='connectome-calendar-grid'>
                {cells.map((cell, i) => {
                    if (!cell) {
                        return <span key={`e-${i}`} className='connectome-calendar-cell empty' />;
                    }
                    const key = this.calendar.formatDate(cell);
                    const isToday = key === todayKey;
                    const hasNote = existing.has(key);
                    const classes = [
                        'connectome-calendar-cell',
                        isToday ? 'today' : '',
                        hasNote ? 'has-note' : ''
                    ].filter(Boolean).join(' ');
                    return <button
                        key={key}
                        type='button'
                        className={classes}
                        title={hasNote ? `Open ${key}` : `Create ${key}`}
                        onClick={() => void this.calendar.openOrCreate(cell)}>
                        {cell.getDate()}
                    </button>;
                })}
            </div>
        </div>;
    }

    protected shiftMonth(delta: number): void {
        const d = new Date(this.viewYear, this.viewMonth + delta, 1);
        this.viewYear = d.getFullYear();
        this.viewMonth = d.getMonth();
        this.update();
    }

    /** 6×7 grid: leading nulls, then Date objects for days in month. */
    protected buildCells(): (Date | null)[] {
        const first = new Date(this.viewYear, this.viewMonth, 1);
        const startPad = first.getDay();
        const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
        const cells: (Date | null)[] = [];
        for (let i = 0; i < startPad; i++) {
            cells.push(null);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            cells.push(new Date(this.viewYear, this.viewMonth, day));
        }
        while (cells.length % 7 !== 0) {
            cells.push(null);
        }
        return cells;
    }
}
