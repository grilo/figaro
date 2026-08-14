const MIN_SOURCE_LINES = 1;
const FOOTPRINT_MODES = Object.freeze({
    code: 'scroll',
    math: 'graphic',
    mermaid: 'graphic',
    table: 'scroll',
    vega: 'graphic',
    'vega-lite': 'graphic',
});

export function sourceFootprintMode(kind) {
    return FOOTPRINT_MODES[String(kind || '').toLowerCase()] || null;
}

/**
 * Return the number of logical Markdown lines occupied by a replaced range.
 *
 * `to` is normally the end of the final source line. Treat it as exclusive
 * when it points at the beginning of the following line so a replacement does
 * not reserve an extra row.
 */
export function sourceLineCount(doc, from, to) {
    const start = Math.max(0, Math.min(Number(from) || 0, doc.length));
    const end = Math.max(start, Math.min(Number(to) || start, doc.length));
    const inclusiveEnd = end > start && doc.lineAt(end).from === end ? end - 1 : end;
    return Math.max(MIN_SOURCE_LINES, doc.lineAt(inclusiveEnd).number - doc.lineAt(start).number + 1);
}

export function normalizeSourceLineCount(value) {
    const lines = Math.floor(Number(value));
    return Number.isFinite(lines) ? Math.max(MIN_SOURCE_LINES, lines) : MIN_SOURCE_LINES;
}

/** Pure sizing policy shared by SVG diagrams and KaTeX display math. */
export function graphicFootprintPlan({
    availableWidth,
    availableHeight,
    contentWidth,
    contentHeight,
}) {
    const available = {
        width: Math.max(0, Number(availableWidth) || 0),
        height: Math.max(0, Number(availableHeight) || 0),
    };
    const content = {
        width: Math.max(0, Number(contentWidth) || 0),
        height: Math.max(0, Number(contentHeight) || 0),
    };
    if (!available.width || !available.height || !content.width || !content.height) {
        return { scale: 1, state: 'pending' };
    }

    const scale = Math.min(1, available.width / content.width, available.height / content.height);
    if (scale < 0.999) return { scale, state: 'overflow' };
    const leavesRoom = content.height < available.height - 1;
    return { scale: 1, state: leavesRoom ? 'underflow' : 'fit' };
}
