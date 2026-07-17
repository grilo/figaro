const allowedElements = new Set(['circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect']);
const allowedAttributes = new Set([
    'cx', 'cy', 'd', 'height', 'points', 'r', 'rx', 'ry',
    'width', 'x', 'x1', 'x2', 'y', 'y1', 'y2',
]);

function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function iconCatalog() {
    return window.lucide?.icons || {};
}

/** Return stable searchable Lucide export names without exposing internals. */
export function lucideIconNames() {
    return Object.keys(iconCatalog()).filter(name => /^[A-Za-z][A-Za-z0-9]*$/.test(name)).sort();
}

export function lucideIconLabel(name) {
    return String(name || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .trim();
}

export function searchLucideIcons(query, limit = 80) {
    const normalized = String(query || '').trim().toLowerCase().replace(/[-_\s]+/g, '');
    if (!normalized) return [];
    return lucideIconNames()
        .filter(name => name.toLowerCase().includes(normalized))
        .slice(0, limit);
}

/** Render only Lucide's declarative SVG primitives through strict allowlists. */
export function renderLucideIcon(name, { size = 16, className = '' } = {}) {
    const nodes = iconCatalog()[name];
    if (!Array.isArray(nodes)) return '';
    const body = nodes.map(node => {
        const [tag, attributes] = Array.isArray(node) ? node : [];
        if (!allowedElements.has(tag) || !attributes || typeof attributes !== 'object') return '';
        const serialized = Object.entries(attributes)
            .filter(([attribute]) => allowedAttributes.has(attribute))
            .map(([attribute, value]) => `${attribute}="${escapeAttribute(value)}"`)
            .join(' ');
        return `<${tag}${serialized ? ` ${serialized}` : ''}></${tag}>`;
    }).join('');
    if (!body) return '';
    return `<svg${className ? ` class="${escapeAttribute(className)}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
