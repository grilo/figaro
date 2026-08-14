export const EDITOR_BLOCK_RAIL_EDGE_GAP = 4;
export const EDITOR_BLOCK_ACTION_MIN_RAIL_SPACE = 84;

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
    const beforeRailSpace = geometry.writingLeft - geometry.viewportLeft;
    return {
        stacked: Number.isFinite(beforeRailSpace)
            && beforeRailSpace < EDITOR_BLOCK_ACTION_MIN_RAIL_SPACE,
        beforeRailOffset: boundedOffset(
            geometry.writingLeft - EDITOR_BLOCK_RAIL_EDGE_GAP - geometry.beforeRailBaseRight,
            viewportWidth,
        ),
        beforeRailWidth: boundedWidth(geometry.beforeRailWidth, viewportWidth),
    };
}
