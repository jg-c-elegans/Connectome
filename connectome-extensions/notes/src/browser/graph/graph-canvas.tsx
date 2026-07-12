import * as React from '@theia/core/shared/react';
import { GraphEdge, GraphNode } from './graph-service';

export interface GraphViewport {
    x: number;
    y: number;
    zoom: number;
}

export interface PositionedNode extends GraphNode {
    x: number;
    y: number;
}

export interface GraphCanvasProps {
    nodes: PositionedNode[];
    edges: GraphEdge[];
    viewport: GraphViewport;
    interactive?: boolean;
    highlightId?: string;
    onWheel: (e: React.WheelEvent) => void;
    onBackgroundDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onNodeDown?: (e: React.MouseEvent, node: PositionedNode) => void;
    onNodeClick: (node: PositionedNode) => void;
    onNodeContextMenu?: (e: React.MouseEvent, node: PositionedNode) => void;
}

const MIN_SIZE = 10;
const MAX_SIZE = 26;

function nodeSize(degree: number, maxDegree: number): number {
    if (maxDegree <= 0) {
        return MIN_SIZE;
    }
    return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.sqrt(degree / maxDegree);
}

/**
 * Pure presentational force-graph renderer shared by the whole-workspace Graph widget
 * and the active-note Local Graph widget. Reuses Canvas's pan/zoom/SVG-edge rendering
 * conventions (see canvas/canvas-widget.tsx) rather than a graph-drawing library.
 */
export function GraphCanvas(props: GraphCanvasProps): React.ReactElement {
    const { nodes, edges, viewport, interactive, highlightId } = props;
    const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
    const byId = new Map(nodes.map(n => [n.id, n]));
    const maxDegree = nodes.reduce((max, n) => Math.max(max, n.degree), 0);

    return <div className={'connectome-graph-surface' + (interactive === false ? ' readonly' : '')}
        onWheel={props.onWheel}
        onMouseDown={props.onBackgroundDown}
        onMouseMove={props.onMouseMove}
        onMouseUp={props.onMouseUp}
        onMouseLeave={props.onMouseUp}>
        <div className='connectome-graph-world' style={{ transform }}>
            <svg className='connectome-graph-edges' width='10000' height='10000'
                style={{ overflow: 'visible', position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                {edges.map(edge => {
                    const from = byId.get(edge.source);
                    const to = byId.get(edge.target);
                    if (!from || !to) {
                        return null;
                    }
                    return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        className='connectome-graph-edge' />;
                })}
            </svg>
            {nodes.map(node => {
                const size = nodeSize(node.degree, maxDegree);
                const classes = ['connectome-graph-node'];
                if (node.orphan) {
                    classes.push('orphan');
                }
                if (node.pinned) {
                    classes.push('pinned');
                }
                if (node.id === highlightId) {
                    classes.push('active');
                }
                return <div key={node.id}
                    className={classes.join(' ')}
                    style={{ left: node.x - size / 2, top: node.y - size / 2, width: size, height: size }}
                    title={node.path + (node.pinned ? ' (pinned)' : '')}
                    onMouseDown={e => props.onNodeDown?.(e, node)}
                    onClick={() => props.onNodeClick(node)}
                    onContextMenu={e => props.onNodeContextMenu?.(e, node)}>
                    <span className='connectome-graph-node-label'>{node.label}</span>
                </div>;
            })}
        </div>
    </div>;
}
