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

export function vegaRenderDimensions(containerWidth, chartHeight) {
    return {
        width: Math.min(1600, Math.max(320, Math.round(Number(containerWidth) || 640))),
        height: Math.min(1200, Math.max(360, Math.round(Number(chartHeight) || 340) + 80)),
    };
}

/** External data and ambient expressions cannot be keyed by source alone. */
export function vegaOutputCanBeReused(value) {
    if (typeof value === 'string') return !/\b(?:now|random|sampleNormal|sampleLogNormal|sampleUniform|windowSize|screen)\s*\(/u.test(value);
    if (!value || typeof value !== 'object') return true;
    return Object.entries(value).every(([key, child]) => (
        key !== 'url' && key !== 'href'
        && !(key === 'type' && child === 'sample')
        && !(key === 'events' && JSON.stringify(child).includes('timer'))
        && vegaOutputCanBeReused(child)
    ));
}

export function vegaRenderCacheKey(language, spec, dimensions, fonts) {
    return vegaOutputCanBeReused(spec)
        ? JSON.stringify([language, spec, vegaUsesContainerSize(spec) ? dimensions : null, fonts])
        : null;
}

export function vegaUsesContainerSize(value) {
    if (typeof value === 'string') return value === 'container' || /\bcontainerSize\s*\(/u.test(value);
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, child]) => (
        (key === 'autosize' && /fit/u.test(JSON.stringify(child))) || vegaUsesContainerSize(child)
    ));
}

/** Rewrite local SVG references only; labels and external links stay literal. */
const SVG_URL_ATTRIBUTES = new Set([
    'style', 'fill', 'stroke', 'clip-path', 'filter', 'mask',
    'marker', 'marker-start', 'marker-mid', 'marker-end', 'cursor',
]);

export function rebaseSvgAttribute(name, value, ids) {
    if (name === 'id') return ids.get(value) || value;
    if (name === 'href' || name === 'xlink:href') {
        return value.startsWith('#') && ids.has(value.slice(1)) ? `#${ids.get(value.slice(1))}` : value;
    }
    if (name === 'aria-labelledby' || name === 'aria-describedby') {
        return value.replace(/\S+/gu, id => ids.get(id) || id);
    }
    if (!SVG_URL_ATTRIBUTES.has(name)) return value;
    return value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gu,
        (match, quote, id) => ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : match);
}
