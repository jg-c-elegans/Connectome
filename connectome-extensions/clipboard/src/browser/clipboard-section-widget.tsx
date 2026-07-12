import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message, ReactWidget, codicon, ContextMenuRenderer } from '@theia/core/lib/browser';
import { ClipboardService } from './clipboard-service';
import { CLIPBOARD_CONTEXT_MENU } from './clipboard-view-container';
import { ClipboardEntry } from '../common/clipboard-api';

/** Shared list UI for the Clipboard ViewContainer parts (Clipboard, Saved). */
@injectable()
export abstract class ClipboardSectionWidget extends ReactWidget {

    @inject(ClipboardService)
    protected readonly service: ClipboardService;

    @inject(ContextMenuRenderer)
    protected readonly contextMenu: ContextMenuRenderer;

    protected abstract readonly sectionLabel: string;
    protected abstract readonly sectionIcon: string;
    protected abstract readonly emptyHint: string;

    @postConstruct()
    protected init(): void {
        this.id = this.sectionId;
        this.title.label = this.sectionLabel;
        this.title.caption = this.sectionLabel;
        this.title.iconClass = codicon(this.sectionIcon);
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.addClass('connectome-clipboard-widget');
        this.toDispose.push(this.service.onDidChange(() => this.update()));
        this.update();
    }

    protected abstract get sectionId(): string;

    protected abstract getItems(): ClipboardEntry[];

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const items = this.getItems();
        return <div className='connectome-clipboard-section'>
            {items.length === 0
                ? <div className='connectome-notes-empty'>{this.emptyHint}</div>
                : <div className='connectome-notes-list connectome-clipboard-list'>
                    {items.map(item => this.renderItem(item))}
                </div>}
        </div>;
    }

    protected labelFor(item: ClipboardEntry): string {
        if (item.type === 'text') {
            return (item.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || '(empty)';
        }
        if (item.type === 'image') {
            return item.cachedImagePath ?? 'Image';
        }
        return item.paths?.join(', ') ?? 'File';
    }

    protected iconFor(item: ClipboardEntry): string {
        return item.type === 'text' ? 'symbol-string' : item.type === 'image' ? 'file-media' : 'file';
    }

    protected renderItem(item: ClipboardEntry): React.ReactNode {
        return <div
            className='connectome-notes-occurrence connectome-clipboard-item'
            key={item.id}
            title={this.labelFor(item)}
            onClick={() => this.openItem(item)}
            onContextMenu={e => this.showContextMenu(e, item)}
        >
            <span className={codicon(this.iconFor(item)) + ' connectome-notes-icon'} />
            <span className='connectome-notes-group-name'>{this.labelFor(item)}</span>
        </div>;
    }

    protected openItem(item: ClipboardEntry): void {
        window.dispatchEvent(new CustomEvent('connectome-clipboard-open', { detail: item }));
    }

    protected showContextMenu(event: React.MouseEvent, item: ClipboardEntry): void {
        event.preventDefault();
        event.stopPropagation();
        this.contextMenu.render({
            menuPath: CLIPBOARD_CONTEXT_MENU,
            anchor: event.nativeEvent,
            args: [item],
            context: this.node
        });
    }
}
