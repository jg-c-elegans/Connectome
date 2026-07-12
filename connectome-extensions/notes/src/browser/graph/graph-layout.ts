export interface LayoutEdge {
    source: string;
    target: string;
}

export interface LayoutOptions {
    iterations?: number;
    repulsion?: number;
    springLength?: number;
    springStrength?: number;
    damping?: number;
    centerStrength?: number;
    width?: number;
    height?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
    iterations: 250,
    repulsion: 6000,
    springLength: 90,
    springStrength: 0.02,
    damping: 0.85,
    centerStrength: 0.01,
    width: 800,
    height: 600
};

/** Above this node count, `computeForceLayout` falls back to a deterministic radial layout
 *  instead of running O(n^2) repulsion every iteration. */
export const MAX_SIMULATED_NODES = 300;

/**
 * Hand-rolled force simulation (no d3-force / graph-library dependency): inverse-square
 * repulsion between all node pairs + spring attraction along edges + weak center gravity +
 * velocity damping, run for a fixed iteration budget and returned as final positions.
 * Nodes present in `pinned` are held at that fixed position throughout (they still exert
 * repulsion on others).
 */
export function computeForceLayout(
    nodeIds: string[],
    edges: LayoutEdge[],
    pinned: Map<string, { x: number; y: number }>,
    options?: LayoutOptions
): Map<string, { x: number; y: number }> {
    const opts = { ...DEFAULTS, ...options };
    if (nodeIds.length === 0) {
        return new Map();
    }
    if (nodeIds.length > MAX_SIMULATED_NODES) {
        return computeRadialLayout(nodeIds, opts.width, opts.height);
    }

    const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    for (const [id, pos] of seedPositions(nodeIds, opts.width, opts.height)) {
        const fixed = pinned.get(id);
        positions.set(id, { x: fixed?.x ?? pos.x, y: fixed?.y ?? pos.y, vx: 0, vy: 0 });
    }

    const edgeList = edges.filter(e => positions.has(e.source) && positions.has(e.target) && e.source !== e.target);

    for (let iter = 0; iter < opts.iterations; iter++) {
        for (let i = 0; i < nodeIds.length; i++) {
            const a = positions.get(nodeIds[i])!;
            for (let j = i + 1; j < nodeIds.length; j++) {
                const b = positions.get(nodeIds[j])!;
                let dx = a.x - b.x;
                let dy = a.y - b.y;
                let distSq = dx * dx + dy * dy;
                if (distSq < 0.01) {
                    dx = (Math.random() - 0.5) * 0.1;
                    dy = (Math.random() - 0.5) * 0.1;
                    distSq = 0.01;
                }
                const dist = Math.sqrt(distSq);
                const force = opts.repulsion / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                a.vx += fx;
                a.vy += fy;
                b.vx -= fx;
                b.vy -= fy;
            }
        }

        for (const edge of edgeList) {
            const a = positions.get(edge.source)!;
            const b = positions.get(edge.target)!;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
            const displacement = dist - opts.springLength;
            const force = opts.springStrength * displacement;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
        }

        for (const id of nodeIds) {
            const n = positions.get(id)!;
            if (pinned.has(id)) {
                const fixed = pinned.get(id)!;
                n.x = fixed.x;
                n.y = fixed.y;
                n.vx = 0;
                n.vy = 0;
                continue;
            }
            n.vx += -n.x * opts.centerStrength;
            n.vy += -n.y * opts.centerStrength;
            n.vx *= opts.damping;
            n.vy *= opts.damping;
            n.x += n.vx;
            n.y += n.vy;
        }
    }

    const result = new Map<string, { x: number; y: number }>();
    for (const id of nodeIds) {
        const n = positions.get(id)!;
        result.set(id, { x: n.x, y: n.y });
    }
    return result;
}

/** Deterministic fallback layout for graphs too large to simulate cheaply. */
export function computeRadialLayout(nodeIds: string[], width = 800, height = 600): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    const radius = Math.min(width, height) / 2;
    nodeIds.forEach((id, i) => {
        const angle = (i / Math.max(1, nodeIds.length)) * Math.PI * 2;
        result.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    return result;
}

function seedPositions(nodeIds: string[], width: number, height: number): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    nodeIds.forEach((id, i) => {
        const angle = (hashString(id) % 360) * (Math.PI / 180);
        const radius = (width + height) / 8 + (i % 5) * 20;
        result.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    return result;
}

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
}
