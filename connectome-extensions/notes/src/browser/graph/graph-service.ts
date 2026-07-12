import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { NoteIndexService } from '../note-index-service';

const PINNED_PREFIX = 'connectome.graph.pinned';
const HIDDEN_PREFIX = 'connectome.graph.hidden';

export interface GraphNode {
    id: string;
    uri: URI;
    label: string;
    path: string;
    degree: number;
    orphan: boolean;
    pinned: boolean;
    fixedPosition?: { x: number; y: number };
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

/**
 * Derives whole-workspace and local (active-note) link graphs from `NoteIndexService`,
 * and owns filter/pin/hide state for the Graph activity rail. Pin/hide persist via
 * `StorageService` (workspace-scoped keys), mirroring `StarredNotesService`.
 */
@injectable()
export class GraphService {

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    filterFolder: string | undefined;
    readonly filterTags = new Set<string>();
    showOrphansOnly = false;
    showHighlyConnectedOnly = false;

    protected pinned = new Map<string, { x: number; y: number }>();
    protected hidden = new Set<string>();

    protected readonly onDidChangeGraphEmitter = new Emitter<void>();
    readonly onDidChangeGraph: Event<void> = this.onDidChangeGraphEmitter.event;

    @postConstruct()
    protected init(): void {
        this.reload().catch(() => { /* ignore */ });
        this.workspace.onWorkspaceChanged(() => {
            this.reload().catch(() => { /* ignore */ });
        });
        this.index.onDidUpdate(() => this.onDidChangeGraphEmitter.fire());
    }

    protected rootId(): string {
        const roots = this.workspace.tryGetRoots();
        return roots.length > 0 ? roots[0].resource.toString() : 'no-workspace';
    }

    protected pinnedKey(): string {
        return `${PINNED_PREFIX}:${this.rootId()}`;
    }

    protected hiddenKey(): string {
        return `${HIDDEN_PREFIX}:${this.rootId()}`;
    }

    async reload(): Promise<void> {
        const pinnedData = await this.storage.getData<[string, { x: number; y: number }][]>(this.pinnedKey(), []);
        this.pinned = new Map(Array.isArray(pinnedData) ? pinnedData : []);
        const hiddenData = await this.storage.getData<string[]>(this.hiddenKey(), []);
        this.hidden = new Set(Array.isArray(hiddenData) ? hiddenData : []);
        this.onDidChangeGraphEmitter.fire();
    }

    protected async persistPinned(): Promise<void> {
        await this.storage.setData(this.pinnedKey(), [...this.pinned.entries()]);
        this.onDidChangeGraphEmitter.fire();
    }

    protected async persistHidden(): Promise<void> {
        await this.storage.setData(this.hiddenKey(), [...this.hidden]);
        this.onDidChangeGraphEmitter.fire();
    }

    isPinned(uri: URI): boolean {
        return this.pinned.has(uri.toString());
    }

    async pinNode(uri: URI, pos: { x: number; y: number }): Promise<void> {
        this.pinned.set(uri.toString(), pos);
        await this.persistPinned();
    }

    async unpinNode(uri: URI): Promise<void> {
        if (this.pinned.delete(uri.toString())) {
            await this.persistPinned();
        }
    }

    async hideNode(uri: URI): Promise<void> {
        this.hidden.add(uri.toString());
        await this.persistHidden();
    }

    async unhideNode(uri: URI): Promise<void> {
        if (this.hidden.delete(uri.toString())) {
            await this.persistHidden();
        }
    }

    /**
     * Full layout reset: clear all pins and re-show every right-click-hidden node,
     * then notify listeners so the canvas can re-run force layout from scratch.
     */
    async resetLayoutState(): Promise<void> {
        this.pinned.clear();
        this.hidden.clear();
        await Promise.all([
            this.storage.setData(this.pinnedKey(), []),
            this.storage.setData(this.hiddenKey(), [])
        ]);
        this.onDidChangeGraphEmitter.fire();
    }

    getHiddenNodes(): { uri: URI; label: string }[] {
        return [...this.hidden].map(uriStr => {
            const uri = new URI(uriStr);
            return { uri, label: uri.path.name };
        });
    }

    setFilterFolder(folder: string | undefined): void {
        this.filterFolder = folder || undefined;
        this.onDidChangeGraphEmitter.fire();
    }

    toggleFilterTag(tag: string): void {
        const key = tag.toLowerCase();
        if (this.filterTags.has(key)) {
            this.filterTags.delete(key);
        } else {
            this.filterTags.add(key);
        }
        this.onDidChangeGraphEmitter.fire();
    }

    setShowOrphansOnly(value: boolean): void {
        this.showOrphansOnly = value;
        if (value) {
            this.showHighlyConnectedOnly = false;
        }
        this.onDidChangeGraphEmitter.fire();
    }

    setShowHighlyConnectedOnly(value: boolean): void {
        this.showHighlyConnectedOnly = value;
        if (value) {
            this.showOrphansOnly = false;
        }
        this.onDidChangeGraphEmitter.fire();
    }

    getAllFolders(): string[] {
        const folders = new Set<string>();
        for (const uri of this.index.getAllNoteUris()) {
            const rel = this.index.getWorkspaceRelativePath(uri);
            const idx = rel.lastIndexOf('/');
            if (idx > 0) {
                folders.add(rel.substring(0, idx));
            }
        }
        return [...folders].sort((a, b) => a.localeCompare(b));
    }

    getAllTags(): string[] {
        return [...this.index.getAllTags().values()]
            .map(t => t.display)
            .sort((a, b) => a.localeCompare(b));
    }

    /** Whole-workspace graph honoring current filters and hidden nodes. */
    getGraphData(): GraphData {
        return this.buildGraph({ respectFilters: true, excludeHidden: true });
    }

    /** Neighborhood graph around one note (ignores folder/tag/orphan filters; still honors hidden). */
    getLocalGraphData(center: URI, hops = 1): GraphData {
        const full = this.buildGraph({ respectFilters: false, excludeHidden: true });
        const centerId = center.toString();
        if (!full.nodes.some(n => n.id === centerId)) {
            return { nodes: [], edges: [] };
        }
        const adjacency = new Map<string, Set<string>>();
        for (const edge of full.edges) {
            if (!adjacency.has(edge.source)) {
                adjacency.set(edge.source, new Set());
            }
            if (!adjacency.has(edge.target)) {
                adjacency.set(edge.target, new Set());
            }
            adjacency.get(edge.source)!.add(edge.target);
            adjacency.get(edge.target)!.add(edge.source);
        }
        const visited = new Set<string>([centerId]);
        let frontier = [centerId];
        for (let hop = 0; hop < hops; hop++) {
            const next: string[] = [];
            for (const id of frontier) {
                for (const neighbor of adjacency.get(id) ?? []) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        next.push(neighbor);
                    }
                }
            }
            frontier = next;
        }
        const nodes = full.nodes.filter(n => visited.has(n.id));
        const edges = full.edges.filter(e => visited.has(e.source) && visited.has(e.target));
        return { nodes, edges };
    }

    protected buildGraph(opts: { respectFilters: boolean; excludeHidden: boolean }): GraphData {
        const edgePairs = this.index.getLinkGraph();
        const degree = new Map<string, number>();
        const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
        for (const { source, target } of edgePairs) {
            bump(source.toString());
            bump(target.toString());
        }
        const sortedDegrees = [...degree.values()].sort((a, b) => a - b);
        const highThreshold = sortedDegrees.length > 0
            ? sortedDegrees[Math.floor(sortedDegrees.length * 0.75)]
            : 0;

        const tagsByUri = this.buildTagsIndex();

        let nodeUris = this.index.getAllNoteUris();
        if (opts.excludeHidden) {
            nodeUris = nodeUris.filter(uri => !this.hidden.has(uri.toString()));
        }
        if (opts.respectFilters) {
            if (this.filterFolder) {
                const folder = this.filterFolder;
                nodeUris = nodeUris.filter(uri =>
                    this.index.getWorkspaceRelativePath(uri).startsWith(folder + '/'));
            }
            if (this.filterTags.size > 0) {
                nodeUris = nodeUris.filter(uri => {
                    const tags = tagsByUri.get(uri.toString());
                    if (!tags) {
                        return false;
                    }
                    for (const tag of this.filterTags) {
                        if (tags.has(tag)) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            if (this.showOrphansOnly) {
                nodeUris = nodeUris.filter(uri => (degree.get(uri.toString()) ?? 0) === 0);
            } else if (this.showHighlyConnectedOnly && highThreshold > 0) {
                nodeUris = nodeUris.filter(uri => (degree.get(uri.toString()) ?? 0) >= highThreshold);
            }
        }

        const nodeIds = new Set(nodeUris.map(uri => uri.toString()));
        const nodes: GraphNode[] = nodeUris.map(uri => {
            const id = uri.toString();
            const d = degree.get(id) ?? 0;
            return {
                id,
                uri,
                label: uri.path.name,
                path: this.index.getWorkspaceRelativePath(uri),
                degree: d,
                orphan: d === 0,
                pinned: this.pinned.has(id),
                fixedPosition: this.pinned.get(id)
            };
        });

        const seenEdges = new Set<string>();
        const edges: GraphEdge[] = [];
        for (const { source, target } of edgePairs) {
            const s = source.toString();
            const t = target.toString();
            if (s === t || !nodeIds.has(s) || !nodeIds.has(t)) {
                continue;
            }
            const key = [s, t].sort().join('|');
            if (seenEdges.has(key)) {
                continue;
            }
            seenEdges.add(key);
            edges.push({ id: key, source: s, target: t });
        }

        return { nodes, edges };
    }

    protected buildTagsIndex(): Map<string, Set<string>> {
        const result = new Map<string, Set<string>>();
        for (const info of this.index.getAllTags().values()) {
            const key = info.display.toLowerCase();
            for (const occ of info.occurrences) {
                let set = result.get(occ.sourceUri);
                if (!set) {
                    set = new Set();
                    result.set(occ.sourceUri, set);
                }
                set.add(key);
            }
        }
        return result;
    }
}
