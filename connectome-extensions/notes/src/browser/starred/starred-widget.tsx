import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { StarredNotesService } from './starred-notes-service';

@injectable()
export class StarredWidget extends ReactWidget {

    static readonly ID = 'connectome-starred-notes';
    static readonly LABEL = 'Starred';

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(StarredNotesService)
    protected readonly starred: StarredNotesService;

    @inject(LabelProvider)
    protected readonly labels: LabelProvider;

    @postConstruct()
    protected init(): void {
        this.id = StarredWidget.ID;
        this.title.label = StarredWidget.LABEL;
        this.title.caption = 'Starred / bookmarked notes in this workspace';
        this.title.iconClass = codicon('star-full');
        this.title.closable = true;
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
                Click the <strong>star</strong> in the editor tab bar (or right‑click a file) to pin notes here.
            </div>;
        }
        return <div className='connectome-notes-list'>
            {uris.map(uri => this.renderItem(uri))}
        </div>;
    }

    protected renderItem(uri: URI): React.ReactNode {
        const name = uri.path.name;
        const detail = this.labels.getLongName(uri) || uri.path.toString();
        return <div className='connectome-notes-occurrence connectome-notes-occurrence-row' key={uri.toString()}>
            <span className='connectome-notes-snippet' style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}
                onClick={() => this.editorManager.open(uri)}
                title={detail}>
                <span className={codicon('star-full') + ' connectome-notes-icon connectome-starred-icon'} />
                <span className='connectome-notes-group-name'>{name}</span>
                <span className='connectome-notes-group-detail'>{uri.path.base}</span>
            </span>
            <button className='theia-button secondary connectome-notes-link-btn'
                title='Remove from starred'
                onClick={e => { e.stopPropagation(); this.starred.unstar(uri); }}>
                Remove
            </button>
        </div>;
    }
}
