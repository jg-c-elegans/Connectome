import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    ApplicationShell,
    FrontendApplicationContribution,
    OpenViewArguments,
    ViewContainer,
    WidgetManager,
    codicon
} from '@theia/core/lib/browser';
import { Command, CommandRegistry, MenuModelRegistry } from '@theia/core/lib/common';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ensureLeftActivity } from './ensure-left-activity';
import { ClipboardService } from './clipboard-service';
import { ClipboardGalleryWidget } from './clipboard-gallery-widget';
import {
    CLIPBOARD_CONTEXT_MENU,
    CLIPBOARD_VIEW_CONTAINER_ID,
    CLIPBOARD_VIEW_RANK
} from './clipboard-view-container';
import { ClipboardEntry } from '../common/clipboard-api';

export namespace ClipboardCommands {
    export const SAVE: Command = {
        id: 'connectome.clipboard.save',
        label: 'Save'
    };
    export const DELETE: Command = {
        id: 'connectome.clipboard.delete',
        label: 'Delete'
    };
    export const OPEN: Command = {
        id: 'connectome.clipboard.open',
        label: 'Open'
    };
    /** Data-provider command (no UI) so the Dashboard window can read recent/saved clipboard
     * items without a compile-time dependency on connectome-clipboard-ext. */
    export const GET_RECENT: Command = {
        id: 'connectome.clipboard.getRecent'
    };
}

@injectable()
export class ClipboardContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ClipboardService)
    protected readonly service: ClipboardService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected openListener?: (event: Event) => void;

    constructor() {
        super({
            widgetId: CLIPBOARD_VIEW_CONTAINER_ID,
            widgetName: 'Clipboard',
            defaultWidgetOptions: { area: 'left', rank: CLIPBOARD_VIEW_RANK },
            toggleCommandId: 'connectome.clipboard.sidebar'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.ensureActivity();
    }

    onStart(): void {
        void this.ensureActivity();
        this.openListener = (event: Event) => {
            const entry = (event as CustomEvent<ClipboardEntry>).detail;
            void this.openEntry(entry);
        };
        window.addEventListener('connectome-clipboard-open', this.openListener);
        // Clicking the rail icon activates the tab directly via Lumino's TabBar, bypassing
        // the toggle command (and thus openView()) entirely — hook the signal so the window
        // opens on a plain rail click too, not just via the View menu/command palette.
        this.shell.leftPanelHandler.tabBar.currentChanged.connect((_sender, args) => {
            if (args.currentTitle?.owner.id === CLIPBOARD_VIEW_CONTAINER_ID) {
                void this.ensureGalleryTab();
            }
        });
    }

    onStop(): void {
        if (this.openListener) {
            window.removeEventListener('connectome-clipboard-open', this.openListener);
            this.openListener = undefined;
        }
    }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(this.shell, this.widgetManager, CLIPBOARD_VIEW_CONTAINER_ID, CLIPBOARD_VIEW_RANK);
    }

    override async openView(args: Partial<OpenViewArguments> = {}): Promise<ViewContainer> {
        const view = await super.openView({ activate: true, ...args });
        await this.ensureGalleryTab();
        return view;
    }

    protected async ensureGalleryTab(): Promise<void> {
        const existing = this.shell.getWidgetById(ClipboardGalleryWidget.ID);
        if (existing && existing.isAttached) {
            this.shell.activateWidget(existing.id);
            return;
        }
        const widget = existing || await this.widgetManager.getOrCreateWidget(ClipboardGalleryWidget.ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main', mode: 'tab-after' });
        }
        this.shell.activateWidget(widget.id);
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);

        commands.registerCommand(ClipboardCommands.SAVE, {
            execute: async (item?: ClipboardEntry) => {
                if (!item) {
                    return;
                }
                const ok = await this.service.saveEntry(item);
                await (ok ? this.messages.info('Saved to Clipboard → Saved.') : this.messages.warn('Could not save this item.'));
            },
            isVisible: (item?: ClipboardEntry) => !!item?.id && !this.service.isSaved(item.id),
            isEnabled: (item?: ClipboardEntry) => !!item?.id && !this.service.isSaved(item.id)
        });

        commands.registerCommand(ClipboardCommands.DELETE, {
            execute: async (item?: ClipboardEntry) => {
                if (!item) {
                    return;
                }
                await this.service.deleteSaved(item.id);
                await this.messages.info('Removed from Saved.');
            },
            isVisible: (item?: ClipboardEntry) => !!item?.id && this.service.isSaved(item.id),
            isEnabled: (item?: ClipboardEntry) => !!item?.id && this.service.isSaved(item.id)
        });

        commands.registerCommand(ClipboardCommands.OPEN, {
            execute: (item?: ClipboardEntry) => item && this.openEntry(item),
            isVisible: (item?: ClipboardEntry) => !!item?.id,
            isEnabled: (item?: ClipboardEntry) => !!item?.id
        });

        commands.registerCommand(ClipboardCommands.GET_RECENT, {
            execute: () => ({
                history: this.service.getHistory().slice(0, 5),
                saved: this.service.getSaved().slice(0, 5)
            })
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(CLIPBOARD_CONTEXT_MENU, {
            commandId: ClipboardCommands.OPEN.id,
            label: 'Open',
            icon: codicon('go-to-file'),
            order: '0'
        });
        menus.registerMenuAction(CLIPBOARD_CONTEXT_MENU, {
            commandId: ClipboardCommands.SAVE.id,
            label: 'Save',
            icon: codicon('save'),
            order: '1'
        });
        menus.registerMenuAction(CLIPBOARD_CONTEXT_MENU, {
            commandId: ClipboardCommands.DELETE.id,
            label: 'Delete',
            order: '2'
        });
    }

    protected async openEntry(item: ClipboardEntry): Promise<void> {
        if (item.type === 'text') {
            try {
                await navigator.clipboard.writeText(item.text ?? '');
                await this.messages.info('Copied to clipboard.');
            } catch {
                await this.messages.warn('Could not copy text.');
            }
            return;
        }
        const path = item.type === 'image' ? item.cachedImagePath : item.paths?.[0];
        if (path) {
            await window.electronConnectomeClipboard?.openPath(path);
        }
    }
}
