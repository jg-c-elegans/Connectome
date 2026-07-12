import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    ApplicationShell,
    FrontendApplicationContribution,
    ViewContainer,
    WidgetManager,
    codicon
} from '@theia/core/lib/browser';
import { Command, CommandRegistry, MenuModelRegistry } from '@theia/core/lib/common';
import { MessageService } from '@theia/core/lib/common/message-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { ensureLeftActivity } from './ensure-left-activity';
import { ScriptsService } from './scripts-service';
import { runScript } from './scripts-runner';
import {
    SCRIPTS_CONTEXT_MENU,
    SCRIPTS_VIEW_CONTAINER_ID,
    SCRIPTS_VIEW_RANK,
    ScriptItem
} from './scripts-view-container';

export namespace ScriptsCommands {
    export const RUN: Command = {
        id: 'connectome.scripts.run',
        label: 'Run'
    };
    export const ADD_FAVORITE: Command = {
        id: 'connectome.scripts.addFavorite',
        label: 'Add to Favorites'
    };
    export const REMOVE_FAVORITE: Command = {
        id: 'connectome.scripts.removeFavorite',
        label: 'Remove from Favorites'
    };
    export const DELETE: Command = {
        id: 'connectome.scripts.delete',
        label: 'Delete'
    };
    /** Data-provider command (no UI) so the Dashboard window can read favorited scripts
     * without a compile-time dependency on connectome-scripts-ext. */
    export const GET_FAVORITES: Command = {
        id: 'connectome.scripts.getFavorites'
    };
}

@injectable()
export class ScriptsContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ScriptsService)
    protected readonly service: ScriptsService;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected runListener?: (event: Event) => void;

    constructor() {
        super({
            widgetId: SCRIPTS_VIEW_CONTAINER_ID,
            widgetName: 'Scripts',
            defaultWidgetOptions: { area: 'left', rank: SCRIPTS_VIEW_RANK },
            toggleCommandId: 'connectome.scripts.sidebar'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.ensureActivity();
    }

    onStart(): void {
        void this.ensureActivity();
        this.runListener = (event: Event) => {
            const name = (event as CustomEvent<string>).detail;
            void this.runByName(name);
        };
        window.addEventListener('connectome-scripts-run', this.runListener);
    }

    onStop(): void {
        if (this.runListener) {
            window.removeEventListener('connectome-scripts-run', this.runListener);
            this.runListener = undefined;
        }
    }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(this.shell, this.widgetManager, SCRIPTS_VIEW_CONTAINER_ID, SCRIPTS_VIEW_RANK);
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);

        commands.registerCommand(ScriptsCommands.RUN, {
            execute: (item?: ScriptItem) => item && this.runByName(item.name),
            isVisible: (item?: ScriptItem) => !!item?.name,
            isEnabled: (item?: ScriptItem) => !!item?.name
        });

        commands.registerCommand(ScriptsCommands.ADD_FAVORITE, {
            execute: (item?: ScriptItem) => item && this.service.toggleFavorite(item.name),
            isVisible: (item?: ScriptItem) => !!item?.name && !item.favorite,
            isEnabled: (item?: ScriptItem) => !!item?.name && !item.favorite
        });

        commands.registerCommand(ScriptsCommands.REMOVE_FAVORITE, {
            execute: (item?: ScriptItem) => item && this.service.toggleFavorite(item.name),
            isVisible: (item?: ScriptItem) => !!item?.name && !!item.favorite,
            isEnabled: (item?: ScriptItem) => !!item?.name && !!item.favorite
        });

        commands.registerCommand(ScriptsCommands.DELETE, {
            execute: async (item?: ScriptItem) => {
                if (!item) {
                    return;
                }
                await this.service.deleteScript(item.name);
                await this.messages.info(`Removed "${item.name}" from Scripts.`);
            },
            isVisible: (item?: ScriptItem) => !!item?.name,
            isEnabled: (item?: ScriptItem) => !!item?.name
        });

        commands.registerCommand(ScriptsCommands.GET_FAVORITES, {
            execute: () => this.service.getFavorites()
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(SCRIPTS_CONTEXT_MENU, {
            commandId: ScriptsCommands.RUN.id,
            label: 'Run',
            icon: codicon('play'),
            order: '0'
        });
        menus.registerMenuAction(SCRIPTS_CONTEXT_MENU, {
            commandId: ScriptsCommands.ADD_FAVORITE.id,
            label: 'Add to Favorites',
            order: '1'
        });
        menus.registerMenuAction(SCRIPTS_CONTEXT_MENU, {
            commandId: ScriptsCommands.REMOVE_FAVORITE.id,
            label: 'Remove from Favorites',
            order: '1'
        });
        menus.registerMenuAction(SCRIPTS_CONTEXT_MENU, {
            commandId: ScriptsCommands.DELETE.id,
            label: 'Delete',
            order: '2'
        });
    }

    protected async runByName(name: string): Promise<void> {
        const uri = this.service.getScriptUri(name);
        if (!uri) {
            return;
        }
        const fsPath = FileUri.fsPath(uri);
        const language = this.service.languageOf(name);
        try {
            await runScript(this.terminalService, fsPath, language, `Run: ${name}`);
        } catch (err) {
            console.error('[scripts] Failed to run script:', err);
            await this.messages.error(`Could not run "${name}".`);
        }
    }
}
