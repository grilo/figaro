/**
 * Component coverage for the interactive Graph tab.
 */

import { createGraphView } from '../../../frontend/js/graphView.js';

const sampleGraph = {
    nodes: [
        { path: 'Journal/2026-08-29.md', name: '2026-08-29', group: 'Journal', daily: true, incoming: 0, outgoing: 1 },
        { path: 'Projects/Roadmap.md', name: 'Roadmap', group: 'Projects', daily: false, incoming: 1, outgoing: 1 },
        { path: 'Reference/Orphan.md', name: 'Orphan', group: 'Reference', daily: false, incoming: 0, outgoing: 0 },
    ],
    edges: [
        { source: 'Journal/2026-08-29.md', target: 'Projects/Roadmap.md' },
        { source: 'Projects/Roadmap.md', target: 'Journal/2026-08-29.md' },
    ],
};

function canvasContext() {
    return {
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
        fill: jest.fn(),
        closePath: jest.fn(),
        arc: jest.fn(),
        strokeText: jest.fn(),
        fillText: jest.fn(),
        measureText: jest.fn(text => ({ width: String(text).length * 6 })),
    };
}

async function settleGraph() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 24));
}

describe('Graph view', () => {
    let panel;
    let context;
    let session;

    beforeEach(() => {
        document.body.innerHTML = `
            <aside id="right-sidebar" class="right-sidebar collapsed" aria-hidden="true" inert>
                <div id="right-sidebar-resizer" class="right-sidebar-resizer"></div>
                <div class="right-sidebar-header">
                    <span id="right-sidebar-title">Details</span>
                    <button id="right-sidebar-close">×</button>
                </div>
                <div id="right-sidebar-content"><div id="history-content" style="display:none"></div></div>
            </aside>
            <footer id="status-bar">
                <div class="status-right" data-mode="buffer" aria-label="Active buffer status">
                    <div id="graph-status-content">
                        <span id="graph-status-count">Loading graph…</span>
                        <span class="graph-status-instruction">Hover or click to trace links, ctrl+click node to open the file</span>
                        <span id="graph-status-selection">No note selected</span>
                    </div>
                    <div class="status-buffer-left"></div>
                    <div class="status-buffer-right"></div>
                </div>
            </footer>`;
        panel = document.createElement('div');
        panel.className = 'tab-panel active';
        document.body.appendChild(panel);
        context = canvasContext();
        jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
        window.lucide = {
            icons: {
                Star: [['path', { d: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z' }]],
            },
        };
    });

    afterEach(() => {
        session?.dispose();
        session = null;
        jest.restoreAllMocks();
        delete window.lucide;
        document.body.replaceChildren();
    });

    test('uses floating controls, appearance metadata, persistent selection, graph status, and deferred refresh', async () => {
        const loadGraph = jest.fn().mockResolvedValue(sampleGraph);
        const loadAppearance = jest.fn().mockResolvedValue({
            version: 1,
            entries: {
                Projects: { color: '#3b82f6' },
                'Projects/Roadmap.md': { icon: 'Star', color: '#ef4444' },
            },
        });
        const openNote = jest.fn().mockResolvedValue(undefined);
        session = createGraphView(panel, {
            loadGraph,
            loadAppearance,
            openNote,
        });
        await settleGraph();

        expect(document.getElementById('graph-status-count').textContent).toBe('3 notes · 2 links');
        expect(document.querySelector('.status-right').dataset.mode).toBe('graph');
        expect(document.querySelector('.graph-status-instruction').textContent)
            .toBe('Hover or click to trace links, ctrl+click node to open the file');
        expect(panel.querySelector('.graph-toolbar')).toBeNull();
        expect(panel.querySelector('.graph-floating-controls')).not.toBeNull();
        expect(panel.querySelector('.graph-canvas-controls').nextElementSibling)
            .toBe(panel.querySelector('.graph-filter'));
        expect(panel.querySelector('[data-graph-scope]')).toBeNull();
        expect(document.querySelector('.graph-show-daily')).toBeNull();
        expect(document.querySelector('.graph-show-arrows')).toBeNull();
        expect(document.querySelector('.graph-spacing')).toBeNull();
        expect(document.querySelector('.graph-link-pull')).toBeNull();
        expect(document.querySelector('.graph-settings-toggle')).toBeNull();
        expect(document.querySelector('.graph-settings')).toBeNull();
        expect(panel.querySelector('.graph-show-orphans').tagName).toBe('BUTTON');
        expect(panel.querySelector('.graph-show-orphans').getAttribute('aria-pressed')).toBe('true');
        expect(document.getElementById('graph-status-selection').textContent).toBe('No note selected');
        expect(panel.querySelector('.graph-canvas').getAttribute('aria-label')).toContain('Control-click to open it');
        const customIcon = panel.querySelector('.graph-node-icon[data-path="Projects/Roadmap.md"]');
        expect(customIcon).not.toBeNull();
        expect(customIcon.style.color).toBe('rgb(239, 68, 68)');
        expect(context.closePath).toHaveBeenCalled();
        const [arrowBaseLeft, arrowBaseRight] = context.lineTo.mock.calls.slice(-2);
        expect(Math.hypot(
            arrowBaseRight[0] - arrowBaseLeft[0],
            arrowBaseRight[1] - arrowBaseLeft[1],
        )).toBeGreaterThan(8);
        const canvas = panel.querySelector('.graph-canvas');
        canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
        await Promise.resolve();
        expect(openNote).not.toHaveBeenCalled();
        expect(document.getElementById('graph-status-selection').textContent).toBe('Journal/2026-08-29.md');
        expect(canvas.getAttribute('aria-label')).toContain('Pinned trace for 2026-08-29');

        canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await Promise.resolve();
        expect(openNote).toHaveBeenCalledWith('Journal/2026-08-29.md');

        const orphans = panel.querySelector('.graph-show-orphans');
        orphans.click();
        expect(orphans.getAttribute('aria-pressed')).toBe('false');
        expect(document.getElementById('graph-status-count').textContent).toBe('2 notes · 2 links');
        orphans.click();
        expect(orphans.getAttribute('aria-pressed')).toBe('true');

        const filter = panel.querySelector('.graph-filter-input');
        filter.value = 'orphan';
        filter.dispatchEvent(new Event('input', { bubbles: true }));
        expect(document.getElementById('graph-status-count').textContent).toBe('1 note · 0 links');

        document.dispatchEvent(new CustomEvent('file-tree-appearance-changed'));
        await settleGraph();
        expect(loadGraph).toHaveBeenCalledTimes(2);
        expect(loadAppearance).toHaveBeenCalledTimes(2);

        document.dispatchEvent(new CustomEvent('active-tab-changed', { detail: { type: 'file' } }));
        expect(document.querySelector('.status-right').dataset.mode).toBe('buffer');

        panel.classList.remove('active');
        document.dispatchEvent(new CustomEvent('file-tree-appearance-changed'));
        await settleGraph();
        expect(loadGraph).toHaveBeenCalledTimes(2);
        expect(loadAppearance).toHaveBeenCalledTimes(2);

        panel.classList.add('active');
        session.activate();
        await settleGraph();
        expect(loadGraph).toHaveBeenCalledTimes(3);
        expect(loadAppearance).toHaveBeenCalledTimes(3);
    });

    test('shows an accessible empty error state and reports a failed graph load', async () => {
        const failure = new Error('index unavailable');
        const reportError = jest.fn();
        session = createGraphView(panel, {
            loadGraph: jest.fn().mockRejectedValue(failure),
            openNote: jest.fn(),
            reportError,
        });
        await settleGraph();

        expect(panel.querySelector('.graph-stage-message').textContent).toBe('Graph is unavailable right now.');
        expect(panel.querySelector('.graph-stage-message').dataset.state).toBe('error');
        expect(panel.querySelector('.graph-canvas').getAttribute('aria-busy')).toBe('false');
        expect(reportError).toHaveBeenCalledWith(failure);
    });

    test('keeps the graph available with automatic colors when appearance metadata cannot load', async () => {
        const reportError = jest.fn();
        session = createGraphView(panel, {
            loadGraph: jest.fn().mockResolvedValue(sampleGraph),
            loadAppearance: jest.fn().mockRejectedValue(new Error('styles unavailable')),
            openNote: jest.fn(),
            reportError,
        });
        await settleGraph();

        expect(document.getElementById('graph-status-count').textContent).toBe('3 notes · 2 links');
        expect(panel.querySelector('.graph-stage-message').hidden).toBe(true);
        expect(reportError).not.toHaveBeenCalled();
    });
});
