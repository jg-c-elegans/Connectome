import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, DisposableCollection } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { ApplicationShell } from '@theia/core/lib/browser';
import { EditorWidget } from '@theia/editor/lib/browser';

const MAX_CLOSED = 40;

/**
 * Tracks recently closed markdown editors for the History activity.
 * Session-scoped list (not persisted across restarts in v1).
 */
@injectable()
export class NoteHistoryService {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected closed: { uri: string; closedAt: number }[] = [];
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.shell.onDidRemoveWidget(widget => {
            if (!(widget instanceof EditorWidget)) {
                return;
            }
            const uri = widget.getResourceUri();
            if (!uri || uri.path.ext.toLowerCase() !== '.md') {
                return;
            }
            this.recordClosed(uri);
        }));
    }

    protected recordClosed(uri: URI): void {
        const key = uri.toString();
        this.closed = [
            { uri: key, closedAt: Date.now() },
            ...this.closed.filter(e => e.uri !== key)
        ].slice(0, MAX_CLOSED);
        this.onDidChangeEmitter.fire();
    }

    getRecentlyClosed(): { uri: URI; closedAt: number }[] {
        return this.closed.map(e => ({ uri: new URI(e.uri), closedAt: e.closedAt }));
    }
}
