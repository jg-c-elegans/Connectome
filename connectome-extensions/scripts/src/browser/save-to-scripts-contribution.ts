import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    Emitter,
    MenuContribution,
    MenuModelRegistry,
} from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { EditorManager } from '@theia/editor/lib/browser';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ScriptsService } from './scripts-service';

export namespace SaveToScriptsCommands {
    export const SAVE: Command = {
        id: 'connectome.scripts.saveActiveFile',
        category: 'Scripts',
        label: 'Save to Scripts'
    };
}

const SCRIPT_EXTS = new Set(['.py', '.ps1']);

@injectable()
export class SaveToScriptsContribution implements CommandContribution, MenuContribution, TabBarToolbarContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(ScriptsService)
    protected readonly service: ScriptsService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected readonly onToolbarChangeEmitter = new Emitter<void>();

    @postConstruct()
    protected init(): void {
        this.editorManager.onCurrentEditorChanged(() => this.onToolbarChangeEmitter.fire());
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: 'connectome-scripts-save-toolbar',
            command: SaveToScriptsCommands.SAVE.id,
            tooltip: 'Save to Scripts',
            group: 'navigation',
            priority: 0,
            icon: codicon('star-empty'),
            isVisible: widget => this.isScriptEditorActive(widget),
            onDidChange: this.onToolbarChangeEmitter.event
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SaveToScriptsCommands.SAVE, {
            execute: () => this.saveActiveFile(),
            isEnabled: () => this.isScriptEditorActive(),
            isVisible: () => this.isScriptEditorActive(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.MODIFICATION, {
            commandId: SaveToScriptsCommands.SAVE.id,
            label: 'Save to Scripts',
            order: 'connectome-scripts',
        });
    }

    protected isScriptEditorActive(widget?: unknown): boolean {
        const uri = this.editorManager.currentEditor?.editor.uri;
        return !!uri && SCRIPT_EXTS.has(uri.path.ext.toLowerCase());
    }

    protected async saveActiveFile(): Promise<void> {
        const widget = this.editorManager.currentEditor;
        const uri = widget?.editor.uri;
        if (!widget || !uri || !SCRIPT_EXTS.has(uri.path.ext.toLowerCase())) {
            return;
        }
        const content = widget.editor.document.getText();
        const saved = await this.service.saveToScripts(uri.path.base, content);
        if (saved) {
            await this.messages.info(`Saved "${saved}" to Scripts.`);
        } else {
            await this.messages.warn('Open a workspace folder before saving to Scripts.');
        }
    }
}
