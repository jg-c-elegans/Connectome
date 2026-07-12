import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, StatefulWidget, codicon, ContextMenuRenderer, QuickInputService, ApplicationShell } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common/message-service';
import { BrowserService } from './browser-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { NoteIndexService } from 'connectome-notes-ext/lib/browser/note-index-service';
import { BROWSER_GUEST_CONTEXT_MENU, WEB_CONTEXT_MENU, WebListItem } from './browser-view-container';
import URI from '@theia/core/lib/common/uri';
import * as monaco from '@theia/monaco-editor-core';

const NEW_TAB_URL = 'connectome://newtab';

/** Electron webview context-menu `params` subset we care about. */
interface GuestContextMenuParams {
    x?: number;
    y?: number;
    linkURL?: string;
    selectionText?: string;
    pageURL?: string;
}

@injectable()
export class BrowserWidgetOptions {
    id: string;
    url?: string;
}

@injectable()
export class BrowserWidget extends BaseWidget implements StatefulWidget {
    static ID = 'connectome-browser';

    @inject(BrowserWidgetOptions)
    protected readonly options: BrowserWidgetOptions;

    @inject(BrowserService)
    protected readonly service: BrowserService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ContextMenuRenderer)
    protected readonly contextMenu: ContextMenuRenderer;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    protected webview: Electron.WebviewTag | undefined;
    protected toolbarInput!: HTMLInputElement;
    protected newTabPanel: HTMLElement | undefined;
    protected newTabInput: HTMLInputElement | undefined;
    protected backButton!: HTMLButtonElement;
    protected forwardButton!: HTMLButtonElement;
    protected bookmarkButton!: HTMLButtonElement;
    protected bookmarkIcon!: HTMLElement;
    protected disposeChange: { dispose(): void } | undefined;

    url = NEW_TAB_URL;
    pageTitle = 'Browser';
    webContentsId: number | undefined;

    @postConstruct()
    protected init(): void {
        this.id = `${BrowserWidget.ID}:${this.options.id}`;
        this.title.closable = true;
        this.title.label = 'Browser';
        this.title.iconClass = codicon('globe');
        this.node.classList.add('connectome-browser-widget');

        this.node.innerHTML = `
            <div class="connectome-browser-toolbar">
                <button type="button" data-a="back" title="Back" disabled>
                    <span class="codicon codicon-arrow-left"></span>
                </button>
                <button type="button" data-a="forward" title="Forward" disabled>
                    <span class="codicon codicon-arrow-right"></span>
                </button>
                <button type="button" data-a="reload" title="Reload">
                    <span class="codicon codicon-refresh"></span>
                </button>
                <button type="button" data-a="home" title="Home">
                    <span class="codicon codicon-home"></span>
                </button>
                <input class="theia-input" aria-label="Address or search" placeholder="Search or enter an address">
                <button type="button" data-a="bookmark" title="Bookmark">
                    <span class="codicon codicon-star-empty"></span>
                </button>
                <button type="button" class="connectome-browser-save" data-a="save">Save</button>
                <button type="button" class="connectome-browser-capture" data-a="capture" title="Send selection or page to note">Capture</button>
            </div>
            <div class="connectome-browser-bookmarks-bar"></div>
            <div class="connectome-browser-newtab">
                <h1>Connectome Browser</h1>
                <input class="theia-input" aria-label="Search the web" placeholder="Search or enter an address">
                <p>Research without leaving your workspace.</p>
            </div>`;

        this.toolbarInput = this.node.querySelector('.connectome-browser-toolbar input') as HTMLInputElement;
        this.newTabPanel = this.node.querySelector('.connectome-browser-newtab') as HTMLElement;
        this.newTabInput = this.node.querySelector('.connectome-browser-newtab input') as HTMLInputElement;
        this.backButton = this.node.querySelector('button[data-a="back"]') as HTMLButtonElement;
        this.forwardButton = this.node.querySelector('button[data-a="forward"]') as HTMLButtonElement;
        this.bookmarkButton = this.node.querySelector('button[data-a="bookmark"]') as HTMLButtonElement;
        this.bookmarkIcon = this.bookmarkButton.querySelector('.codicon') as HTMLElement;

        const go = (value: string) => {
            const trimmed = value.trim();
            if (trimmed) {
                this.navigate(this.service.normalize(trimmed));
            }
        };
        this.toolbarInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                go(this.toolbarInput.value);
            }
        });
        this.newTabInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                go(this.newTabInput!.value);
            }
        });

        this.node.querySelectorAll('.connectome-browser-toolbar button').forEach(button => {
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                const action = (button as HTMLElement).dataset.a || '';
                void this.action(action);
            });
        });

        this.disposeChange = this.service.onDidChange(() => this.updateChrome());
        this.toDispose.push({ dispose: () => this.disposeChange?.dispose() });
        this.toDispose.push({
            dispose: () => {
                if (this.service.active === this) {
                    this.service.active = undefined;
                }
            }
        });

        if (this.options.url && this.options.url !== NEW_TAB_URL) {
            this.navigate(this.options.url);
        } else {
            this.updateChrome();
        }
    }

    navigate(url: string): void {
        if (!/^(https?:|file:)/i.test(url)) {
            void window.electronConnectomeBrowser?.openExternal(url);
            return;
        }
        if (document.querySelector('.lm-Menu')) {
            document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
        this.url = url;
        this.ensureWebview();
        if (this.webview) {
            this.webview.src = url;
        }
        this.toolbarInput.value = url;
        this.hideNewTabPanel();
        this.updateChrome();
        this.shell.activateWidget(this.id);
    }

    protected ensureWebview(): void {
        if (this.webview) {
            return;
        }
        this.hideNewTabPanel();
        this.webview = document.createElement('webview') as Electron.WebviewTag;
        this.webview.setAttribute('partition', 'persist:connectome-browser');
        this.webview.setAttribute('allowpopups', '');
        this.webview.classList.add('connectome-browser-guest');
        this.node.appendChild(this.webview);

        /**
         * Guest-page helpers:
         * 1) Dismiss host context menus when the user clicks inside the webview
         *    (guest clicks do not bubble to the host DOM).
         * 2) Force target=_blank / rel=noopener links to navigate in-place so a
         *    left-click works even if window.open handling races; the main-process
         *    setWindowOpenHandler is the primary fix, this is belt-and-suspenders.
         * 3) Ensure Enter in forms triggers a real navigation (some sites only
         *    call window.open on submit).
         */
        const injectGuestHelpers = () => {
            if (!this.webview) {
                return;
            }
            this.webview.executeJavaScript(`
                (() => {
                    if (window.__connectomeBrowserHelpers) return;
                    window.__connectomeBrowserHelpers = true;

                    window.addEventListener('mousedown', () => {
                        console.log('connectome-guest-mousedown');
                    }, { capture: true, passive: true });

                    const shouldInPlace = (a) => {
                        if (!a || !a.href) return false;
                        const href = a.href;
                        if (!/^https?:/i.test(href)) return false;
                        if (href.startsWith('javascript:')) return false;
                        const t = (a.getAttribute('target') || '').toLowerCase();
                        return t === '_blank' || t === '_new' || t === 'blank';
                    };

                    window.addEventListener('click', (e) => {
                        if (e.defaultPrevented) return;
                        if (e.button !== 0) return;
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
                        if (!shouldInPlace(a)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        window.location.assign(a.href);
                    }, true);

                    window.addEventListener('submit', (e) => {
                        try {
                            const form = e.target;
                            if (!form || !form.action) return;
                            const t = (form.getAttribute('target') || '').toLowerCase();
                            if (t !== '_blank' && t !== '_new' && t !== 'blank') return;
                            // Let the browser build the URL, then force same-tab.
                            // preventDefault + manual assign for GET forms.
                            const method = (form.method || 'get').toLowerCase();
                            if (method !== 'get') return;
                            e.preventDefault();
                            const action = form.action;
                            const data = new FormData(form);
                            const params = new URLSearchParams(data);
                            const url = action + (action.includes('?') ? '&' : '?') + params.toString();
                            window.location.assign(url);
                        } catch (_) { /* ignore */ }
                    }, true);
                })()
            `).catch(() => { /* guest may be mid-navigation */ });
        };

        this.webview.addEventListener('dom-ready', () => {
            try {
                this.webContentsId = this.webview?.getWebContentsId();
            } catch {
                this.webContentsId = undefined;
            }
            this.service.active = this;
            void this.applyDarkMode();
            this.updateChrome();
            injectGuestHelpers();
        });
        this.webview.addEventListener('did-finish-load', () => {
            void this.applyDarkMode();
            this.updateChrome();
            injectGuestHelpers();
        });
        this.webview.addEventListener('did-navigate', e => {
            this.didNavigate((e as Event & { url: string }).url);
        });
        this.webview.addEventListener('did-navigate-in-page', e => {
            this.didNavigate((e as Event & { url: string }).url, false);
        });
        this.webview.addEventListener('page-title-updated', e => {
            this.pageTitle = (e as Event & { title: string }).title || 'Browser';
            this.title.label = this.pageTitle;
            this.updateChrome();
        });
        // Legacy path (older Electron). Primary handling is setWindowOpenHandler in electron-main.
        this.webview.addEventListener('new-window', (e: Event) => {
            const next = (e as Event & { url?: string }).url;
            if (next && /^https?:/i.test(next)) {
                if (typeof (e as { preventDefault?: () => void }).preventDefault === 'function') {
                    (e as { preventDefault: () => void }).preventDefault();
                }
                this.navigate(next);
            }
        });
        this.webview.addEventListener('context-menu', (e: Event) => {
            e.preventDefault();
            this.showGuestContextMenu((e as Event & { params?: GuestContextMenuParams }).params);
        });
        this.webview.addEventListener('console-message', (e: Event) => {
            if ((e as Event & { message?: string }).message === 'connectome-guest-mousedown') {
                if (document.querySelector('.lm-Menu')) {
                    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                }
            }
        });
    }

    protected hideNewTabPanel(): void {
        if (this.newTabPanel) {
            this.newTabPanel.style.display = 'none';
        }
    }

    protected showNewTabPanel(): void {
        if (this.newTabPanel) {
            this.newTabPanel.style.display = '';
        }
        if (this.newTabInput) {
            this.newTabInput.value = '';
        }
    }

    /** Home: reset to the new-tab page without closing the shell tab. */
    protected goHome(): void {
        if (this.webview) {
            this.webview.remove();
            this.webview = undefined;
        }
        this.webContentsId = undefined;
        this.url = NEW_TAB_URL;
        this.pageTitle = 'Browser';
        this.title.label = 'Browser';
        this.toolbarInput.value = '';
        this.showNewTabPanel();
        this.updateChrome();
    }

    protected async applyDarkMode(): Promise<void> {
        if (!this.webview) {
            return;
        }
        try {
            const isLight = await this.webview.executeJavaScript(
                `(() => {
                    const c = getComputedStyle(document.body || document.documentElement).backgroundColor;
                    const m = c.match(/\\d+/g);
                    return !m || (+m[0] + +m[1] + +m[2]) > 420;
                })()`
            );
            if (isLight) {
                await this.webview.insertCSS(
                    'html{background:#090b16!important;filter:invert(.9) hue-rotate(180deg)!important}'
                    + 'img,video,picture,canvas,svg{filter:invert(1) hue-rotate(180deg)!important}'
                );
            }
        } catch {
            /* Navigation can invalidate the page; the next load event retries. */
        }
    }

    protected didNavigate(url: string, recordHistory = true): void {
        this.url = url;
        this.toolbarInput.value = url;
        if (recordHistory && /^(https?:|file:)/i.test(url)) {
            this.service.addHistory({ title: this.pageTitle, url });
        }
        this.updateChrome();
    }

    updateChrome(): void {
        const hasWebview = !!this.webview;
        let canBack = false;
        let canForward = false;
        if (this.webview) {
            try {
                canBack = this.webview.canGoBack();
                canForward = this.webview.canGoForward();
            } catch {
                canBack = false;
                canForward = false;
            }
        }
        this.backButton.disabled = !canBack;
        this.forwardButton.disabled = !canForward;

        const bookmarkable = /^(https?:|file:)/i.test(this.url);
        this.bookmarkButton.disabled = !bookmarkable;
        const bookmarked = bookmarkable && this.service.isBookmarked(this.url);
        this.bookmarkIcon.className = bookmarked
            ? 'codicon codicon-star-full'
            : 'codicon codicon-star-empty';
        this.bookmarkButton.title = bookmarked ? 'Remove bookmark' : 'Bookmark';
        this.bookmarkButton.classList.toggle('connectome-browser-bookmarked', bookmarked);

        if (this.url === NEW_TAB_URL) {
            this.toolbarInput.value = '';
        } else if (this.toolbarInput !== document.activeElement) {
            this.toolbarInput.value = this.url;
        }

        // Reload is always available when a guest page exists.
        const reload = this.node.querySelector('button[data-a="reload"]') as HTMLButtonElement | null;
        if (reload) {
            reload.disabled = !hasWebview;
        }
        const save = this.node.querySelector('button[data-a="save"]') as HTMLButtonElement | null;
        if (save) {
            save.disabled = !this.webContentsId;
        }
        const capture = this.node.querySelector('button[data-a="capture"]') as HTMLButtonElement | null;
        if (capture) {
            capture.disabled = !this.webContentsId;
        }

        const bookmarksBar = this.node.querySelector('.connectome-browser-bookmarks-bar') as HTMLElement;
        if (bookmarksBar) {
            const bookmarks = this.service.snapshot.bookmarks;
            if (bookmarks.length === 0) {
                bookmarksBar.innerHTML = `<span class="connectome-browser-bookmarks-empty">No bookmarks yet. Click the star icon to bookmark pages.</span>`;
            } else {
                bookmarksBar.innerHTML = bookmarks.map(b => `
                    <button type="button" class="connectome-browser-bookmark-item" data-id="${b.id}" data-url="${b.url}" title="${this.escapeHtml(b.title)}\n${this.escapeHtml(b.url)}">
                        <span class="codicon codicon-bookmark"></span>
                        <span class="bookmark-label">${this.escapeHtml(b.title || b.url)}</span>
                    </button>
                `).join('');

                bookmarksBar.querySelectorAll('.connectome-browser-bookmark-item').forEach(btn => {
                    btn.addEventListener('click', e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const url = (btn as HTMLElement).dataset.url;
                        if (url) {
                            this.navigate(url);
                        }
                    });
                    btn.addEventListener('contextmenu', e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const id = (btn as HTMLElement).dataset.id;
                        const url = (btn as HTMLElement).dataset.url;
                        const title = (btn as HTMLElement).getAttribute('title')?.split('\n')[0] || '';
                        if (id && url) {
                            this.showBookmarkContextMenu(e as MouseEvent, { kind: 'bookmarks', id, title, url });
                        }
                    });
                });
            }
        }
    }

    protected async action(action: string): Promise<void> {
        switch (action) {
            case 'back':
                if (this.webview) {
                    try {
                        if (this.webview.canGoBack()) {
                            this.webview.goBack();
                        }
                    } catch {
                        /* guest may be mid-navigation */
                    }
                }
                break;
            case 'forward':
                if (this.webview) {
                    try {
                        if (this.webview.canGoForward()) {
                            this.webview.goForward();
                        }
                    } catch {
                        /* guest may be mid-navigation */
                    }
                }
                break;
            case 'reload':
                if (this.webview) {
                    try {
                        this.webview.reload();
                    } catch {
                        /* ignore */
                    }
                }
                break;
            case 'home':
                this.goHome();
                break;
            case 'bookmark':
                await this.toggleBookmark();
                break;
            case 'save':
                await this.savePage();
                break;
            case 'capture':
                void this.capture();
                break;
            default:
                break;
        }
    }

    protected async toggleBookmark(): Promise<void> {
        if (!/^(https?:|file:)/i.test(this.url)) {
            await this.messages.info('Open a web page before bookmarking.');
            return;
        }
        const bookmarked = this.service.toggleBookmark(this.pageTitle, this.url);
        this.updateChrome();
        await this.messages.info(bookmarked
            ? `Bookmarked “${this.pageTitle || this.url}”.`
            : `Removed bookmark for “${this.pageTitle || this.url}”.`);
    }

    protected async savePage(): Promise<void> {
        let id = this.webContentsId;
        if (!id && this.webview) {
            try {
                id = this.webview.getWebContentsId();
                this.webContentsId = id;
            } catch {
                id = undefined;
            }
        }
        if (!id) {
            await this.messages.info('Load a page before saving offline.');
            return;
        }
        const api = window.electronConnectomeBrowser;
        if (!api) {
            await this.messages.warn('Offline save is unavailable in this session.');
            return;
        }
        try {
            const page = await api.savePage(id, this.pageTitle, this.url);
            if (page) {
                this.service.addSaved(page);
                await this.messages.info(`Saved “${page.title || page.url}” offline.`);
            } else {
                await this.messages.warn('Could not save this page offline.');
            }
        } catch (err) {
            await this.messages.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    copySelection(): void {
        if (this.webview) {
            try {
                this.webview.copy();
            } catch {
                // ignore
            }
        }
    }

    inspectGuestElement(x: number, y: number): void {
        if (this.webview) {
            try {
                this.webview.inspectElement(x, y);
            } catch {
                // ignore
            }
        }
    }

    /**
     * Electron's webview `context-menu` event puts click coords in `params.x/y`
     * relative to the *guest* page origin — not screen/client coords. Passing the
     * raw MouseEvent (often 0,0) parks the Theia menu in the top-left of the window.
     * Map guest → host client coordinates via the webview's bounding rect.
     */
    protected showGuestContextMenu(params?: GuestContextMenuParams): void {
        const rect = this.webview?.getBoundingClientRect();
        const guestX = typeof params?.x === 'number' ? params.x : 0;
        const guestY = typeof params?.y === 'number' ? params.y : 0;
        const x = (rect?.left ?? 0) + guestX;
        const y = (rect?.top ?? 0) + guestY;
        this.contextMenu.render({
            menuPath: BROWSER_GUEST_CONTEXT_MENU,
            anchor: { x, y },
            args: [this, params ?? {}],
            context: this.node
        });
    }

    protected getActiveNoteUri(): URI | undefined {
        const activeWidget = this.shell.currentWidget;
        if (!activeWidget) {
            return undefined;
        }
        if (activeWidget instanceof EditorWidget) {
            const uri = activeWidget.editor.uri;
            if (uri && (uri.path.ext.toLowerCase() === '.md' || uri.path.ext.toLowerCase() === '.markdown')) {
                return uri;
            }
        }
        const anyW = activeWidget as any;
        if (anyW.resource instanceof URI) {
            const ext = anyW.resource.path.ext.toLowerCase();
            if (ext === '.md' || ext === '.markdown') {
                return anyW.resource;
            }
        }
        return undefined;
    }

    async capture(selectedText?: string): Promise<void> {
        let selection = selectedText || '';
        if (!selection && this.webview) {
            try {
                selection = await this.webview.executeJavaScript('window.getSelection().toString()');
            } catch {
                // ignore
            }
        }
        selection = selection.trim();

        // 1. Prepare options
        const items: { label: string; id: 'new' | 'active' | 'existing'; uri?: URI }[] = [];

        // Active note
        const activeUri = this.getActiveNoteUri();
        if (activeUri) {
            items.push({
                label: `Append to Active Note: ${activeUri.path.name}`,
                id: 'active',
                uri: activeUri
            });
        }

        // Create new note
        items.push({
            label: '$(plus) Create New Note...',
            id: 'new'
        });

        // Other notes
        const allUris = this.index.getAllNoteUris();
        for (const uri of allUris) {
            if (activeUri && uri.toString() === activeUri.toString()) {
                continue;
            }
            items.push({
                label: `Append to: ${uri.path.name}`,
                id: 'existing',
                uri
            });
        }

        // Show picker
        const selected = await this.quickInput.showQuickPick(items, {
            placeholder: 'Select a target note to send capture to'
        });
        if (!selected) {
            return;
        }

        let targetUri: URI | undefined;
        let targetName = '';

        if (selected.id === 'new') {
            // Prompt for new note name
            const cleanTitle = this.pageTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'Untitled';
            const title = await this.quickInput.input({
                value: cleanTitle,
                prompt: 'Enter new note title'
            });
            if (!title) {
                return;
            }

            const roots = this.workspaceService.tryGetRoots();
            if (roots.length === 0) {
                void this.messages.error('No workspace root open to create a note.');
                return;
            }

            // Sanitized filename
            const filename = title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'Untitled';
            targetUri = roots[0].resource.resolve(`${filename}.md`);
            targetName = filename;

            if (await this.fileService.exists(targetUri)) {
                void this.messages.warn(`Note "${filename}.md" already exists.`);
                return;
            }

            // Create new note content
            const body = `# ${title}\n\nSource: [${this.pageTitle}](${this.url})\n\n` +
                (selection ? `> [!quote] [${this.pageTitle}](${this.url})\n` + selection.split('\n').map(l => `> ${l}`).join('\n') + '\n' : '');

            await this.fileService.create(targetUri, body);
            await this.index.indexUri(targetUri, body);
        } else {
            // Append to existing/active note
            targetUri = selected.uri;
            if (!targetUri) {
                return;
            }
            targetName = targetUri.path.name;

            let appendText = '';
            if (selection) {
                const quoted = selection.split('\n').map(l => `> ${l}`).join('\n');
                appendText = `\n\n> [!quote] [${this.pageTitle}](${this.url})\n${quoted}`;
            } else {
                appendText = `\n\n- Captured from: [${this.pageTitle}](${this.url})`;
            }

            const model = monaco.editor.getModels().find(m => m.uri.toString() === targetUri!.toString() || m.uri.toString(true) === targetUri!.toString());
            if (model) {
                const lineCount = model.getLineCount();
                const lastLineLength = model.getLineMaxColumn(lineCount);
                const range = new monaco.Range(lineCount, lastLineLength, lineCount, lastLineLength);
                model.pushEditOperations([], [{ range, text: appendText }], () => null);
            } else {
                try {
                    const content = await this.fileService.read(targetUri);
                    const next = content.value + appendText;
                    await this.fileService.write(targetUri, next);
                    await this.index.indexUri(targetUri, next);
                } catch (err) {
                    void this.messages.error(`Failed to append: ${err instanceof Error ? err.message : String(err)}`);
                    return;
                }
            }
        }

        // Show silent notification and KEEP focus on browser tab
        void this.messages.info(selected.id === 'new'
            ? `Selection captured to new note: ${targetName}`
            : `Selection/Page captured to note: ${targetName}`);
    }

    protected override onActivateRequest(): void {
        this.service.active = this;
        this.updateChrome();
        this.node.focus();
    }

    storeState(): object {
        return { url: this.url };
    }

    restoreState(state: object): void {
        const url = (state as { url?: string }).url;
        if (url && url !== NEW_TAB_URL) {
            this.navigate(url);
        } else {
            this.updateChrome();
        }
    }

    protected showBookmarkContextMenu(e: MouseEvent, item: WebListItem): void {
        this.contextMenu.render({
            menuPath: WEB_CONTEXT_MENU,
            anchor: e,
            args: [item],
            context: this.node
        });
    }

    protected escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
