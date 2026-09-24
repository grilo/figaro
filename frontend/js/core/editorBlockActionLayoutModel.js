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

// Readable prose beside a docked details pane at enlarged text (see the
// narrow-window scenario in docs/testing/editor.md).
export const EDITOR_MINIMUM_PROSE_WIDTH = 230;

/**
 * Compact the helper rail when its full width would leave less than the
 * minimum prose width. `fullWritingInset` is the inset the full-width rail
 * needs; the decision uses it even while compact so it cannot oscillate.
 */
export function editorHelperRailCompact({ proseRight, writingLeft, fullWritingInset }) {
    if (![proseRight, writingLeft, fullWritingInset].every(Number.isFinite)) return false;
    // Hidden or unmeasured editors keep their current presentation.
    if (proseRight <= writingLeft) return false;
    return proseRight - writingLeft - fullWritingInset < EDITOR_MINIMUM_PROSE_WIDTH;
}
