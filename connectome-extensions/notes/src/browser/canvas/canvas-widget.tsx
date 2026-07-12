import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon, QuickInputService } from '@theia/core/lib/browser';
import { Saveable, SaveableSource } from '@theia/core/lib/browser/saveable';
import { Navigatable } from '@theia/core/lib/browser/navigatable-types';
import { Emitter, Event } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { MessageService } from '@theia/core/lib/common/message-service';
import {
    CanvasDocument, CanvasEdge, CanvasNode, CanvasNoteNode, CanvasTextNode,
    emptyCanvasDocument, newId, parseCanvasDocument, serializeCanvasDocument
} from './canvas-model';

export const CANVAS_WIDGET_FACTORY_ID = 'connectome-canvas';

@injectable()
export class CanvasWidget extends ReactWidget implements Saveable, SaveableSource, Navigatable {

    static readonly ID = CANVAS_WIDGET_FACTORY_ID;
    static readonly LABEL = 'Canvas';

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    protected uri: URI | undefined;
    protected doc: CanvasDocument = emptyCanvasDocument();
    protected _dirty = false;
    protected selectedId: string | undefined;
    protected linkFromId: string | undefined;
    protected drag: { id: string; ox: number; oy: number; startX: number; startY: number } | undefined;
    protected pan: { sx: number; sy: number; vx: number; vy: number } | undefined;
    /** Live preview snippets for note cards (node id → body excerpt). */
    protected notePreviews = new Map<string, string>();

    protected readonly onDirtyChangedEmitter = new Emitter<void>();
    readonly onDirtyChanged: Event<void> = this.onDirtyChangedEmitter.event;
    protected readonly onContentChangedEmitter = new Emitter<void>();
    readonly onContentChanged: Event<void> = this.onContentChangedEmitter.event;

    get saveable(): Saveable {
        return this;
    }

    get dirty(): boolean {
        return this._dirty;
    }

    @postConstruct()
    protected init(): void {
        this.id = CanvasWidget.ID + ':' + Math.random().toString(36).slice(2, 8);
        this.title.label = CanvasWidget.LABEL;
        this.title.caption = 'Connectome Canvas';
        this.title.iconClass = codicon('type-hierarchy-sub');
        this.title.closable = true;
        this.addClass('connectome-canvas-widget');
        this.node.tabIndex = 0;
        this.update();
    }

    getResourceUri(): URI | undefined {
        return this.uri;
    }

    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.uri?.withPath(resourceUri.path);
    }

    async setUri(uri: URI): Promise<void> {
        this.uri = uri;
        this.title.label = uri.path.base;
        this.title.caption = uri.path.toString();
        this.id = CanvasWidget.ID + ':' + uri.toString();
        try {
            if (await this.fileService.exists(uri)) {
                const content = await this.fileService.read(uri);
                this.doc = parseCanvasDocument(content.value);
            } else {
                this.doc = emptyCanvasDocument();
                await this.fileService.create(uri, serializeCanvasDocument(this.doc));
            }
            this.setDirty(false);
        } catch (err) {
            console.error('[connectome-canvas] failed to load', err);
            this.doc = emptyCanvasDocument();
            this.setDirty(false);
        }
        await this.refreshNotePreviews();
        this.update();
    }

    protected setDirty(value: boolean): void {
        if (this._dirty === value) {
            return;
        }
        this._dirty = value;
        this.onDirtyChangedEmitter.fire();
        this.update();
    }

    protected markDirty(): void {
        this.setDirty(true);
        this.onContentChangedEmitter.fire();
        this.update();
    }

    async save(): Promise<void> {
        if (!this.uri) {
            return;
        }
        const text = serializeCanvasDocument(this.doc);
        if (await this.fileService.exists(this.uri)) {
            await this.fileService.write(this.uri, text);
        } else {
            await this.fileService.create(this.uri, text);
        }
        this.setDirty(false);
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        // Note files may have been edited while the canvas was in the background.
        this.refreshNotePreviews().then(() => this.update());
    }

    // --- mutations ---

    async addNoteCard(): Promise<void> {
        const uri = await this.pickOrCreateMarkdownNote();
        if (!uri) {
            return;
        }
        const rel = this.toRelativePath(uri);
        const node: CanvasNoteNode = {
            id: newId('n'),
            type: 'note',
            notePath: rel,
            title: uri.path.name,
            x: (-this.doc.viewport.x + 80) / (this.doc.viewport.zoom || 1),
            y: (-this.doc.viewport.y + 80) / (this.doc.viewport.zoom || 1),
            w: 220,
            h: 140
        };
        this.doc = { ...this.doc, nodes: [...this.doc.nodes, node] };
        this.selectedId = node.id;
        await this.loadNotePreview(node);
        this.markDirty();
    }

    addTextCard(): void {
        const node: CanvasTextNode = {
            id: newId('n'),
            type: 'text',
            text: 'New card',
            x: (-this.doc.viewport.x + 120) / (this.doc.viewport.zoom || 1),
            y: (-this.doc.viewport.y + 120) / (this.doc.viewport.zoom || 1),
            w: 180,
            h: 100
        };
        this.doc = { ...this.doc, nodes: [...this.doc.nodes, node] };
        this.selectedId = node.id;
        this.markDirty();
    }

    /**
     * Prompt for a note path; create the markdown file if it does not exist.
     */
    protected async pickOrCreateMarkdownNote(): Promise<URI | undefined> {
        const input = await this.quickInput.input({
            prompt: 'Note name or path (created if missing), e.g. ideas/foo or foo.md',
            placeHolder: 'my-note.md'
        });
        if (!input || !input.trim()) {
            return undefined;
        }
        let path = input.trim().replace(/\\/g, '/');
        // Allow bare title "My Note" → "My Note.md"
        if (!path.toLowerCase().endsWith('.md')) {
            path += '.md';
        }
        // Sanitize path segments lightly (keep / for folders)
        path = path.split('/').map(seg => seg.replace(/[<>:"|?*]/g, '_').trim() || 'note').join('/');
        const roots = this.workspace.tryGetRoots();
        if (roots.length === 0) {
            await this.messages.warn('Open a workspace folder first.');
            return undefined;
        }
        const uri = roots[0].resource.resolve(path);
        if (!await this.fileService.exists(uri)) {
            const parent = uri.parent;
            if (!await this.fileService.exists(parent)) {
                await this.fileService.createFolder(parent);
            }
            const title = uri.path.name;
            const body = `# ${title}\n\n`;
            await this.fileService.create(uri, body);
            await this.messages.info(`Created note “${path}”.`);
        }
        return uri;
    }

    protected async refreshNotePreviews(): Promise<void> {
        this.notePreviews.clear();
        await Promise.all(
            this.doc.nodes
                .filter((n): n is CanvasNoteNode => n.type === 'note')
                .map(n => this.loadNotePreview(n))
        );
    }

    protected async loadNotePreview(node: CanvasNoteNode): Promise<void> {
        const uri = this.resolveNotePath(node.notePath);
        if (!uri) {
            this.notePreviews.set(node.id, '(unresolved path)');
            return;
        }
        try {
            if (!await this.fileService.exists(uri)) {
                this.notePreviews.set(node.id, '(missing file)');
                return;
            }
            const content = await this.fileService.read(uri);
            this.notePreviews.set(node.id, excerptNoteBody(content.value));
            // Keep title in sync with filename if empty
            if (!node.title) {
                node.title = uri.path.name;
            }
        } catch {
            this.notePreviews.set(node.id, '(unreadable)');
        }
    }

    protected toRelativePath(uri: URI): string {
        for (const root of this.workspace.tryGetRoots()) {
            const rel = root.resource.relative(uri);
            if (rel) {
                return rel.toString();
            }
        }
        return uri.path.toString();
    }

    protected deleteSelection(): void {
        if (!this.selectedId) {
            return;
        }
        const id = this.selectedId;
        this.doc = {
            ...this.doc,
            nodes: this.doc.nodes.filter(n => n.id !== id),
            edges: this.doc.edges.filter(e => e.from !== id && e.to !== id)
        };
        this.selectedId = undefined;
        this.linkFromId = undefined;
        this.markDirty();
    }

    protected beginLink(fromId: string): void {
        this.linkFromId = fromId;
        this.update();
    }

    protected completeLink(toId: string): void {
        if (!this.linkFromId || this.linkFromId === toId) {
            this.linkFromId = undefined;
            this.update();
            return;
        }
        const exists = this.doc.edges.some(e =>
            (e.from === this.linkFromId && e.to === toId) ||
            (e.from === toId && e.to === this.linkFromId));
        if (!exists) {
            const edge: CanvasEdge = { id: newId('e'), from: this.linkFromId, to: toId };
            this.doc = { ...this.doc, edges: [...this.doc.edges, edge] };
            this.markDirty();
        }
        this.linkFromId = undefined;
        this.update();
    }

    protected async openNoteNode(node: CanvasNoteNode): Promise<void> {
        const uri = this.resolveNotePath(node.notePath);
        if (!uri) {
            await this.messages.warn(`Could not resolve note path: ${node.notePath}`);
            return;
        }
        await this.editorManager.open(uri);
    }

    protected resolveNotePath(notePath: string): URI | undefined {
        if (notePath.includes('://')) {
            return new URI(notePath);
        }
        const roots = this.workspace.tryGetRoots();
        if (roots.length === 0) {
            return undefined;
        }
        return roots[0].resource.resolve(notePath.replace(/\\/g, '/'));
    }

    // --- pointer handlers ---

    protected onWheel = (e: React.WheelEvent): void => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const zoom = Math.min(3, Math.max(0.25, this.doc.viewport.zoom * factor));
        this.doc = {
            ...this.doc,
            viewport: { ...this.doc.viewport, zoom }
        };
        this.markDirty();
    };

    protected onBackgroundDown = (e: React.MouseEvent): void => {
        if (e.button !== 0) {
            return;
        }
        const target = e.target as HTMLElement;
        // Toolbar / buttons must not clear selection or start a pan.
        if (target.closest('.connectome-canvas-toolbar') || target.closest('button')) {
            return;
        }
        if (target.closest('.connectome-canvas-card')) {
            return;
        }
        // Background click cancels link mode without panning.
        if (this.linkFromId) {
            this.linkFromId = undefined;
            this.update();
            return;
        }
        this.selectedId = undefined;
        this.pan = {
            sx: e.clientX,
            sy: e.clientY,
            vx: this.doc.viewport.x,
            vy: this.doc.viewport.y
        };
        this.update();
    };

    protected onMouseMove = (e: React.MouseEvent): void => {
        // While linking, never pan or drag — only click targets complete the edge.
        if (this.linkFromId) {
            return;
        }
        if (this.pan) {
            const dx = e.clientX - this.pan.sx;
            const dy = e.clientY - this.pan.sy;
            this.doc = {
                ...this.doc,
                viewport: {
                    ...this.doc.viewport,
                    x: this.pan.vx + dx,
                    y: this.pan.vy + dy
                }
            };
            this.update();
            return;
        }
        if (this.drag) {
            const z = this.doc.viewport.zoom;
            const dx = (e.clientX - this.drag.startX) / z;
            const dy = (e.clientY - this.drag.startY) / z;
            this.doc = {
                ...this.doc,
                nodes: this.doc.nodes.map(n =>
                    n.id === this.drag!.id
                        ? { ...n, x: this.drag!.ox + dx, y: this.drag!.oy + dy }
                        : n)
            };
            this.update();
        }
    };

    protected onMouseUp = (): void => {
        if (this.linkFromId) {
            // Don't clear link mode on mouseup — wait for a card click.
            this.drag = undefined;
            this.pan = undefined;
            return;
        }
        if (this.drag || this.pan) {
            if (this.drag) {
                this.markDirty();
            } else if (this.pan) {
                this.markDirty();
            }
        }
        this.drag = undefined;
        this.pan = undefined;
    };

    protected onCardDown = (e: React.MouseEvent, node: CanvasNode): void => {
        e.stopPropagation();
        e.preventDefault();
        if (this.linkFromId) {
            this.completeLink(node.id);
            return;
        }
        this.selectedId = node.id;
        this.drag = {
            id: node.id,
            ox: node.x,
            oy: node.y,
            startX: e.clientX,
            startY: e.clientY
        };
        this.update();
    };

    protected onCardDoubleClick = (node: CanvasNode): void => {
        if (node.type === 'note') {
            this.openNoteNode(node);
        } else {
            this.editTextCard(node);
        }
    };

    protected async editTextCard(node: CanvasTextNode): Promise<void> {
        const text = await this.quickInput.input({
            prompt: 'Card text',
            value: node.text
        });
        if (text === undefined) {
            return;
        }
        this.doc = {
            ...this.doc,
            nodes: this.doc.nodes.map(n =>
                n.id === node.id && n.type === 'text' ? { ...n, text } : n)
        };
        this.markDirty();
    }

    // --- render ---

    protected render(): React.ReactNode {
        const { viewport, nodes, edges } = this.doc;
        const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
        return <div className='connectome-canvas-root'
            onWheel={this.onWheel}
            onMouseDown={this.onBackgroundDown}
            onMouseMove={this.onMouseMove}
            onMouseUp={this.onMouseUp}
            onMouseLeave={this.onMouseUp}
            onKeyDown={e => {
                if (e.key === 'Escape' && this.linkFromId) {
                    e.preventDefault();
                    this.linkFromId = undefined;
                    this.update();
                    return;
                }
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    this.deleteSelection();
                }
            }}>
            <div className='connectome-canvas-toolbar'
                onMouseDown={e => e.stopPropagation()}>
                <button className='theia-button' onClick={() => this.addNoteCard()}
                    title='Add a card linked to a markdown note'>
                    + Note
                </button>
                <button className='theia-button secondary' onClick={() => this.addTextCard()}
                    title='Add a free-text card'>
                    + Text
                </button>
                <button className={'theia-button' + (this.linkFromId ? '' : ' secondary')}
                    disabled={!this.selectedId && !this.linkFromId}
                    onClick={e => {
                        e.stopPropagation();
                        if (this.linkFromId) {
                            this.linkFromId = undefined;
                            this.update();
                            return;
                        }
                        if (this.selectedId) {
                            this.beginLink(this.selectedId);
                        }
                    }}
                    title={this.linkFromId
                        ? 'Click a card to complete the link (click again to cancel)'
                        : 'Select a card, then Link, then click another card'}>
                    {this.linkFromId ? 'Linking… (click target)' : 'Link'}
                </button>
                <button className='theia-button secondary'
                    disabled={!this.selectedId}
                    onClick={() => this.deleteSelection()}
                    title='Delete selected card'>
                    Delete
                </button>
                <button className='theia-button secondary' onClick={() => this.save()}
                    title='Save canvas'>
                    Save{this._dirty ? ' •' : ''}
                </button>
                <span className='connectome-canvas-hint'>
                    {this.linkFromId
                        ? 'Click another card to connect · Esc or Link again to cancel'
                        : 'Drag canvas to pan · Wheel to zoom · Double-click note to open'}
                </span>
            </div>
            <div className={'connectome-canvas-surface' + (this.linkFromId ? ' linking' : '')}>
                <div className='connectome-canvas-world' style={{ transform }}>
                    <svg className='connectome-canvas-edges' width='10000' height='10000'
                        style={{ overflow: 'visible', position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                        <defs>
                            <marker id='connectome-arrow' markerWidth='8' markerHeight='8'
                                refX='6' refY='3' orient='auto' markerUnits='strokeWidth'>
                                <path d='M0,0 L6,3 L0,6 Z' fill='var(--theia-focusBorder, #5a36fa)' />
                            </marker>
                        </defs>
                        {edges.map(edge => this.renderEdge(edge, nodes))}
                    </svg>
                    {nodes.map(node => this.renderCard(node))}
                </div>
            </div>
        </div>;
    }

    protected renderEdge(edge: CanvasEdge, nodes: CanvasNode[]): React.ReactNode {
        const from = nodes.find(n => n.id === edge.from);
        const to = nodes.find(n => n.id === edge.to);
        if (!from || !to) {
            return null;
        }
        const x1 = from.x + from.w / 2;
        const y1 = from.y + from.h / 2;
        const x2 = to.x + to.w / 2;
        const y2 = to.y + to.h / 2;
        return <line key={edge.id}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke='var(--theia-focusBorder, #5a36fa)'
            strokeWidth={2}
            markerEnd='url(#connectome-arrow)' />;
    }

    protected renderCard(node: CanvasNode): React.ReactNode {
        const selected = this.selectedId === node.id;
        const title = node.type === 'note'
            ? (node.title || node.notePath.split('/').pop() || node.notePath)
            : 'Text';
        const body = node.type === 'note'
            ? (this.notePreviews.get(node.id) ?? 'Loading…')
            : node.text;
        const subtitle = node.type === 'note' ? node.notePath : undefined;
        return <div
            key={node.id}
            className={'connectome-canvas-card' + (selected ? ' selected' : '') + (node.type === 'note' ? ' note' : ' text')}
            style={{ left: node.x, top: node.y, width: node.w, minHeight: node.h }}
            onMouseDown={e => this.onCardDown(e, node)}
            onDoubleClick={() => this.onCardDoubleClick(node)}
            title={node.type === 'note' ? 'Double-click to open note' : 'Double-click to edit'}>
            <div className='connectome-canvas-card-title'>
                <span className={codicon(node.type === 'note' ? 'markdown' : 'note') + ' connectome-notes-icon'} />
                <span>{title}</span>
            </div>
            {subtitle &&
                <div className='connectome-canvas-card-path'>{subtitle}</div>}
            <div className='connectome-canvas-card-body'>{body}</div>
        </div>;
    }
}

/** First meaningful lines of a note body for canvas card previews. */
function excerptNoteBody(text: string, maxLines = 6, maxChars = 220): string {
    let body = text;
    if (body.startsWith('---')) {
        const end = body.indexOf('\n---', 3);
        if (end >= 0) {
            body = body.substring(end + 4);
        }
    }
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const kept: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip a single leading ATX title (shown as card title)
        if (kept.length === 0 && /^#\s+/.test(trimmed)) {
            continue;
        }
        if (!trimmed && kept.length === 0) {
            continue;
        }
        kept.push(line);
        if (kept.length >= maxLines) {
            break;
        }
    }
    let excerpt = kept.join('\n').trim();
    if (!excerpt) {
        return '(empty note)';
    }
    if (excerpt.length > maxChars) {
        excerpt = excerpt.slice(0, maxChars - 1) + '…';
    }
    return excerpt;
}
