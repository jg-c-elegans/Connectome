/**
 * Connectome Canvas file format (v1).
 * Stored as JSON with extension `.canvas.json` (also accepted: `.connectome.canvas`).
 *
 * Example:
 * {
 *   "version": 1,
 *   "viewport": { "x": 0, "y": 0, "zoom": 1 },
 *   "nodes": [
 *     { "id": "n1", "type": "note", "notePath": "ideas/foo.md", "x": 80, "y": 60, "w": 200, "h": 88, "title": "foo" },
 *     { "id": "n2", "type": "text", "text": "Brainstorm", "x": 360, "y": 120, "w": 180, "h": 100 }
 *   ],
 *   "edges": [
 *     { "id": "e1", "from": "n1", "to": "n2" }
 *   ]
 * }
 */

export const CANVAS_VERSION = 1;
export const CANVAS_FILE_EXTENSIONS = ['.canvas.json', '.connectome.canvas'];

export interface CanvasViewport {
    x: number;
    y: number;
    zoom: number;
}

export interface CanvasNoteNode {
    id: string;
    type: 'note';
    /** Workspace-relative path preferred; absolute URI string also accepted. */
    notePath: string;
    title?: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface CanvasTextNode {
    id: string;
    type: 'text';
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export type CanvasNode = CanvasNoteNode | CanvasTextNode;

export interface CanvasEdge {
    id: string;
    from: string;
    to: string;
}

export interface CanvasDocument {
    version: number;
    viewport: CanvasViewport;
    nodes: CanvasNode[];
    edges: CanvasEdge[];
}

export function emptyCanvasDocument(): CanvasDocument {
    return {
        version: CANVAS_VERSION,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: []
    };
}

export function parseCanvasDocument(raw: string): CanvasDocument {
    try {
        const data = JSON.parse(raw) as Partial<CanvasDocument>;
        const doc = emptyCanvasDocument();
        if (data && typeof data === 'object') {
            doc.version = typeof data.version === 'number' ? data.version : CANVAS_VERSION;
            if (data.viewport && typeof data.viewport === 'object') {
                doc.viewport = {
                    x: Number(data.viewport.x) || 0,
                    y: Number(data.viewport.y) || 0,
                    zoom: clampZoom(Number(data.viewport.zoom) || 1)
                };
            }
            if (Array.isArray(data.nodes)) {
                doc.nodes = data.nodes.map(normalizeNode).filter((n): n is CanvasNode => !!n);
            }
            if (Array.isArray(data.edges)) {
                doc.edges = data.edges
                    .filter(e => e && typeof e === 'object' && e.from && e.to)
                    .map(e => ({
                        id: String(e.id || newId('e')),
                        from: String(e.from),
                        to: String(e.to)
                    }));
            }
        }
        return doc;
    } catch {
        return emptyCanvasDocument();
    }
}

export function serializeCanvasDocument(doc: CanvasDocument): string {
    return JSON.stringify({
        version: CANVAS_VERSION,
        viewport: doc.viewport,
        nodes: doc.nodes,
        edges: doc.edges
    }, undefined, 2);
}

export function isCanvasUri(pathOrUri: string): boolean {
    const lower = pathOrUri.toLowerCase();
    return CANVAS_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export function newId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampZoom(z: number): number {
    return Math.min(3, Math.max(0.25, z));
}

function normalizeNode(raw: unknown): CanvasNode | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const n = raw as Record<string, unknown>;
    const id = String(n.id || newId('n'));
    const x = Number(n.x) || 0;
    const y = Number(n.y) || 0;
    const w = Math.max(80, Number(n.w) || 200);
    const h = Math.max(48, Number(n.h) || 88);
    if (n.type === 'text') {
        return {
            id,
            type: 'text',
            text: String(n.text ?? ''),
            x, y, w, h
        };
    }
    // default / note
    const notePath = String(n.notePath || n.path || '');
    if (!notePath && n.type === 'note') {
        return undefined;
    }
    return {
        id,
        type: 'note',
        notePath: notePath || 'untitled.md',
        title: n.title !== undefined ? String(n.title) : undefined,
        x, y, w, h
    };
}
