import { injectable } from '@theia/core/shared/inversify';
import { ScriptsSectionWidget } from './scripts-section-widget';
import { ScriptItem } from './scripts-view-container';

@injectable()
export class FavoriteScriptsWidget extends ScriptsSectionWidget {
    static readonly ID = 'connectome-scripts-favorites';
    static readonly LABEL = 'Favorites';

    protected readonly sectionLabel = FavoriteScriptsWidget.LABEL;
    protected readonly sectionIcon = 'star-full';
    protected readonly emptyHint = 'No favorites yet. Right-click a script and choose "Add to Favorites".';
    protected readonly showSortToggle = false;

    protected get sectionId(): string {
        return FavoriteScriptsWidget.ID;
    }

    protected getItems(): ScriptItem[] {
        return this.service.getFavorites();
    }
}
