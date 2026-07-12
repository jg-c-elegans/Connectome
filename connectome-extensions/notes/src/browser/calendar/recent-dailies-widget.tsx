import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon, OpenerService, open } from '@theia/core/lib/browser';
import { CalendarService } from './calendar-service';

@injectable()
export class RecentDailiesWidget extends ReactWidget {

    static readonly ID = 'connectome-calendar-recent-dailies';
    static readonly LABEL = 'Recent Daily Notes';

    @inject(CalendarService)
    protected readonly calendar: CalendarService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @postConstruct()
    protected init(): void {
        this.id = RecentDailiesWidget.ID;
        this.title.label = RecentDailiesWidget.LABEL;
        this.title.caption = 'Daily notes (YYYY-MM-DD)';
        this.title.iconClass = codicon('note');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.calendar.onDidChange(() => this.update()));
        void this.calendar.ensureIndex().then(() => this.update());
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        void this.calendar.ensureIndex().then(() => this.update());
    }

    protected render(): React.ReactNode {
        const dailies = this.calendar.listDailyNotes().slice(0, 40);
        if (dailies.length === 0) {
            return <div className='connectome-notes-empty'>
                No daily notes yet.<br />
                Click a day on the calendar or use Open Today.
            </div>;
        }
        return <div className='connectome-notes-list'>
            {dailies.map(uri =>
                <div className='connectome-notes-occurrence' key={uri.toString()}
                    title={uri.path.toString()}
                    onClick={() => void open(this.openerService, uri)}>
                    <span className={codicon('calendar') + ' connectome-notes-icon'} />
                    <span className='connectome-notes-group-name'>{uri.path.name}</span>
                </div>
            )}
        </div>;
    }
}
