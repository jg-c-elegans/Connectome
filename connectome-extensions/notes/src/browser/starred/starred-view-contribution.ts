import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution, FrontendApplicationContribution, CommonMenus, codicon, Widget
} from '@theia/core/lib/browser';
import { Command, CommandRegistry, MenuModelRegistry, Emitter } from '@theia/core/lib/common';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WidgetManager, ViewContainer, ApplicationShell } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { StarredWidget } from './starred-widget';
import { StarredNotesService } from './starred-notes-service';
import { NOTES_VIEW_CONTAINER_ID } from '../notes-view-container';

/** Same id as `@theia/navigator`'s explorer view container. */
export const EXPLORER_VIEW_CONTAINER_ID = 'explorer-view-container';

export namespace StarredCommands {
    export const TOGGLE: Command = {
        id: 'connectomeNotes.star.toggle',
        label: 'Notes: Star/Unstar Active Note',
        iconClass: codicon('star-empty')
    };
    export const FOCUS: Command = {
        id: 'connectomeNotes.starred.focus',
        label: 'Explorer: Focus Starred Notes'
    };
}

function isViewContainer(widget: Widget): widget is ViewContainer {
    const candidate = widget as ViewContainer;
    return typeof candidate.addWidget === 'function'
        && typeof candidate.getTrackableWidgets === 'function'
        && typeof candidate.removeWidget === 'function';
}

@injectable()
export class StarredViewContribution extends AbstractViewContribution<StarredWidget>
    implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(StarredNotesService)
    protected readonly starred: StarredNotesService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(WidgetManager)
    protected readonly widgets: WidgetManager;

    @inject(ApplicationShell)
    protected readonly appShell: ApplicationShell;

    protected readonly onToolbarChangeEmitter = new Emitter<void>();
    protected attached = false;

    constructor() {
        // Do NOT set viewContainerId to explorer: AbstractViewContribution.openView
        // only opens that container; it does not parent our widget into it.
        // We attach manually (same pattern as Timeline → Explorer).
        super({
            widgetId: StarredWidget.ID,
            widgetName: StarredWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 200 },
            toggleCommandId: 'connectomeNotes.starred.toggle'
        });
    }

    @postConstruct()
    protected initStarredAttachment(): void {
        // Register BEFORE layout creates the explorer (onStart is too late).
        this.widgets.onWillCreateWidget(async event => {
            if (event.widget.id === EXPLORER_VIEW_CONTAINER_ID) {
                event.waitUntil(this.attachToExplorer(event.widget));
            }
            // If Notes container is (re)created, keep Starred out of it (layout restore).
            if (event.widget.id === NOTES_VIEW_CONTAINER_ID) {
                event.waitUntil(this.detachFromNotes(event.widget));
            }
        });
        this.widgets.onDidCreateWidget(async event => {
            if (event.widget.id === EXPLORER_VIEW_CONTAINER_ID) {
                await this.attachToExplorer(event.widget);
            }
            if (event.widget.id === NOTES_VIEW_CONTAINER_ID) {
                await this.detachFromNotes(event.widget);
            }
        });
    }

    async initializeLayout(): Promise<void> {
        await this.ensureInExplorer();
    }

    onStart(): void {
        this.ensureInExplorer().catch(err =>
            console.error('[connectome-notes] ensureInExplorer failed', err));
        this.editorManager.onCurrentEditorChanged(() => this.onToolbarChangeEmitter.fire());
        this.starred.onDidChange(() => this.onToolbarChangeEmitter.fire());
    }

    protected async ensureInExplorer(): Promise<void> {
        // Prefer already-created explorer; create via shell if needed.
        let explorer = this.widgets.tryGetWidget(EXPLORER_VIEW_CONTAINER_ID);
        if (!explorer) {
            try {
                explorer = await this.widgets.getOrCreateWidget(EXPLORER_VIEW_CONTAINER_ID);
            } catch (err) {
                console.error('[connectome-notes] could not get explorer container', err);
                return;
            }
        }
        await this.attachToExplorer(explorer);
        // Clean up any stale placement under Notes (saved layouts).
        const notes = this.widgets.tryGetWidget(NOTES_VIEW_CONTAINER_ID);
        if (notes) {
            await this.detachFromNotes(notes);
        }
    }

    protected async attachToExplorer(explorer: Widget): Promise<void> {
        if (!isViewContainer(explorer)) {
            console.warn('[connectome-notes] explorer widget is not a ViewContainer', explorer.id);
            return;
        }
        const starred = await this.widgets.getOrCreateWidget(StarredWidget.ID);
        const tracked = explorer.getTrackableWidgets();
        if (tracked.indexOf(starred) === -1) {
            explorer.addWidget(starred, {
                order: 0,
                canHide: true,
                initiallyCollapsed: false,
                weight: 20
            });
            console.log('[connectome-notes] Starred attached to Explorer');
        }
        this.attached = true;
    }

    protected async detachFromNotes(notes: Widget): Promise<void> {
        if (!isViewContainer(notes)) {
            return;
        }
        const starred = this.widgets.tryGetWidget(StarredWidget.ID);
        if (!starred) {
            return;
        }
        if (notes.getTrackableWidgets().indexOf(starred) >= 0) {
            notes.removeWidget(starred);
            console.log('[connectome-notes] Starred removed from Notes container');
        }
    }

    override async openView(args: Parameters<AbstractViewContribution<StarredWidget>['openView']>[0] = {}): Promise<StarredWidget> {
        await this.ensureInExplorer();
        const explorer = this.widgets.tryGetWidget(EXPLORER_VIEW_CONTAINER_ID);
        if (explorer && !this.appShell.getAreaFor(explorer)) {
            await this.appShell.addWidget(explorer, { area: 'left', rank: 200 });
        }
        if (explorer) {
            await this.appShell.revealWidget(EXPLORER_VIEW_CONTAINER_ID);
            if (args?.activate !== false) {
                await this.appShell.activateWidget(EXPLORER_VIEW_CONTAINER_ID);
            }
            if (isViewContainer(explorer)) {
                explorer.activateWidget(StarredWidget.ID);
            }
        }
        return this.widgets.getOrCreateWidget(StarredWidget.ID);
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: 'connectome-notes-star-toolbar',
            command: StarredCommands.TOGGLE.id,
            tooltip: 'Star / unstar this note',
            group: 'navigation',
            priority: 0,
            icon: () => {
                const uri = this.markdownUriFrom(this.editorManager.currentEditor);
                if (uri && this.starred.isStarred(uri)) {
                    return codicon('star-full');
                }
                return codicon('star-empty');
            },
            isVisible: widget => !!this.markdownUriFrom(widget),
            onDidChange: this.onToolbarChangeEmitter.event
        });
        registry.registerItem({
            id: 'connectome-notes-open-editor',
            command: 'cherrymarkdown.preview',
            tooltip: 'Open in Markdown Editor',
            group: 'navigation',
            priority: -1,
            icon: codicon('edit'),
            isVisible: widget => !!this.markdownUriFrom(widget),
            onDidChange: this.onToolbarChangeEmitter.event
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(StarredCommands.TOGGLE, {
            execute: async (widget?: Widget) => {
                const uri = this.markdownUriFrom(widget) ?? this.markdownUriFrom(this.editorManager.currentEditor);
                if (!uri) {
                    await this.messages.info('Open a markdown note to star it.');
                    return;
                }
                const nowStarred = await this.starred.toggle(uri);
                await this.messages.info(nowStarred
                    ? `Starred “${uri.path.name}”.`
                    : `Removed “${uri.path.name}” from starred.`);
                await this.ensureInExplorer();
            },
            isEnabled: (widget?: Widget) =>
                !!this.markdownUriFrom(widget) || !!this.markdownUriFrom(this.editorManager.currentEditor),
            isVisible: (widget?: Widget) => {
                if (widget) {
                    return !!this.markdownUriFrom(widget);
                }
                return true;
            }
        });
        commands.registerCommand(StarredCommands.FOCUS, {
            execute: async () => {
                await this.openView({ activate: true, reveal: true });
            }
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: StarredCommands.TOGGLE.id,
            label: 'Star/Unstar Note'
        });
        menus.registerMenuAction(['navigator-context-menu', 'navigation'], {
            commandId: StarredCommands.TOGGLE.id,
            label: 'Star/Unstar Note',
            order: '9'
        });
    }

    protected markdownUriFrom(widget: Widget | undefined): import('@theia/core/lib/common/uri').default | undefined {
        if (widget instanceof EditorWidget && widget.editor.uri.path.ext.toLowerCase() === '.md') {
            return widget.editor.uri;
        }
        return undefined;
    }
}
