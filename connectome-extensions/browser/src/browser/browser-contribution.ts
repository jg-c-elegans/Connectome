import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    ApplicationShell,
    FrontendApplicationContribution,
    OpenViewArguments,
    QuickInputService,
    ViewContainer,
    Widget,
    WidgetManager,
    codicon
} from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { Command, CommandRegistry, MenuModelRegistry } from '@theia/core/lib/common';
import { MessageService } from '@theia/core/lib/common/message-service';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { BrowserWidget } from './browser-widget';
import { BrowserService } from './browser-service';
import { BrowserSearchEngine } from '../common/browser-api';
import {
    WEB_CONTEXT_MODIFICATION,
    WEB_CONTEXT_NAVIGATION,
    WEB_VIEW_CONTAINER_ID,
    WEB_VIEW_RANK,
    WebListItem,
    BROWSER_GUEST_CONTEXT_MENU
} from './browser-view-container';
import { BookmarksWidget } from './bookmarks-widget';
import { HistoryWidget } from './history-widget';
import { SavedPagesWidget } from './saved-pages-widget';
import { DownloadsWidget } from './downloads-widget';

/** @deprecated use WEB_VIEW_CONTAINER_ID */
export const BROWSER_CONTAINER = WEB_VIEW_CONTAINER_ID;

export namespace BrowserCommands {
    export const NEW: Command = {
        id: 'connectome.browser.new',
        label: 'Web: New Tab',
        iconClass: codicon('add')
    };
    export const NEW_TOOLBAR: Command = {
        id: 'connectome.browser.new.toolbar',
        iconClass: codicon('add')
    };
    export const BOOKMARK: Command = {
        id: 'connectome.browser.bookmark',
        label: 'Web: Bookmark Page'
    };
    export const SAVE: Command = {
        id: 'connectome.browser.save',
        label: 'Web: Save Page Offline'
    };
    export const CLEAR: Command = {
        id: 'connectome.browser.clearHistory',
        label: 'Web: Clear History'
    };
    export const SET_SEARCH_ENGINE: Command = {
        id: 'connectome.browser.setSearchEngine',
        label: 'Web: Set Search Engine'
    };
    export const OPEN_ITEM: Command = {
        id: 'connectome.browser.openItem',
        label: 'Open'
    };
    export const DELETE_ITEM: Command = {
        id: 'connectome.browser.deleteItem',
        label: 'Delete'
    };
    export const COPY_URL: Command = {
        id: 'connectome.browser.copyUrl',
        label: 'Copy URL'
    };
    export const SHOW_IN_FOLDER: Command = {
        id: 'connectome.browser.showInFolder',
        label: 'Reveal in File Explorer'
    };
    /** Data-provider command (no UI) so other extensions — e.g. the Dashboard window — can read
     * bookmarks without a compile-time dependency on connectome-browser-ext. */
    export const GET_BOOKMARKS: Command = {
        id: 'connectome.browser.getBookmarks'
    };
}

export namespace BrowserGuestCommands {
    export const OPEN_LINK: Command = {
        id: 'connectome.browser.guest.openLink',
        label: 'Open Link'
    };
    export const OPEN_LINK_NEW_TAB: Command = {
        id: 'connectome.browser.guest.openLinkNewTab',
        label: 'Open Link in New Tab'
    };
    export const SEND_SELECTION: Command = {
        id: 'connectome.browser.guest.sendSelection',
        label: 'Send Selection to Note...'
    };
    export const SEND_PAGE: Command = {
        id: 'connectome.browser.guest.sendPage',
        label: 'Send Page Link to Note...'
    };
    export const COPY: Command = {
        id: 'connectome.browser.guest.copy',
        label: 'Copy'
    };
    export const INSPECT: Command = {
        id: 'connectome.browser.guest.inspect',
        label: 'Inspect Element'
    };
}


@injectable()
export class BrowserContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(WidgetManager)
    protected readonly widgets: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(BrowserService)
    protected readonly service: BrowserService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    protected newTabListener?: (event: Event) => void;
    protected disposeDownloadListener?: () => void;

    constructor() {
        super({
            widgetId: WEB_VIEW_CONTAINER_ID,
            widgetName: 'Web',
            defaultWidgetOptions: { area: 'left', rank: WEB_VIEW_RANK },
            toggleCommandId: 'connectome.browser.sidebar'
        });
    }

    async initializeLayout(): Promise<void> {
        // Pin the Web activity icon only — do not open a main-area browser tab.
        await this.ensureWebActivity();
    }

    onStart(): void {
        void this.ensureWebActivity();
        this.newTabListener = (event: Event) => {
            const url = (event as CustomEvent<string>).detail;
            void this.newTab(url);
        };
        window.addEventListener('connectome-browser-new-tab', this.newTabListener);
        // Do NOT auto-open a Browser main tab when the Web sidebar is shown.
        // That path fired on layout restore / activity re-show and stole startup
        // from the welcome page. Browser tabs open only via openView (user
        // activates Web), New Tab, bookmarks/history clicks, or new-tab events.
        this.disposeDownloadListener = window.electronConnectomeBrowser?.onDownload(download => {
            this.service.upsertDownload(download);
        });
        // Drop browser tabs restored from a previous session so startup is clean.
        void this.appState.reachedState('ready').then(() => {
            this.closeRestoredBrowserTabs();
            // Late layout restore can reinflate a tab shortly after ready.
            setTimeout(() => this.closeRestoredBrowserTabs(), 250);
            setTimeout(() => this.closeRestoredBrowserTabs(), 600);
        });
        // Clicking the rail icon activates the tab directly via Lumino's TabBar, bypassing
        // the toggle command (and thus openView()) entirely — hook the signal so the window
        // opens on a plain rail click too, not just via the View menu/command palette.
        this.shell.leftPanelHandler.tabBar.currentChanged.connect((_sender, args) => {
            if (args.currentTitle?.owner.id === WEB_VIEW_CONTAINER_ID) {
                void this.ensureBrowserTab();
            }
        });
    }

    onStop(): void {
        if (this.newTabListener) {
            window.removeEventListener('connectome-browser-new-tab', this.newTabListener);
            this.newTabListener = undefined;
        }
        this.disposeDownloadListener?.();
        this.disposeDownloadListener = undefined;
    }

    /** Close any main-area Browser widgets (e.g. restored from layout storage). */
    protected closeRestoredBrowserTabs(): void {
        const browsers = this.shell.getWidgets('main')
            .filter(w => w.id.startsWith(`${BrowserWidget.ID}:`));
        for (const widget of browsers) {
            widget.close();
        }
        if (browsers.length) {
            this.service.active = undefined;
        }
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);

        commands.registerCommand(BrowserCommands.NEW, {
            execute: () => this.newTab()
        });
        // Toolbar variant: only visible when the Web view container (or a part) is the toolbar host.
        commands.registerCommand(BrowserCommands.NEW_TOOLBAR, {
            execute: () => this.newTab(),
            isEnabled: widget => this.isWebToolbarWidget(widget),
            isVisible: widget => this.isWebToolbarWidget(widget)
        });

        commands.registerCommand(BrowserCommands.BOOKMARK, {
            isEnabled: () => !!this.service.active && this.isBookmarkable(this.service.active.url),
            execute: async () => {
                const active = this.service.active;
                if (!active || !this.isBookmarkable(active.url)) {
                    await this.messages.info('Open a web page before bookmarking.');
                    return;
                }
                const bookmarked = this.service.toggleBookmark(active.pageTitle, active.url);
                await this.messages.info(bookmarked
                    ? `Bookmarked “${active.pageTitle || active.url}”.`
                    : `Removed bookmark for “${active.pageTitle || active.url}”.`);
                await this.openView({ activate: true, reveal: true });
            }
        });

        commands.registerCommand(BrowserCommands.SAVE, {
            isEnabled: () => !!this.service.active?.webContentsId,
            execute: async () => {
                const active = this.service.active;
                if (!active?.webContentsId) {
                    await this.messages.info('Load a page before saving offline.');
                    return;
                }
                const page = await window.electronConnectomeBrowser?.savePage(
                    active.webContentsId, active.pageTitle, active.url
                );
                if (page) {
                    this.service.addSaved(page);
                    await this.messages.info(`Saved “${page.title || page.url}” offline.`);
                    await this.openView({ activate: true, reveal: true });
                } else {
                    await this.messages.warn('Could not save this page offline.');
                }
            }
        });

        commands.registerCommand(BrowserCommands.CLEAR, {
            execute: async () => {
                this.service.clearHistory();
                await this.messages.info('Web history cleared.');
            }
        });

        commands.registerCommand(BrowserCommands.SET_SEARCH_ENGINE, {
            execute: async () => {
                const options: { label: string; engine: BrowserSearchEngine }[] = [
                    { label: 'DuckDuckGo', engine: 'duckduckgo' },
                    { label: 'Google', engine: 'google' },
                    { label: 'Bing', engine: 'bing' }
                ];
                const current = this.service.searchEngine;
                const items = options.map(o => ({
                    label: (o.engine === current ? '$(check) ' : '') + o.label,
                    engine: o.engine
                }));
                const selected = await this.quickInput.showQuickPick(items, {
                    placeholder: 'Select the default search engine'
                });
                if (selected) {
                    this.service.setSearchEngine(selected.engine);
                    await this.messages.info(`Default search engine set to ${selected.label.replace('$(check) ', '')}.`);
                }
            }
        });

        commands.registerCommand(BrowserCommands.OPEN_ITEM, {
            execute: (item?: WebListItem) => {
                if (item) {
                    this.openListItem(item);
                }
            },
            isVisible: (item?: WebListItem) => !!item?.id,
            isEnabled: (item?: WebListItem) => !!item?.id
        });

        commands.registerCommand(BrowserCommands.DELETE_ITEM, {
            execute: async (item?: WebListItem) => {
                if (!item) {
                    return;
                }
                this.service.remove(item.kind, item.id);
                await this.messages.info(`Removed “${item.title || item.url}”.`);
            },
            isVisible: (item?: WebListItem) => !!item?.id,
            isEnabled: (item?: WebListItem) => !!item?.id
        });

        commands.registerCommand(BrowserCommands.COPY_URL, {
            execute: async (item?: WebListItem) => {
                if (!item?.url) {
                    return;
                }
                try {
                    await navigator.clipboard.writeText(item.url);
                    await this.messages.info('URL copied.');
                } catch {
                    await this.messages.warn('Could not copy URL.');
                }
            },
            isVisible: (item?: WebListItem) => !!item?.url && item.kind !== 'downloads',
            isEnabled: (item?: WebListItem) => !!item?.url
        });

        commands.registerCommand(BrowserCommands.SHOW_IN_FOLDER, {
            execute: async (item?: WebListItem) => {
                if (!item?.path) {
                    return;
                }
                await window.electronConnectomeBrowser?.showPath(item.path);
            },
            isVisible: (item?: WebListItem) => !!item?.path &&
                (item.kind === 'savedPages' || (item.kind === 'downloads' && item.downloadState === 'completed')),
            isEnabled: (item?: WebListItem) => !!item?.path &&
                (item.kind !== 'downloads' || item.downloadState === 'completed')
        });

        commands.registerCommand(BrowserCommands.GET_BOOKMARKS, {
            execute: () => this.service.snapshot.bookmarks
        });

        commands.registerCommand(BrowserGuestCommands.SEND_SELECTION, {
            isEnabled: (widget, params: any) => !!params?.selectionText && params.selectionText.trim().length > 0,
            isVisible: (widget, params: any) => !!params?.selectionText && params.selectionText.trim().length > 0,
            execute: (widget, params: any) => {
                if (widget instanceof BrowserWidget) {
                    void widget.capture(params.selectionText);
                }
            }
        });

        commands.registerCommand(BrowserGuestCommands.SEND_PAGE, {
            execute: (widget, params: any) => {
                if (widget instanceof BrowserWidget) {
                    void widget.capture();
                }
            }
        });

        commands.registerCommand(BrowserGuestCommands.COPY, {
            isEnabled: (widget, params: any) => !!params?.selectionText && params.selectionText.trim().length > 0,
            isVisible: (widget, params: any) => !!params?.selectionText && params.selectionText.trim().length > 0,
            execute: (widget) => {
                if (widget instanceof BrowserWidget) {
                    widget.copySelection();
                }
            }
        });

        commands.registerCommand(BrowserGuestCommands.INSPECT, {
            execute: (widget, params: any) => {
                if (widget instanceof BrowserWidget) {
                    widget.inspectGuestElement(params.x, params.y);
                }
            }
        });

        commands.registerCommand(BrowserGuestCommands.OPEN_LINK, {
            isEnabled: (widget, params: any) => !!params?.linkURL,
            isVisible: (widget, params: any) => !!params?.linkURL,
            execute: (widget, params: any) => {
                if (widget instanceof BrowserWidget && params?.linkURL) {
                    widget.navigate(params.linkURL);
                }
            }
        });
        commands.registerCommand(BrowserGuestCommands.OPEN_LINK_NEW_TAB, {
            isEnabled: (widget, params: any) => !!params?.linkURL,
            isVisible: (widget, params: any) => !!params?.linkURL,
            execute: (widget, params: any) => {
                if (params?.linkURL) {
                    window.dispatchEvent(new CustomEvent('connectome-browser-new-tab', { detail: params.linkURL }));
                }
            }
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(WEB_CONTEXT_NAVIGATION, {
            commandId: BrowserCommands.OPEN_ITEM.id,
            label: 'Open',
            order: '0'
        });
        menus.registerMenuAction(WEB_CONTEXT_NAVIGATION, {
            commandId: BrowserCommands.COPY_URL.id,
            label: 'Copy URL',
            order: '1'
        });
        menus.registerMenuAction(WEB_CONTEXT_NAVIGATION, {
            commandId: BrowserCommands.SHOW_IN_FOLDER.id,
            label: 'Reveal in File Explorer',
            order: '2'
        });
        menus.registerMenuAction(WEB_CONTEXT_MODIFICATION, {
            commandId: BrowserCommands.DELETE_ITEM.id,
            label: 'Delete',
            order: '0'
        });

        menus.registerMenuAction(BROWSER_GUEST_CONTEXT_MENU, {
            commandId: BrowserGuestCommands.OPEN_LINK.id,
            label: 'Open Link',
            order: '0'
        });
        menus.registerMenuAction(BROWSER_GUEST_CONTEXT_MENU, {
            commandId: BrowserGuestCommands.OPEN_LINK_NEW_TAB.id,
            label: 'Open Link in New Tab',
            order: '1'
        });
        menus.registerMenuAction(BROWSER_GUEST_CONTEXT_MENU, {
            commandId: BrowserGuestCommands.SEND_SELECTION.id,
            label: 'Send Selection to Note...',
            order: '2'
        });
        menus.registerMenuAction(BROWSER_GUEST_CONTEXT_MENU, {
            commandId: BrowserGuestCommands.SEND_PAGE.id,
            label: 'Send Page Link to Note...',
            order: '3'
        });
        menus.registerMenuAction(BROWSER_GUEST_CONTEXT_MENU, {
            commandId: BrowserGuestCommands.COPY.id,
            label: 'Copy',
            order: '4'
        });
        menus.registerMenuAction(BROWSER_GUEST_CONTEXT_MENU, {
            commandId: BrowserGuestCommands.INSPECT.id,
            label: 'Inspect Element',
            order: '5'
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        // Same pattern as Explorer's New File: icon on the side-panel toolbar for this view.
        registry.registerItem({
            id: BrowserCommands.NEW_TOOLBAR.id,
            command: BrowserCommands.NEW_TOOLBAR.id,
            tooltip: 'New Tab',
            priority: 0
        });
    }

    override async openView(args: Partial<OpenViewArguments> = {}): Promise<ViewContainer> {
        const view = await super.openView({
            activate: true,
            ...args
        });
        await this.ensureBrowserTab();
        return view;
    }

    async newTab(url?: string): Promise<BrowserWidget> {
        await this.ensureWebActivity();
        const widget = await this.widgets.getOrCreateWidget(BrowserWidget.ID, {
            id: crypto.randomUUID(),
            url
        }) as unknown as BrowserWidget;
        await this.shell.addWidget(widget, { area: 'main', mode: 'tab-after' });
        this.shell.activateWidget(widget.id);
        this.service.active = widget;
        return widget;
    }

    protected async ensureWebActivity(): Promise<ViewContainer> {
        const widget = await this.widgetManager.getOrCreateWidget(WEB_VIEW_CONTAINER_ID) as ViewContainer;
        if (!this.shell.getTabBarFor(widget)) {
            await this.shell.addWidget(widget, { area: 'left', rank: WEB_VIEW_RANK });
        }
        return widget;
    }

    protected async ensureBrowserTab(): Promise<void> {
        if (this.service.active) {
            const id = (this.service.active as BrowserWidget).id;
            const existing = this.shell.getWidgetById(id);
            if (id && existing && existing.isAttached) {
                this.shell.activateWidget(id);
                return;
            }
        }
        const existing = this.shell.getWidgets('main').find(w => w.id.startsWith(`${BrowserWidget.ID}:`) && w.isAttached);
        if (existing) {
            this.shell.activateWidget(existing.id);
            if (existing instanceof BrowserWidget) {
                this.service.active = existing;
            }
            return;
        }
        await this.newTab();
    }

    protected openListItem(item: WebListItem): void {
        if (item.kind === 'downloads' && item.path && item.downloadState === 'completed') {
            void window.electronConnectomeBrowser?.openPath(item.path);
            return;
        }
        if (item.kind === 'savedPages' && item.path) {
            const fileUrl = item.url.startsWith('file:')
                ? item.url
                : `file:///${item.path.replace(/\\/g, '/')}`;
            if (this.service.active) {
                this.service.active.navigate(fileUrl);
            } else {
                void this.newTab(fileUrl);
            }
            return;
        }
        if (this.service.active) {
            this.service.active.navigate(item.url);
        } else {
            void this.newTab(item.url);
        }
    }

    protected isBookmarkable(url: string): boolean {
        return /^(https?:|file:)/i.test(url);
    }

    protected isWebToolbarWidget(widget?: Widget): boolean {
        if (!widget) {
            return false;
        }
        if (widget.id === WEB_VIEW_CONTAINER_ID) {
            return true;
        }
        const partIds = [
            BookmarksWidget.ID,
            HistoryWidget.ID,
            SavedPagesWidget.ID,
            DownloadsWidget.ID
        ];
        if (partIds.includes(widget.id)) {
            return true;
        }
        // ViewContainer may pass a trackable/title delegate.
        const trackable = (widget as ViewContainer).getTrackableWidgets?.();
        if (Array.isArray(trackable) && trackable.some(w => partIds.includes(w.id))) {
            return true;
        }
        return false;
    }
}
