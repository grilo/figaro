import {
    adjacentGraphNodePath,
    fitGraphViewport,
    graphAdjacency,
    graphLayoutBounds,
    graphView,
    layoutGraph,
    normalizeVaultGraph,
    zoomGraphViewport,
} from './core/graphModel.js';
import { ACCENT_COLOR_PALETTE } from './colorPalette.js';
import { normalizeFileTreeStyles } from './core/fileTreeModel.js';
import { renderLucideIcon } from './lucideIcons.js';

const emptyGraph = Object.freeze({ nodes: [], edges: [] });
function searchIcon() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
}

function fitIcon() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
}

function graphTemplate() {
    return `
        <div class="graph-view">
            <div class="graph-workspace">
                <div class="graph-stage">
                    <canvas class="ui-graph-canvas graph-canvas" tabindex="0" role="region"
                            aria-label="Vault graph. Hover or click a node to trace its links, and Control-click to open it. Arrow keys pan, plus and minus zoom, brackets select notes, and Enter opens the selected note."
                            aria-busy="true"></canvas>
                    <div class="graph-node-icons" aria-hidden="true"></div>
                    <div class="graph-floating-controls">
                        <div class="graph-canvas-controls" role="group" aria-label="Graph zoom controls">
                            <button type="button" class="ui-icon-button graph-zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
                            <button type="button" class="ui-icon-button graph-zoom-fit" aria-label="Fit graph" title="Fit graph">${fitIcon()}</button>
                            <button type="button" class="ui-icon-button graph-zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
                        </div>
                        <label class="graph-filter">
                            <span class="sr-only">Filter graph</span>
                            ${searchIcon()}
                            <input type="search" class="ui-field graph-filter-input" placeholder="Filter graph…" autocomplete="off" spellcheck="false">
                        </label>
                        <button type="button" class="ui-button graph-show-orphans" aria-pressed="true">Orphans</button>
                    </div>
                    <div class="graph-stage-message" role="status">Loading note relationships…</div>
                </div>
            </div>
        </div>`;
}

function colorValue(styles, token, fallback) {
    return styles.getPropertyValue(token).trim() || fallback;
}

function graphColors(root) {
    const styles = getComputedStyle(root);
    return {
        background: colorValue(styles, '--editor-surface', colorValue(styles, '--bg-color', '#1a1816')),
        text: colorValue(styles, '--text-color', '#f5eee4'),
        muted: colorValue(styles, '--text-muted', '#b9ac9e'),
        dim: colorValue(styles, '--text-dim', '#9a8d7f'),
        edge: colorValue(styles, '--border-light', '#62594f'),
        accent: colorValue(styles, '--accent-color', '#d8574a'),
        font: colorValue(styles, '--font-ui', colorValue(styles, '--font-sans', 'sans-serif')),
    };
}

function pointRadius(node) {
    return 4.5 + Math.min(8, Math.sqrt(Math.max(0, node.degree)) * 1.65);
}

function drawArrow(context, source, target, radius, color) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return;
    const ux = dx / distance;
    const uy = dy / distance;
    const tipX = target.x - ux * (radius + 3);
    const tipY = target.y - uy * (radius + 3);
    const size = 7;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(tipX - ux * size - uy * size * 0.62, tipY - uy * size + ux * size * 0.62);
    context.lineTo(tipX - ux * size + uy * size * 0.62, tipY - uy * size - ux * size * 0.62);
    context.closePath();
    context.fill();
}

function intersects(box, boxes) {
    return boxes.some(candidate => !(
        box.right < candidate.left || box.left > candidate.right
        || box.bottom < candidate.top || box.top > candidate.bottom
    ));
}

export function createGraphView(panel, {
    loadGraph,
    loadAppearance = async () => ({ entries: {} }),
    openNote,
    reportError = () => {},
} = {}) {
    if (!panel || typeof loadGraph !== 'function' || typeof openNote !== 'function') {
        throw new TypeError('Graph view requires a panel, graph loader, and note opener');
    }

    panel.innerHTML = graphTemplate();
    const root = panel.querySelector('.graph-view');
    const canvas = root.querySelector('.graph-canvas');
    const stage = root.querySelector('.graph-stage');
    const message = root.querySelector('.graph-stage-message');
    const count = document.getElementById('graph-status-count');
    const filter = root.querySelector('.graph-filter-input');
    const showOrphans = root.querySelector('.graph-show-orphans');
    const iconLayer = root.querySelector('.graph-node-icons');
    const selectionStatus = document.getElementById('graph-status-selection');
    const statusRegion = document.querySelector('.status-right');
    const context = canvas.getContext?.('2d');

    let graph = emptyGraph;
    let view = graphView(graph);
    let layout = [];
    let positions = new Map();
    let visibleNodes = new Map();
    let adjacency = new Map();
    let nodeIconMarkup = new Map();
    let viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    let width = 800;
    let height = 520;
    let hoveredPath = '';
    let selectedPath = '';
    let disposed = false;
    let refreshPending = false;
    let loading = true;
    let frame = null;
    let pointer = null;
    let needsFit = true;

    function nodeByPath(path) {
        return visibleNodes.get(path) || null;
    }

    function indexNodeIcons() {
        nodeIconMarkup = new Map(graph.nodes.flatMap(node => {
            const markup = node.icon ? renderLucideIcon(node.icon, {
                size: 24,
                className: 'graph-node-icon-svg',
            }) : '';
            return markup ? [[node.path, markup]] : [];
        }));
    }

    function screenPoint(path) {
        const point = positions.get(path);
        if (!point) return null;
        return {
            x: point.x * viewport.scale + viewport.offsetX,
            y: point.y * viewport.scale + viewport.offsetY,
        };
    }

    function syncNodeIcons() {
        if (!iconLayer) return;
        const visibleIcons = new Set();
        const tracedPath = hoveredPath || selectedPath;
        const tracedNeighbors = tracedPath ? (adjacency.get(tracedPath) || new Set()) : null;
        for (const node of view.nodes) {
            const markup = nodeIconMarkup.get(node.path);
            const point = markup ? screenPoint(node.path) : null;
            if (!markup || !point) continue;
            visibleIcons.add(node.path);
            let element = [...iconLayer.children].find(candidate => candidate.dataset.path === node.path);
            if (!element) {
                element = document.createElement('span');
                element.className = 'graph-node-icon';
                element.dataset.path = node.path;
                element.innerHTML = markup;
                iconLayer.append(element);
            }
            const size = Math.max(14, Math.min(30, pointRadius(node) * 2.25 * viewport.scale));
            element.style.width = `${size}px`;
            element.style.height = `${size}px`;
            element.style.color = node.color;
            element.style.transform = `translate(${point.x - size / 2}px, ${point.y - size / 2}px)`;
            element.dataset.traced = String(node.path === (hoveredPath || selectedPath));
            element.style.opacity = !tracedPath || node.path === tracedPath || tracedNeighbors?.has(node.path)
                ? '1'
                : '0.12';
        }
        [...iconLayer.children].forEach(element => {
            if (!visibleIcons.has(element.dataset.path)) element.remove();
        });
    }

    function scheduleDraw() {
        if (!context || disposed || frame !== null) return;
        const request = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
        frame = request(() => {
            frame = null;
            draw();
        });
    }

    function draw() {
        if (!context || disposed) return;
        const colors = graphColors(root);
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const pixelWidth = Math.max(1, Math.round(width * ratio));
        const pixelHeight = Math.max(1, Math.round(height * ratio));
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);

        const tracedPath = hoveredPath || selectedPath;
        const tracedNeighbors = tracedPath ? (adjacency.get(tracedPath) || new Set()) : null;
        const visiblePaths = new Set(view.nodes.map(node => node.path));
        for (const edge of view.edges) {
            const source = screenPoint(edge.source);
            const target = screenPoint(edge.target);
            if (!source || !target) continue;
            const related = tracedPath && (edge.source === tracedPath || edge.target === tracedPath);
            context.globalAlpha = tracedPath ? (related ? 0.9 : 0.08) : 0.54;
            context.strokeStyle = related ? colors.accent : colors.edge;
            context.lineWidth = related ? 2 : 1.2;
            context.beginPath();
            context.moveTo(source.x, source.y);
            context.lineTo(target.x, target.y);
            context.stroke();
            const targetNode = nodeByPath(edge.target);
            drawArrow(context, source, target, pointRadius(targetNode || { degree: 0 }) * viewport.scale, related ? colors.accent : colors.edge);
        }

        const labelBoxes = [];
        const labelCandidates = [...view.nodes].sort((left, right) => {
            const leftPriority = left.path === tracedPath ? 3 : 0;
            const rightPriority = right.path === tracedPath ? 3 : 0;
            return rightPriority - leftPriority || right.degree - left.degree || left.path.localeCompare(right.path);
        });
        for (const node of labelCandidates) {
            if (!visiblePaths.has(node.path)) continue;
            const point = screenPoint(node.path);
            if (!point) continue;
            const connected = !tracedPath || node.path === tracedPath || tracedNeighbors?.has(node.path);
            const selected = node.path === selectedPath;
            const hovered = node.path === hoveredPath;
            const radius = pointRadius(node) * Math.max(0.72, Math.min(1.35, viewport.scale));
            const color = node.color || colors.accent;
            context.globalAlpha = connected ? 1 : 0.12;
            if (nodeIconMarkup.has(node.path)) {
                if (selected || hovered) {
                    context.strokeStyle = colors.text;
                    context.lineWidth = selected ? 2.4 : 1.8;
                    context.beginPath();
                    context.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
                    context.stroke();
                }
            } else {
                context.fillStyle = color;
                context.strokeStyle = selected || hovered ? colors.text : colors.background;
                context.lineWidth = selected ? 2.8 : 2;
                context.beginPath();
                context.arc(point.x, point.y, radius + (selected ? 1.5 : 0), 0, Math.PI * 2);
                context.fill();
                context.stroke();
            }

            const showLabel = hovered || selected || view.nodes.length <= 90
                || (view.nodes.length <= 500 && node.degree >= 3)
                || node.degree >= 8;
            if (!showLabel) continue;
            context.font = `500 11px ${colors.font}`;
            const metrics = context.measureText(node.name);
            const box = {
                left: point.x - metrics.width / 2 - 3,
                right: point.x + metrics.width / 2 + 3,
                top: point.y - radius - 17,
                bottom: point.y - radius - 3,
            };
            if (!hovered && !selected && intersects(box, labelBoxes)) continue;
            labelBoxes.push(box);
            context.globalAlpha = connected ? 0.96 : 0.12;
            context.textAlign = 'center';
            context.textBaseline = 'bottom';
            context.lineWidth = 3.5;
            context.strokeStyle = colors.background;
            context.strokeText(node.name, point.x, point.y - radius - 4);
            context.fillStyle = colors.text;
            context.fillText(node.name, point.x, point.y - radius - 4);
        }
        context.globalAlpha = 1;
        syncNodeIcons();
    }

    function resizeCanvas({ fit = false } = {}) {
        const bounds = stage.getBoundingClientRect();
        width = Math.max(280, Math.round(bounds.width || stage.clientWidth || 800));
        height = Math.max(260, Math.round(bounds.height || stage.clientHeight || 520));
        if (fit || needsFit) fitView();
        scheduleDraw();
    }

    function fitView() {
        viewport = fitGraphViewport(graphLayoutBounds(layout), width, height);
        needsFit = false;
        scheduleDraw();
    }

    function updateSelectedPresentation() {
        const selected = nodeByPath(selectedPath);
        if (selectionStatus) selectionStatus.textContent = selected?.path || 'No note selected';
        canvas.setAttribute('aria-label', selected
            ? `Vault graph. Pinned trace for ${selected.name}, ${selected.degree} linked ${selected.degree === 1 ? 'note' : 'notes'}. Hover or click a node to trace its links, and Control-click to open it. Arrow keys pan, plus and minus zoom, brackets select notes, and Enter opens the selected note.`
            : 'Vault graph. Hover or click a node to trace its links, and Control-click to open it. Arrow keys pan, plus and minus zoom, brackets select notes, and Enter opens the selected note.');
    }

    function applyGraphView({ fit = true } = {}) {
        view = graphView(graph, {
            query: filter.value,
            showOrphans: showOrphans.getAttribute('aria-pressed') === 'true',
        });
        layout = layoutGraph(view.nodes, view.edges);
        positions = new Map(layout.map(point => [point.path, point]));
        visibleNodes = new Map(view.nodes.map(node => [node.path, node]));
        adjacency = graphAdjacency(view);
        if (selectedPath && !view.nodes.some(node => node.path === selectedPath)) selectedPath = '';
        if (count) count.textContent = `${view.nodes.length} ${view.nodes.length === 1 ? 'note' : 'notes'} · ${view.edges.length} ${view.edges.length === 1 ? 'link' : 'links'}`;
        message.hidden = loading || view.nodes.length > 0;
        if (!loading && view.nodes.length === 0) {
            message.dataset.state = 'empty';
            message.textContent = graph.nodes.length
                ? 'No notes match these graph filters.'
                : 'No Markdown notes are available yet.';
        }
        updateSelectedPresentation();
        if (fit) needsFit = true;
        resizeCanvas({ fit });
    }

    async function refresh() {
        if (disposed || loading) {
            refreshPending = refreshPending || loading;
            return;
        }
        loading = true;
        canvas.setAttribute('aria-busy', 'true');
        message.hidden = false;
        message.dataset.state = 'loading';
        message.textContent = 'Refreshing note relationships…';
        try {
            const [payload, rawStyles] = await Promise.all([
                loadGraph(),
                Promise.resolve().then(() => loadAppearance()).catch(() => ({ entries: {} })),
            ]);
            graph = normalizeVaultGraph(payload, {
                appearances: normalizeFileTreeStyles(rawStyles).entries,
                palette: ACCENT_COLOR_PALETTE,
            });
            if (disposed) return;
            indexNodeIcons();
            message.hidden = true;
            loading = false;
            applyGraphView({ fit: true });
        } catch (error) {
            if (disposed) return;
            loading = false;
            graph = emptyGraph;
            applyGraphView({ fit: true });
            message.hidden = false;
            message.dataset.state = 'error';
            message.textContent = 'Graph is unavailable right now.';
            reportError(error);
        } finally {
            canvas.setAttribute('aria-busy', 'false');
            if (refreshPending && !disposed) {
                refreshPending = false;
                void refresh();
            }
        }
    }

    function zoom(factor, x = width / 2, y = height / 2) {
        viewport = zoomGraphViewport(viewport, factor, x, y);
        scheduleDraw();
    }

    function hitNode(x, y) {
        let match = null;
        let bestDistance = Infinity;
        for (const node of view.nodes) {
            const point = screenPoint(node.path);
            if (!point) continue;
            const distance = Math.hypot(x - point.x, y - point.y);
            const targetRadius = Math.max(12, pointRadius(node) * viewport.scale + 5);
            if (distance <= targetRadius && distance < bestDistance) {
                match = node;
                bestDistance = distance;
            }
        }
        return match;
    }

    function eventPoint(event) {
        const bounds = canvas.getBoundingClientRect();
        return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    function selectPath(path, { center = false } = {}) {
        const node = nodeByPath(path);
        if (!node) return false;
        selectedPath = path;
        if (center) {
            const point = positions.get(path);
            if (point) {
                viewport.offsetX = width / 2 - point.x * viewport.scale;
                viewport.offsetY = height / 2 - point.y * viewport.scale;
            }
        }
        updateSelectedPresentation();
        scheduleDraw();
        return true;
    }

    function clearSelectedPath() {
        if (!selectedPath) return;
        selectedPath = '';
        updateSelectedPresentation();
        scheduleDraw();
    }

    async function openPath(path) {
        const node = nodeByPath(path);
        if (!node) return;
        try {
            await openNote(node.path);
        } catch (error) {
            reportError(error);
        }
    }

    function openSelected() {
        return openPath(selectedPath);
    }

    function setGraphStatusActive(active) {
        if (!statusRegion) return;
        statusRegion.dataset.mode = active ? 'graph' : 'buffer';
        statusRegion.setAttribute('aria-label', active ? 'Graph status' : 'Active buffer status');
    }

    filter.addEventListener('input', () => applyGraphView({ fit: true }));
    showOrphans.addEventListener('click', () => {
        const pressed = showOrphans.getAttribute('aria-pressed') !== 'true';
        showOrphans.setAttribute('aria-pressed', String(pressed));
        applyGraphView({ fit: true });
    });
    root.querySelector('.graph-zoom-in').addEventListener('click', () => zoom(1.18));
    root.querySelector('.graph-zoom-out').addEventListener('click', () => zoom(1 / 1.18));
    root.querySelector('.graph-zoom-fit').addEventListener('click', fitView);
    canvas.addEventListener('wheel', event => {
        event.preventDefault();
        const point = eventPoint(event);
        zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, point.x, point.y);
    }, { passive: false });
    canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const point = eventPoint(event);
        pointer = { id: event.pointerId, x: point.x, y: point.y, moved: false };
        canvas.classList.add('is-panning');
        canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
        const point = eventPoint(event);
        if (pointer && event.pointerId === pointer.id) {
            const dx = point.x - pointer.x;
            const dy = point.y - pointer.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) pointer.moved = true;
            viewport.offsetX += dx;
            viewport.offsetY += dy;
            pointer.x = point.x;
            pointer.y = point.y;
            scheduleDraw();
            return;
        }
        const hovered = hitNode(point.x, point.y)?.path || '';
        if (hovered !== hoveredPath) {
            hoveredPath = hovered;
            canvas.style.cursor = hovered ? 'pointer' : '';
            scheduleDraw();
        }
    });
    const finishPointer = event => {
        if (!pointer || event.pointerId !== pointer.id) return;
        const point = eventPoint(event);
        const moved = pointer.moved;
        pointer = null;
        canvas.classList.remove('is-panning');
        canvas.releasePointerCapture?.(event.pointerId);
        if (!moved) {
            const node = hitNode(point.x, point.y);
            if (node) {
                if (event.ctrlKey || event.metaKey) void openPath(node.path);
                else selectPath(node.path);
            } else clearSelectedPath();
        }
    };
    canvas.addEventListener('pointerup', finishPointer);
    canvas.addEventListener('pointercancel', event => {
        if (pointer?.id !== event.pointerId) return;
        pointer = null;
        canvas.classList.remove('is-panning');
    });
    canvas.addEventListener('pointerleave', () => {
        if (!pointer && hoveredPath) {
            hoveredPath = '';
            canvas.style.cursor = '';
            scheduleDraw();
        }
    });
    const outsideGraphPointerHandler = event => {
        if (event.target !== canvas) clearSelectedPath();
    };
    document.addEventListener('pointerdown', outsideGraphPointerHandler);
    canvas.addEventListener('keydown', event => {
        const panAmount = event.shiftKey ? 96 : 32;
        if (event.key === 'ArrowLeft') viewport.offsetX += panAmount;
        else if (event.key === 'ArrowRight') viewport.offsetX -= panAmount;
        else if (event.key === 'ArrowUp') viewport.offsetY += panAmount;
        else if (event.key === 'ArrowDown') viewport.offsetY -= panAmount;
        else if (event.key === '+' || event.key === '=') zoom(1.18);
        else if (event.key === '-' || event.key === '_') zoom(1 / 1.18);
        else if (event.key === '0') fitView();
        else if (event.key === '[' || event.key === ']') {
            selectPath(adjacentGraphNodePath(view.nodes, selectedPath, event.key === '[' ? -1 : 1), {
                center: true,
            });
        } else if (event.key === 'Enter') {
            void openSelected();
        } else {
            return;
        }
        event.preventDefault();
        scheduleDraw();
    });

    const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => resizeCanvas())
        : null;
    resizeObserver?.observe(stage);
    const vaultChangeHandler = () => {
        if (panel.classList.contains('active')) void refresh();
        else refreshPending = true;
    };
    document.addEventListener('vault-filesystem-changed', vaultChangeHandler);
    document.addEventListener('file-tree-appearance-changed', vaultChangeHandler);
    const activeTabHandler = event => {
        const active = event.detail?.type === 'graph';
        setGraphStatusActive(active);
    };
    document.addEventListener('active-tab-changed', activeTabHandler);
    const themeStyle = document.getElementById('theme-style');
    const themeObserver = themeStyle && typeof MutationObserver === 'function'
        ? new MutationObserver(scheduleDraw)
        : null;
    themeObserver?.observe(themeStyle, { childList: true, characterData: true, subtree: true });

    loading = false;
    setGraphStatusActive(true);
    resizeCanvas({ fit: true });
    void refresh();

    return {
        activate() {
            setGraphStatusActive(true);
            if (refreshPending) {
                refreshPending = false;
                void refresh();
            } else {
                applyGraphView({ fit: true });
            }
        },
        refresh,
        dispose() {
            disposed = true;
            setGraphStatusActive(false);
            resizeObserver?.disconnect();
            themeObserver?.disconnect();
            document.removeEventListener('vault-filesystem-changed', vaultChangeHandler);
            document.removeEventListener('file-tree-appearance-changed', vaultChangeHandler);
            document.removeEventListener('active-tab-changed', activeTabHandler);
            document.removeEventListener('pointerdown', outsideGraphPointerHandler);
            if (frame !== null) {
                const cancel = window.cancelAnimationFrame || window.clearTimeout;
                cancel(frame);
                frame = null;
            }
        },
    };
}
