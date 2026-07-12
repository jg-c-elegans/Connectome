import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    ApplicationShell,
    FrontendApplicationContribution,
    ViewContainer,
    WidgetManager
} from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common';
import { ensureLeftActivity } from '../activity/ensure-left-activity';
import { LIBRARY_VIEW_CONTAINER_ID, LIBRARY_VIEW_RANK } from './library-view-container';

@injectable()
export class LibraryContribution extends AbstractViewContribution<ViewContainer>
    implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    constructor() {
        super({
            widgetId: LIBRARY_VIEW_CONTAINER_ID,
            widgetName: 'Library',
            defaultWidgetOptions: { area: 'left', rank: LIBRARY_VIEW_RANK },
            toggleCommandId: 'connectome.library.sidebar'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.ensureActivity();
    }

    onStart(): void {
        void this.ensureActivity();
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
    }

    protected async ensureActivity(): Promise<ViewContainer> {
        return ensureLeftActivity(
            this.shell,
            this.widgetManager,
            LIBRARY_VIEW_CONTAINER_ID,
            LIBRARY_VIEW_RANK
        );
    }
}
