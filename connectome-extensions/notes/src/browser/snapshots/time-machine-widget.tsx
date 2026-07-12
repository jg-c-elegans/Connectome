import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TimeMachineService, SnapshotInfo } from './time-machine-service';
import { formatRelativeTime } from '../activity/note-mtime';

/**
 * Rail widget listing local Time Machine snapshots (newest first) with a
 * "restore" action per snapshot. Restore overwrites the live file directly -
 * there is no confirm dialog yet (see TimeMachineService.restoreSnapshot).
 */
@injectable()
export class TimeMachineWidget extends ReactWidget {

    static readonly ID = 'connectome-time-machine-widget';
    static readonly LABEL = 'Snapshots';

    @inject(TimeMachineService)
    protected readonly service: TimeMachineService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected items: SnapshotInfo[] = [];
    protected loading = true;

    @postConstruct()
    protected init(): void {
        this.id = TimeMachineWidget.ID;
        this.title.label = TimeMachineWidget.LABEL;
        this.title.caption = 'Local snapshot history';
        this.title.iconClass = codicon('vr');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.service.onDidChange(() => void this.refresh()));
        void this.refresh();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        void this.refresh();
    }

    async refresh(): Promise<void> {
        this.loading = true;
        this.update();
        try {
            this.items = await this.service.listAllSnapshots();
        } catch {
            this.items = [];
        } finally {
            this.loading = false;
            this.update();
        }
    }

    protected render(): React.ReactNode {
        if (this.loading && this.items.length === 0) {
            return <div className='connectome-notes-empty'>Loading…</div>;
        }
        if (this.items.length === 0) {
            return <div className='connectome-notes-empty'>
                No snapshots yet. Edited files are snapshotted automatically a few seconds after each change.
            </div>;
        }
        return <div className='connectome-notes-list'>
            {this.items.map(item => this.renderItem(item))}
        </div>;
    }

    protected renderItem(item: SnapshotInfo): React.ReactNode {
        return <div
            className='connectome-notes-occurrence'
            key={item.snapshotUri.toString()}
            title={`${item.relativePath} — ${new Date(item.timestamp).toLocaleString()}`}
        >
            <span className={codicon('file') + ' connectome-notes-icon'} />
            <span className='connectome-notes-group-name'>{item.relativePath}</span>
            <span className='connectome-notes-group-detail'>{formatRelativeTime(item.timestamp)}</span>
            <span
                className={codicon('discard') + ' connectome-notes-action'}
                title='Restore this snapshot (overwrites the current file)'
                onClick={e => {
                    e.stopPropagation();
                    void this.restore(item);
                }}
            />
        </div>;
    }

    protected async restore(item: SnapshotInfo): Promise<void> {
        // eslint-disable-next-line no-alert
        const confirmed = window.confirm(
            `Restore "${item.relativePath}" to the snapshot from ${new Date(item.timestamp).toLocaleString()}? ` +
            'This overwrites the current file content.'
        );
        if (!confirmed) {
            return;
        }
        await this.service.restoreSnapshot(item);
        const root = this.workspaceService.tryGetRoots()[0];
        if (root) {
            await this.editorManager.open(root.resource.resolve(item.relativePath));
        }
    }
}
