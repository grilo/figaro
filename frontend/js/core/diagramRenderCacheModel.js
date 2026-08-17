/**
 * Pure policies shared by the live diagram renderer's in-memory cache.
 */

export function diagramRenderCacheKey(language, source) {
    return `${String(language || '').trim().toLowerCase()}\u0000${String(source || '')}`;
}
/**
 * Mermaid prefixes every generated SVG id with the render id supplied by the
 * host. Rebase that token when a cached SVG is mounted in another widget so
 * references such as url(#id) remain local to that diagram.
 */
export function rebaseDiagramSvgIds(svg, sourceId, targetId) {
    const value = String(svg || '');
    const from = String(sourceId || '');
    const to = String(targetId || '');
    if (!value || !from || from === to) return value;
    return value.split(from).join(to);
}
