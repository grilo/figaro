// Leave enough measured clearance for fractional CodeMirror/widget geometry;
// a nominal 4px gap can round past the rendered block edge at some zooms.
export const EDITOR_BLOCK_RAIL_EDGE_GAP = 6;

function boundedOffset(offset, viewportWidth) {
    if (!Number.isFinite(offset)) return 0;
    return Math.min(viewportWidth, Math.max(-viewportWidth, offset));
}

function boundedWidth(width, viewportWidth) {
    if (!Number.isFinite(width)) return 0;
    return Math.min(viewportWidth, Math.max(0, width));
}

/** Decide the shared action layout and left helper-rail offset without DOM effects. */
export function editorBlockActionLayout(width, geometry = {}) {
    const viewportWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
    const beforeRailWidth = boundedWidth(geometry.beforeRailWidth, viewportWidth);
    const activityRailWidth = boundedWidth(geometry.activityRailWidth, viewportWidth);
    const totalRailWidth = beforeRailWidth + activityRailWidth + (beforeRailWidth && activityRailWidth ? EDITOR_BLOCK_RAIL_EDGE_GAP : 0);
    const beforeRailSpace = geometry.writingLeft - geometry.viewportLeft;
    const writingInset = Number.isFinite(beforeRailSpace) && totalRailWidth > 0
        ? boundedWidth(totalRailWidth + EDITOR_BLOCK_RAIL_EDGE_GAP - beforeRailSpace, viewportWidth)
        : 0;
    return {
        writingInset,
        ...(geometry.activityRailWidth !== undefined ? { activityRailWidth, activityRailOffset: boundedOffset(geometry.writingLeft + writingInset - EDITOR_BLOCK_RAIL_EDGE_GAP - beforeRailWidth - (beforeRailWidth ? EDITOR_BLOCK_RAIL_EDGE_GAP : 0) - geometry.activityRailBaseRight, viewportWidth) } : {}),
        beforeRailOffset: boundedOffset(
            geometry.writingLeft + writingInset - EDITOR_BLOCK_RAIL_EDGE_GAP - geometry.beforeRailBaseRight,
            viewportWidth,
        ),
        beforeRailWidth,
    };
}
