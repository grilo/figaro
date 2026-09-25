/**
 * Remembered diagram geometry. Rendered sizes are kept per diagram source so a
 * later mount can reserve the right box before the renderer finishes, and the
 * editor does not grow or shrink when a diagram appears.
 */

/** `{ width, height }` of an SVG `viewBox` attribute, or `null` when unusable. */
export function svgViewBoxSize(viewBox) {
    const box = String(viewBox || '').trim().split(/[\s,]+/u).map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return null;
    return { width: box[2], height: box[3] };
}

// cyrb53: a fast, well-distributed 53-bit string hash. A collision only
// costs one wrong first-render estimate.
function hash53(text) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Compact key for a diagram source; the source itself is never stored. */
export function diagramSizeKey(language, source) {
    const text = String(source || '');
    return `${String(language || '').trim().toLowerCase()}:${text.length.toString(36)}:${hash53(text)}`;
}

function validSize(value) {
    const [width, height] = Array.isArray(value) ? value.map(Number) : [];
    return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
        ? { width, height } : null;
}

/** Parse stored sizes, oldest first; malformed data yields an empty memory. */
export function readDiagramSizeMemory(text) {
    const entries = new Map();
    let parsed;
    try { parsed = JSON.parse(String(text || '{}')); } catch { return entries; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return entries;
    for (const [key, value] of Object.entries(parsed)) {
        const size = validSize(value);
        if (size) entries.set(key, size);
    }
    return entries;
}

export function serializeDiagramSizeMemory(entries) {
    return JSON.stringify(Object.fromEntries([...entries].map(([key, { width, height }]) => [key, [width, height]])));
}

/**
 * Record `size` as the most recent entry and drop the oldest beyond `limit`.
 * Returns whether the stored value changed, so callers persist only changes.
 */
export function rememberDiagramSize(entries, key, size, limit) {
    const next = validSize([size?.width, size?.height]);
    if (!key || !next) return false;
    const previous = entries.get(key);
    entries.delete(key);
    entries.set(key, next);
    while (entries.size > limit) entries.delete(entries.keys().next().value);
    return !previous || previous.width !== next.width || previous.height !== next.height;
}
