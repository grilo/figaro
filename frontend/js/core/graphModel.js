/**
 * Pure note-graph decisions and layout.
 *
 * This module accepts plain values and deliberately owns no DOM, Canvas,
 * Wails, timers, storage, or global application state.
 */

const defaultGraphOptions = Object.freeze({
    query: '',
    showOrphans: true,
});

function compareGraphText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function cleanPath(value) {
    return typeof value === 'string'
        ? value.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
        : '';
}

function graphNodeName(path, value) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    const fileName = path.split('/').pop() || path;
    return fileName.replace(/\.md$/i, '');
}

function graphNodeGroup(path, value) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return path.includes('/') ? path.split('/')[0] : 'Vault root';
}

function validHexColor(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : '';
}

function graphNodeDirectories(path) {
    const parts = cleanPath(path).split('/').filter(Boolean);
    return parts.slice(0, -1).map((_part, index) => parts.slice(0, index + 1).join('/'));
}

function generatedGraphColor(index) {
    const hue = ((index * 137.508) + 18) % 360;
    const saturation = 68;
    const lightness = 55;
    const chroma = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
    const hueSection = hue / 60;
    const secondary = chroma * (1 - Math.abs(hueSection % 2 - 1));
    const [red, green, blue] = hueSection < 1 ? [chroma, secondary, 0]
        : hueSection < 2 ? [secondary, chroma, 0]
            : hueSection < 3 ? [0, chroma, secondary]
                : hueSection < 4 ? [0, secondary, chroma]
                    : hueSection < 5 ? [secondary, 0, chroma]
                        : [chroma, 0, secondary];
    const match = lightness / 100 - chroma / 2;
    return `#${[red, green, blue]
        .map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
        .join('')}`;
}

function brightenGraphColor(color, depth) {
    const amount = Math.min(0.42, Math.max(0, Number(depth) || 0) * 0.09);
    if (!amount) return color;
    const channels = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16));
    return `#${channels
        .map(channel => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0'))
        .join('')}`;
}

/**
 * Resolve vault appearance choices into stable graph presentation values.
 * Direct note choices win, directory colors inherit into descendants, and
 * unstyled roots exhaust the shared palette before deterministic extra hues.
 */
export function graphNodeAppearances(nodes, appearances = {}, requestedPalette = []) {
    const styles = appearances && typeof appearances === 'object' ? appearances : {};
    const hasStyles = Object.keys(styles).length > 0;
    const palette = [...new Set((Array.isArray(requestedPalette) ? requestedPalette : [])
        .map(validHexColor).filter(Boolean))];
    const roots = [...new Set((nodes || []).map(node => node.group))].sort(compareGraphText);
    const automaticColors = new Map(roots.map((root, index) => [
        root,
        palette[index] || generatedGraphColor(index - palette.length),
    ]));

    return (nodes || []).map(node => {
        const direct = hasStyles ? (styles[node.path] || {}) : {};
        const directColor = validHexColor(direct.color);
        const directories = hasStyles ? graphNodeDirectories(node.path) : [];
        let baseColor = directColor;
        let tintDepth = 0;
        if (!baseColor) {
            for (let index = directories.length - 1; index >= 0; index -= 1) {
                const inherited = validHexColor(styles[directories[index]]?.color);
                if (!inherited) continue;
                baseColor = inherited;
                tintDepth = directories.length - index - 1;
                break;
            }
        }
        if (!baseColor) {
            baseColor = automaticColors.get(node.group) || generatedGraphColor(roots.length);
            tintDepth = hasStyles
                ? Math.max(0, directories.length - 1)
                : Math.max(0, (node.path.match(/\//g) || []).length - 1);
        }
        const icon = typeof direct.icon === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(direct.icon.trim())
            ? direct.icon.trim()
            : '';
        return {
            ...node,
            color: directColor || brightenGraphColor(baseColor, tintDepth),
            icon,
        };
    });
}

export function normalizeVaultGraph(payload, { appearances = {}, palette = [] } = {}) {
    const sourceNodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
    const sourceEdges = Array.isArray(payload?.edges) ? payload.edges : [];
    const nodesByPath = new Map();

    for (const candidate of sourceNodes) {
        const path = cleanPath(candidate?.path);
        if (!path || nodesByPath.has(path)) continue;
        nodesByPath.set(path, {
            path,
            name: graphNodeName(path, candidate?.name),
            group: graphNodeGroup(path, candidate?.group),
            mtime: Number.isFinite(Number(candidate?.mtime)) ? Number(candidate.mtime) : 0,
            daily: Boolean(candidate?.daily),
            incoming: 0,
            outgoing: 0,
            degree: 0,
        });
    }

    const edgeKeys = new Set();
    const edges = [];
    for (const candidate of sourceEdges) {
        const source = cleanPath(candidate?.source);
        const target = cleanPath(candidate?.target);
        if (!source || !target || source === target || !nodesByPath.has(source) || !nodesByPath.has(target)) {
            continue;
        }
        const key = `${source}\u0000${target}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        edges.push({ source, target });
        nodesByPath.get(source).outgoing += 1;
        nodesByPath.get(target).incoming += 1;
    }

    let nodes = [...nodesByPath.values()];
    for (const node of nodes) node.degree = node.incoming + node.outgoing;
    nodes.sort((left, right) => compareGraphText(left.path, right.path));
    nodes = graphNodeAppearances(nodes, appearances, palette);
    edges.sort((left, right) => (
        compareGraphText(left.source, right.source) || compareGraphText(left.target, right.target)
    ));
    return { nodes, edges };
}

export function graphAdjacency(graph) {
    const adjacency = new Map((graph?.nodes || []).map(node => [node.path, new Set()]));
    for (const edge of graph?.edges || []) {
        adjacency.get(edge.source)?.add(edge.target);
        adjacency.get(edge.target)?.add(edge.source);
    }
    return adjacency;
}

export function graphView(graph, requestedOptions = {}) {
    const options = { ...defaultGraphOptions, ...requestedOptions };
    const query = String(options.query || '').trim().toLocaleLowerCase();

    const nodes = (graph?.nodes || []).filter(node => {
        if (!options.showOrphans && node.degree === 0) return false;
        if (!query) return true;
        return `${node.name}\n${node.path}\n${node.group}`.toLocaleLowerCase().includes(query);
    });
    const paths = new Set(nodes.map(node => node.path));
    const edges = (graph?.edges || []).filter(edge => paths.has(edge.source) && paths.has(edge.target));

    return {
        nodes,
        edges,
    };
}

/** True when two projected graph views retain the same ordered node/edge objects. */
export function sameGraphView(left, right) {
    const leftNodes = Array.isArray(left?.nodes) ? left.nodes : [];
    const rightNodes = Array.isArray(right?.nodes) ? right.nodes : [];
    const leftEdges = Array.isArray(left?.edges) ? left.edges : [];
    const rightEdges = Array.isArray(right?.edges) ? right.edges : [];
    return leftNodes.length === rightNodes.length
        && leftEdges.length === rightEdges.length
        && leftNodes.every((node, index) => node === rightNodes[index])
        && leftEdges.every((edge, index) => edge === rightEdges[index]);
}

/** Keep force refinement useful for ordinary vaults without stalling huge ones. */
export function graphLayoutIterationCount(nodeCount) {
    const count = Math.max(0, Number(nodeCount) || 0);
    if (count > 5000) return 4;
    if (count > 2000) return 8;
    if (count > 1000) return 12;
    return 24;
}

function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function graphGroupCenters(groups, nodeCount, spacingFactor) {
    const centers = new Map();
    if (!groups.length) return centers;
    const rootIndex = groups.indexOf('Vault root');
    if (rootIndex >= 0) centers.set('Vault root', { x: 0, y: 0 });
    const ringGroups = groups.filter(group => group !== 'Vault root');
    const radius = Math.max(190, Math.sqrt(Math.max(1, nodeCount)) * 38) * spacingFactor;
    ringGroups.forEach((group, index) => {
        const angle = (Math.PI * 2 * index / Math.max(1, ringGroups.length)) - Math.PI / 2;
        centers.set(group, {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius * 0.72,
        });
    });
    if (!centers.has(groups[0])) centers.set(groups[0], { x: 0, y: 0 });
    return centers;
}

export function layoutGraph(nodes, edges, { spacing = 45, linkPull = 45 } = {}) {
    const stableNodes = [...(Array.isArray(nodes) ? nodes : [])]
        .sort((left, right) => compareGraphText(left.group, right.group)
            || right.degree - left.degree || compareGraphText(left.path, right.path));
    if (!stableNodes.length) return [];

    const spacingFactor = 0.68 + Math.max(0, Math.min(100, Number(spacing) || 0)) / 100 * 1.14;
    const groups = [...new Set(stableNodes.map(node => node.group))].sort(compareGraphText);
    const centers = graphGroupCenters(groups, stableNodes.length, spacingFactor);
    const groupMembers = new Map(groups.map(group => [group, []]));
    stableNodes.forEach(node => groupMembers.get(node.group).push(node));

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const positions = new Map();
    const home = new Map();
    for (const group of groups) {
        const center = centers.get(group) || { x: 0, y: 0 };
        const phase = (stableHash(group) % 6283) / 1000;
        groupMembers.get(group).forEach((node, index) => {
            const radius = index === 0 ? 0 : (38 + Math.sqrt(index) * 34) * spacingFactor;
            const angle = phase + index * goldenAngle;
            const point = {
                path: node.path,
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius * 0.78,
            };
            positions.set(node.path, point);
            home.set(node.path, { x: point.x, y: point.y });
        });
    }

    const attraction = 0.004 + Math.max(0, Math.min(100, Number(linkPull) || 0)) / 100 * 0.016;
    const desiredDistance = 88 * spacingFactor;
    const iterationCount = graphLayoutIterationCount(stableNodes.length);
    for (let iteration = 0; iteration < iterationCount; iteration += 1) {
        for (const edge of edges || []) {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) continue;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const shift = (distance - desiredDistance) * attraction;
            const offsetX = dx / distance * shift;
            const offsetY = dy / distance * shift;
            source.x += offsetX;
            source.y += offsetY;
            target.x -= offsetX;
            target.y -= offsetY;
        }
        for (const point of positions.values()) {
            const origin = home.get(point.path);
            point.x += (origin.x - point.x) * 0.018;
            point.y += (origin.y - point.y) * 0.018;
        }
    }

    return [...positions.values()].sort((left, right) => compareGraphText(left.path, right.path));
}

/** Preserve the full graph's stable geometry while projecting a filtered view. */
export function graphViewLayout(nodes, fullLayout) {
    const positions = new Map((Array.isArray(fullLayout) ? fullLayout : [])
        .map(point => [point.path, point]));
    return (Array.isArray(nodes) ? nodes : [])
        .map(node => positions.get(node.path))
        .filter(Boolean);
}

export function graphLayoutBounds(layout) {
    if (!Array.isArray(layout) || !layout.length) {
        return { minX: -1, minY: -1, maxX: 1, maxY: 1, width: 2, height: 2 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of layout) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(2, maxX - minX),
        height: Math.max(2, maxY - minY),
    };
}

export function fitGraphViewport(bounds, width, height, padding = 52) {
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    const availableWidth = Math.max(1, safeWidth - padding * 2);
    const availableHeight = Math.max(1, safeHeight - padding * 2);
    const scale = Math.max(0.08, Math.min(1.6, availableWidth / bounds.width, availableHeight / bounds.height));
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return {
        scale,
        offsetX: safeWidth / 2 - centerX * scale,
        offsetY: safeHeight / 2 - centerY * scale,
    };
}

export function zoomGraphViewport(viewport, factor, anchorX, anchorY) {
    const currentScale = Math.max(0.08, Number(viewport?.scale) || 1);
    const nextScale = Math.max(0.08, Math.min(4, currentScale * factor));
    const worldX = (anchorX - (Number(viewport?.offsetX) || 0)) / currentScale;
    const worldY = (anchorY - (Number(viewport?.offsetY) || 0)) / currentScale;
    return {
        scale: nextScale,
        offsetX: anchorX - worldX * nextScale,
        offsetY: anchorY - worldY * nextScale,
    };
}

export function adjacentGraphNodePath(nodes, currentPath, direction = 1) {
    const paths = [...(nodes || [])].map(node => node.path).sort();
    if (!paths.length) return '';
    const currentIndex = paths.indexOf(currentPath);
    if (currentIndex < 0) return direction < 0 ? paths.at(-1) : paths[0];
    return paths[(currentIndex + (direction < 0 ? -1 : 1) + paths.length) % paths.length];
}

/** Decide whether a node pointer gesture selects its trace or opens its note. */
export function graphNodePointerAction({
    button = 0,
    ctrlKey = false,
    metaKey = false,
    clickCount = 1,
} = {}) {
    if (button !== 0) return '';
    return ctrlKey || metaKey || clickCount >= 2 ? 'open' : 'select';
}
