import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { EditorManager } from '@theia/editor/lib/browser';
import { NoteIndexService } from '../note-index-service';
import { GraphData, GraphService } from './graph-service';
import { GraphCanvas, GraphViewport, PositionedNode } from './graph-canvas';
import { computeForceLayout } from './graph-layout';

@injectable()
export class GraphWidget extends ReactWidget {

    static readonly ID = 'connectome-graph-workspace';
    static readonly LABEL = 'Graph';

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(GraphService)
    protected readonly graphService: GraphService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected data: GraphData = { nodes: [], edges: [] };
    protected positions = new Map<string, { x: number; y: number }>();
    protected dragOverride = new Map<string, { x: number; y: number }>();
    protected lastLayoutKey = '';
    protected loading = true;

    protected viewport: GraphViewport = { x: 0, y: 0, zoom: 1 };
    protected pan: { sx: number; sy: number; vx: number; vy: number } | undefined;
    protected drag: { id: string; ox: number; oy: number; startX: number; startY: number; moved: boolean } | undefined;
    protected suppressClick = false;

    @postConstruct()
    protected init(): void {
        this.id = GraphWidget.ID;
        this.title.label = GraphWidget.LABEL;
        this.title.caption = 'Whole-workspace note link graph';
        this.title.iconClass = codicon('graph-scatter');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.node.tabIndex = 0;
        this.toDispose.push(this.graphService.onDidChangeGraph(() => this.refresh()));
        void this.initialize();
    }

    protected async initialize(): Promise<void> {
        this.loading = true;
        this.update();
        await this.index.initialize();
        this.loading = false;
        this.refresh();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.refresh();
    }

    protected refresh(): void {
        this.data = this.graphService.getGraphData();
        const layoutKey = this.data.nodes.map(n => n.id).sort().join(',') + '|' + this.data.edges.length;
        if (layoutKey !== this.lastLayoutKey) {
            this.lastLayoutKey = layoutKey;
            const pinnedMap = new Map<string, { x: number; y: number }>();
            for (const node of this.data.nodes) {
                if (node.fixedPosition) {
                    pinnedMap.set(node.id, node.fixedPosition);
                }
            }
            this.positions = computeForceLayout(this.data.nodes.map(n => n.id), this.data.edges, pinnedMap);
            this.dragOverride.clear();
        }
        this.update();
    }

    protected resetLayout(): void {
        // Clear local layout/viewport first so the service change event re-lays out cleanly
        // and re-adds nodes that were right-click-hidden.
        this.lastLayoutKey = '';
        this.dragOverride.clear();
        this.viewport = { x: 0, y: 0, zoom: 1 };
        void this.graphService.resetLayoutState();
    }

    protected positionedNodes(): PositionedNode[] {
        return this.data.nodes.map(node => {
            const pos = this.dragOverride.get(node.id) ?? this.positions.get(node.id) ?? { x: 0, y: 0 };
            return { ...node, x: pos.x, y: pos.y };
        });
    }

    // --- pointer handlers ---

    protected onWheel = (e: React.WheelEvent): void => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const zoom = Math.min(3, Math.max(0.25, this.viewport.zoom * factor));
        this.viewport = { ...this.viewport, zoom };
        this.update();
    };

    protected onBackgroundDown = (e: React.MouseEvent): void => {
        if (e.button !== 0) {
            return;
        }
        const target = e.target as HTMLElement;
        if (target.closest('.connectome-graph-toolbar') || target.closest('button')) {
            return;
        }
        if (target.closest('.connectome-graph-node')) {
            return;
        }
        this.pan = { sx: e.clientX, sy: e.clientY, vx: this.viewport.x, vy: this.viewport.y };
    };

    protected onMouseMove = (e: React.MouseEvent): void => {
        if (this.pan) {
            const dx = e.clientX - this.pan.sx;
            const dy = e.clientY - this.pan.sy;
            this.viewport = { ...this.viewport, x: this.pan.vx + dx, y: this.pan.vy + dy };
            this.update();
            return;
        }
        if (this.drag) {
            const z = this.viewport.zoom || 1;
            const dx = (e.clientX - this.drag.startX) / z;
            const dy = (e.clientY - this.drag.startY) / z;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                this.drag.moved = true;
            }
            this.dragOverride.set(this.drag.id, { x: this.drag.ox + dx, y: this.drag.oy + dy });
            this.update();
        }
    };

    protected onMouseUp = (): void => {
        if (this.drag) {
            if (this.drag.moved) {
                this.suppressClick = true;
                const pos = this.dragOverride.get(this.drag.id);
                const node = this.data.nodes.find(n => n.id === this.drag!.id);
                if (pos && node) {
                    void this.graphService.pinNode(node.uri, pos);
                }
            }
            this.drag = undefined;
        }
        this.pan = undefined;
    };

    protected onNodeDown = (e: React.MouseEvent, node: PositionedNode): void => {
        if (e.button !== 0) {
            return;
        }
        e.stopPropagation();
        this.drag = { id: node.id, ox: node.x, oy: node.y, startX: e.clientX, startY: e.clientY, moved: false };
    };

    protected onNodeClick = (node: PositionedNode): void => {
        if (this.suppressClick) {
            this.suppressClick = false;
            return;
        }
        void this.editorManager.open(node.uri);
    };

    protected onNodeContextMenu = (e: React.MouseEvent, node: PositionedNode): void => {
        e.preventDefault();
        void this.graphService.hideNode(node.uri);
    };

    // --- render ---

    protected render(): React.ReactNode {
        if (this.loading && this.data.nodes.length === 0) {
            return <div className='connectome-notes-empty'>Loading…</div>;
        }
        if (this.data.nodes.length === 0) {
            return <div className='connectome-notes-empty'>No notes match the current filters.</div>;
        }
        return <div className='connectome-graph-root'>
            <div className='connectome-graph-toolbar' onMouseDown={e => e.stopPropagation()}>
                <button type='button' className='connectome-graph-reset-btn' onClick={() => this.resetLayout()}
                    title='Reset layout, pins, and hidden notes'>
                    Reset
                </button>
                <span className='connectome-graph-hint'>
                    Drag to pin · Right-click to hide · Click to open · Wheel to zoom
                </span>
            </div>
            <GraphCanvas
                nodes={this.positionedNodes()}
                edges={this.data.edges}
                viewport={this.viewport}
                onWheel={this.onWheel}
                onBackgroundDown={this.onBackgroundDown}
                onMouseMove={this.onMouseMove}
                onMouseUp={this.onMouseUp}
                onNodeDown={this.onNodeDown}
                onNodeClick={this.onNodeClick}
                onNodeContextMenu={this.onNodeContextMenu}
            />
        </div>;
    }
}
