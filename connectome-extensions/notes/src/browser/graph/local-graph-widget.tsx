import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { GraphData, GraphService } from './graph-service';
import { GraphCanvas, GraphViewport, PositionedNode } from './graph-canvas';
import { computeForceLayout } from './graph-layout';

const HOPS = 1;

@injectable()
export class LocalGraphWidget extends ReactWidget {

    static readonly ID = 'connectome-graph-local';
    static readonly LABEL = 'Local Graph';

    @inject(GraphService)
    protected readonly graphService: GraphService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected centerUri: URI | undefined;
    protected data: GraphData = { nodes: [], edges: [] };
    protected positions = new Map<string, { x: number; y: number }>();
    protected lastLayoutKey = '';
    protected viewport: GraphViewport = { x: 0, y: 0, zoom: 1 };
    protected pan: { sx: number; sy: number; vx: number; vy: number } | undefined;

    @postConstruct()
    protected init(): void {
        this.id = LocalGraphWidget.ID;
        this.title.label = LocalGraphWidget.LABEL;
        this.title.caption = 'Notes linked to the active note';
        this.title.iconClass = codicon('target');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.graphService.onDidChangeGraph(() => this.refresh()));
        this.toDispose.push(this.editorManager.onCurrentEditorChanged(() => this.updateCenter()));
        this.updateCenter();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.updateCenter();
    }

    protected updateCenter(): void {
        const editor = this.editorManager.currentEditor;
        const uri = editor?.getResourceUri();
        this.centerUri = uri && uri.path.ext.toLowerCase() === '.md' ? uri : undefined;
        this.refresh();
    }

    protected refresh(): void {
        this.data = this.centerUri ? this.graphService.getLocalGraphData(this.centerUri, HOPS) : { nodes: [], edges: [] };
        const layoutKey = this.data.nodes.map(n => n.id).sort().join(',') + '|' + this.data.edges.length;
        if (layoutKey !== this.lastLayoutKey) {
            this.lastLayoutKey = layoutKey;
            this.positions = computeForceLayout(
                this.data.nodes.map(n => n.id),
                this.data.edges,
                new Map(),
                { width: 300, height: 220, iterations: 150, repulsion: 3500, springLength: 60 }
            );
        }
        this.update();
    }

    protected positionedNodes(): PositionedNode[] {
        return this.data.nodes.map(node => {
            const pos = this.positions.get(node.id) ?? { x: 0, y: 0 };
            return { ...node, x: pos.x, y: pos.y };
        });
    }

    // --- pointer handlers (pan/zoom only; no drag-to-pin here) ---

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
        this.pan = { sx: e.clientX, sy: e.clientY, vx: this.viewport.x, vy: this.viewport.y };
    };

    protected onMouseMove = (e: React.MouseEvent): void => {
        if (!this.pan) {
            return;
        }
        const dx = e.clientX - this.pan.sx;
        const dy = e.clientY - this.pan.sy;
        this.viewport = { ...this.viewport, x: this.pan.vx + dx, y: this.pan.vy + dy };
        this.update();
    };

    protected onMouseUp = (): void => {
        this.pan = undefined;
    };

    protected onNodeClick = (node: PositionedNode): void => {
        void this.editorManager.open(node.uri);
    };

    // --- render ---

    protected render(): React.ReactNode {
        if (!this.centerUri) {
            return <div className='connectome-notes-empty'>Open a note to see its local graph.</div>;
        }
        if (this.data.nodes.length <= 1) {
            return <div className='connectome-notes-empty'>No linked notes yet.</div>;
        }
        return <div className='connectome-graph-root local'>
            <GraphCanvas
                nodes={this.positionedNodes()}
                edges={this.data.edges}
                viewport={this.viewport}
                interactive={false}
                highlightId={this.centerUri.toString()}
                onWheel={this.onWheel}
                onBackgroundDown={this.onBackgroundDown}
                onMouseMove={this.onMouseMove}
                onMouseUp={this.onMouseUp}
                onNodeClick={this.onNodeClick}
            />
        </div>;
    }
}
