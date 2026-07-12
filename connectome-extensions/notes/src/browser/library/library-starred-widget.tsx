import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { StarredNotesService } from '../starred/starred-notes-service';

@injectable()
export class LibraryStarredWidget extends ReactWidget {

    static readonly ID = 'connectome-library-starred';
    static readonly LABEL = 'Starred';

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(StarredNotesService)
    protected readonly starred: StarredNotesService;

    @inject(LabelProvider)
    protected readonly labels: LabelProvider;

    @postConstruct()
    protected init(): void {
        this.id = LibraryStarredWidget.ID;
        this.title.label = LibraryStarredWidget.LABEL;
        this.title.caption = 'Starred notes (same list as Explorer)';
        this.title.iconClass = codicon('star-full');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.starred.onDidChange(() => this.update()));
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        const uris = this.starred.getStarredUris();
        if (uris.length === 0) {
            return <div className='connectome-notes-empty'>
                No starred notes yet.<br />
                Star a note from the editor tab bar or Explorer.
            </div>;
        }
        return <div className='connectome-notes-list'>
            {uris.map(uri => this.renderItem(uri))}
        </div>;
    }

    protected renderItem(uri: URI): React.ReactNode {
        const detail = this.labels.getLongName(uri) || uri.path.toString();
        return <div className='connectome-notes-occurrence' key={uri.toString()}
            title={detail}
            onClick={() => this.editorManager.open(uri)}>
            <span className={codicon('star-full') + ' connectome-notes-icon connectome-starred-icon'} />
            <span className='connectome-notes-group-name'>{uri.path.name}</span>
            <span className='connectome-notes-group-detail'>{uri.path.base}</span>
        </div>;
    }
}
