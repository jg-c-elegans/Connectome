import { injectable, inject } from '@theia/core/shared/inversify';
import {
    Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry
} from '@theia/core/lib/common';
import { CommonMenus, OpenerService, open } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QuickInputService } from '@theia/core/lib/browser';
import { emptyCanvasDocument, serializeCanvasDocument } from './canvas-model';

export namespace CanvasCommands {
    export const NEW: Command = {
        id: 'connectomeNotes.canvas.new',
        label: 'Notes: New Canvas'
    };
}

@injectable()
export class CanvasContribution implements CommandContribution, MenuContribution {

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CanvasCommands.NEW, {
            execute: () => this.createCanvas(),
            isEnabled: () => this.workspace.tryGetRoots().length > 0
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_NEW, {
            commandId: CanvasCommands.NEW.id,
            label: 'New Canvas',
            order: '4'
        });
    }

    protected async createCanvas(): Promise<void> {
        const roots = this.workspace.tryGetRoots();
        if (roots.length === 0) {
            await this.messages.warn('Open a workspace folder first.');
            return;
        }
        const name = await this.quickInput.input({
            prompt: 'Canvas file name',
            placeHolder: 'board',
            value: 'board'
        });
        if (name === undefined) {
            return;
        }
        let base = name.trim() || 'board';
        base = base.replace(/[/\\]/g, '_');
        if (!base.toLowerCase().endsWith('.canvas.json')) {
            base = base.replace(/\.json$/i, '') + '.canvas.json';
        }
        const uri = roots[0].resource.resolve(base);
        if (await this.fileService.exists(uri)) {
            await this.messages.warn(`File already exists: ${base}`);
            await open(this.openerService, uri);
            return;
        }
        const body = serializeCanvasDocument(emptyCanvasDocument());
        await this.fileService.create(uri, body);
        await open(this.openerService, uri);
    }
}
