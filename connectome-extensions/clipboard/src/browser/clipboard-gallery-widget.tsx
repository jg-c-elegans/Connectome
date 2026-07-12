import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message, ReactWidget, codicon } from '@theia/core/lib/browser';
import { ClipboardService } from './clipboard-service';
import { ClipboardEntry } from '../common/clipboard-api';

type GalleryFilter = 'history' | 'saved';

@injectable()
export class ClipboardGalleryWidget extends ReactWidget {
    static readonly ID = 'connectome-clipboard-gallery';

    @inject(ClipboardService)
    protected readonly service: ClipboardService;

    protected filter: GalleryFilter = 'history';

    @postConstruct()
    protected init(): void {
        this.id = ClipboardGalleryWidget.ID;
        this.title.label = 'Clipboard';
        this.title.caption = 'Clipboard';
        this.title.iconClass = codicon('clippy');
        this.title.closable = true;
        this.addClass('connectome-clipboard-gallery');
        this.toDispose.push(this.service.onDidChange(() => this.update()));
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const status = this.service.getWatcherStatus();
        const items = this.filter === 'history' ? this.service.getHistory() : this.service.getSaved();

        return <div className='connectome-clipboard-gallery-root'>
            <div className='connectome-clipboard-gallery-toolbar'>
                <span
                    className={`connectome-clipboard-gallery-filter ${this.filter === 'history' ? 'active' : ''}`}
                    onClick={() => { this.filter = 'history'; this.update(); }}
                >History</span>
                <span
                    className={`connectome-clipboard-gallery-filter ${this.filter === 'saved' ? 'active' : ''}`}
                    onClick={() => { this.filter = 'saved'; this.update(); }}
                >Saved</span>
            </div>
            {status.status !== 'running' && this.filter === 'history' &&
                <div className='connectome-clipboard-gallery-status'>
                    {status.status === 'disabled'
                        ? 'Windows Clipboard History isn\'t enabled — turn it on in Settings → System → Clipboard.'
                        : (status.message || 'Clipboard history is unavailable.')}
                </div>}
            {items.length === 0
                ? <div className='connectome-notes-empty'>Nothing to show yet.</div>
                : <div className='connectome-clipboard-grid'>
                    {items.map(item => this.renderCard(item))}
                </div>}
        </div>;
    }

    protected renderCard(item: ClipboardEntry): React.ReactNode {
        return <div
            className='connectome-clipboard-card'
            key={item.id}
            onClick={() => window.dispatchEvent(new CustomEvent('connectome-clipboard-open', { detail: item }))}
        >
            <div className='connectome-clipboard-card-thumb'>
                {item.type === 'image' && item.cachedImagePath
                    ? <img src={`file:///${item.cachedImagePath.replace(/\\/g, '/')}`} />
                    : <span className={codicon(item.type === 'file' ? 'file' : 'symbol-string') + ' connectome-clipboard-card-icon'} />}
            </div>
            <div className='connectome-clipboard-card-label'>
                {item.type === 'text' ? (item.text ?? '').slice(0, 140) : (item.paths?.join(', ') ?? item.cachedImagePath ?? '')}
            </div>
            {this.filter === 'history' &&
                <span
                    className={codicon('save') + ' connectome-clipboard-card-save'}
                    title='Save'
                    onClick={e => { e.stopPropagation(); void this.service.saveEntry(item); }}
                />}
        </div>;
    }
}
