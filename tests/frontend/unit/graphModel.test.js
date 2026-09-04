import {
    adjacentGraphNodePath,
    fitGraphViewport,
    graphLayoutBounds,
    graphNodeAppearances,
    graphView,
    graphViewLayout,
    graphLayoutIterationCount,
    graphNodePointerAction,
    sameGraphView,
    layoutGraph,
    normalizeVaultGraph,
    zoomGraphViewport,
} from '../../../frontend/js/core/graphModel.js';

function sampleGraph() {
    return normalizeVaultGraph({
        nodes: [
            { path: 'Projects/Atlas.md', name: 'Atlas', group: 'Projects' },
            { path: 'Projects/Roadmap.md', name: 'Roadmap', group: 'Projects' },
            { path: 'Research/Graph.md', name: 'Graph', group: 'Research' },
            { path: '2026-08-29.md', name: '2026-08-29', daily: true },
            { path: 'Loose.md', name: 'Loose' },
        ],
        edges: [
            { source: 'Projects/Atlas.md', target: 'Projects/Roadmap.md' },
            { source: 'Projects/Atlas.md', target: 'Research/Graph.md' },
            { source: 'Research/Graph.md', target: 'Projects/Atlas.md' },
        ],
    });
}

describe('note graph model', () => {
    test('normalizes bridge data, drops invalid edges, and derives directed degree counts', () => {
        const graph = normalizeVaultGraph({
            nodes: [
                { path: '\\Notes\\One.md', name: 'One' },
                { path: 'Notes/Two.md', group: 'Notes' },
                { path: 'Notes/Two.md', name: 'duplicate' },
            ],
            edges: [
                { source: 'Notes/One.md', target: 'Notes/Two.md' },
                { source: 'Notes/One.md', target: 'Notes/Two.md' },
                { source: 'Notes/One.md', target: 'Missing.md' },
                { source: 'Notes/One.md', target: 'Notes/One.md' },
            ],
        });

        expect(graph.edges).toEqual([{ source: 'Notes/One.md', target: 'Notes/Two.md' }]);
        expect(graph.nodes).toEqual([
            expect.objectContaining({ path: 'Notes/One.md', incoming: 0, outgoing: 1, degree: 1 }),
            expect.objectContaining({ path: 'Notes/Two.md', name: 'Two', incoming: 1, outgoing: 0, degree: 1 }),
        ]);
    });

    test('filters by query and true orphan state while retaining daily notes', () => {
        const graph = sampleGraph();
        const view = graphView(graph, {
            query: 'projects',
            showOrphans: false,
        });

        expect(view.nodes.map(node => node.path)).toEqual([
            'Projects/Atlas.md',
            'Projects/Roadmap.md',
        ]);
        expect(view.edges).toEqual([
            { source: 'Projects/Atlas.md', target: 'Projects/Roadmap.md' },
        ]);
        expect(graphView(graph).nodes.map(node => node.path)).toContain('2026-08-29.md');
    });

    test('inherits folder colors by depth while direct note colors and icons win', () => {
        const nodes = graphNodeAppearances([
            { path: 'Projects/Overview.md', group: 'Projects' },
            { path: 'Projects/Deep/Plan.md', group: 'Projects' },
            { path: 'Projects/Deep/Styled.md', group: 'Projects' },
            { path: 'Loose.md', group: 'Vault root' },
        ], {
            Projects: { color: '#3b82f6', icon: 'FolderHeart' },
            'Projects/Deep/Styled.md': { color: '#ef4444', icon: 'Star' },
        }, ['', '#f97316', '#22c55e']);

        expect(nodes).toEqual([
            expect.objectContaining({ path: 'Projects/Overview.md', color: '#3b82f6', icon: '' }),
            expect.objectContaining({ path: 'Projects/Deep/Plan.md', color: '#4d8df7', icon: '' }),
            expect.objectContaining({ path: 'Projects/Deep/Styled.md', color: '#ef4444', icon: 'Star' }),
            expect.objectContaining({ path: 'Loose.md', color: '#22c55e', icon: '' }),
        ]);
    });

    test('extends the shared appearance palette with stable distinct hues', () => {
        const nodes = [
            { path: 'Alpha/One.md', group: 'Alpha' },
            { path: 'Beta/Two.md', group: 'Beta' },
            { path: 'Gamma/Three.md', group: 'Gamma' },
        ];
        const first = graphNodeAppearances(nodes, {}, ['', '#ef4444']);
        const second = graphNodeAppearances(nodes, {}, ['', '#ef4444']);

        expect(first.map(node => node.color)).toEqual(second.map(node => node.color));
        expect(first[0].color).toBe('#ef4444');
        expect(new Set(first.map(node => node.color)).size).toBe(3);
        first.forEach(node => expect(node.color).toMatch(/^#[0-9a-f]{6}$/));
    });

    test('lays out identical graph inputs deterministically and keeps viewport zoom anchored', () => {
        const graph = sampleGraph();
        const first = layoutGraph(graph.nodes, graph.edges);
        const second = layoutGraph(graph.nodes, graph.edges, { spacing: 45, linkPull: 45 });
        expect(second).toEqual(first);
        expect(first).toHaveLength(graph.nodes.length);

        const bounds = graphLayoutBounds(first);
        const fitted = fitGraphViewport(bounds, 800, 500);
        const anchor = { x: 320, y: 220 };
        const before = {
            x: (anchor.x - fitted.offsetX) / fitted.scale,
            y: (anchor.y - fitted.offsetY) / fitted.scale,
        };
        const zoomed = zoomGraphViewport(fitted, 1.4, anchor.x, anchor.y);
        expect((anchor.x - zoomed.offsetX) / zoomed.scale).toBeCloseTo(before.x);
        expect((anchor.y - zoomed.offsetY) / zoomed.scale).toBeCloseTo(before.y);
    });

    test('projects filtered nodes onto the full graph layout without moving them', () => {
        const graph = sampleGraph();
        const full = layoutGraph(graph.nodes, graph.edges);
        const filtered = graphView(graph, { query: 'projects' });

        expect(graphViewLayout(filtered.nodes, full)).toEqual(full.filter(point => (
            point.path.startsWith('Projects/')
        )));
    });

    test('recognizes unchanged projections and bounds force refinement for huge vaults', () => {
        const graph = sampleGraph();
        const first = graphView(graph, { query: 'project' });
        const equivalent = graphView(graph, { query: 'projects' });
        const different = graphView(graph, { query: 'atlas' });

        expect(sameGraphView(first, equivalent)).toBe(true);
        expect(sameGraphView(first, different)).toBe(false);
        expect(graphLayoutIterationCount(1000)).toBe(24);
        expect(graphLayoutIterationCount(1001)).toBe(12);
        expect(graphLayoutIterationCount(10000)).toBe(4);
    });

    test('cycles keyboard node selection in stable path order', () => {
        const nodes = sampleGraph().nodes;
        expect(adjacentGraphNodePath(nodes, '', 1)).toBe('2026-08-29.md');
        expect(adjacentGraphNodePath(nodes, '2026-08-29.md', -1)).toBe('Research/Graph.md');
    });

    test('opens nodes on double-click or Ctrl/Cmd-click and selects on a plain click', () => {
        expect(graphNodePointerAction()).toBe('select');
        expect(graphNodePointerAction({ ctrlKey: true })).toBe('open');
        expect(graphNodePointerAction({ metaKey: true })).toBe('open');
        expect(graphNodePointerAction({ clickCount: 2 })).toBe('open');
        expect(graphNodePointerAction({ button: 2, clickCount: 2 })).toBe('');
    });
});
