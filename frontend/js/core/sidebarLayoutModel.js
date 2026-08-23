const DEFAULT_EXPANDED_WIDTH = 280;
const DEFAULT_MIN_WIDTH = 225;
const DEFAULT_MAX_WIDTH = 500;
const DEFAULT_RAIL_WIDTH = 44;

function finiteWidth(value, fallback) {
    const width = Number(value);
    return Number.isFinite(width) ? width : fallback;
}

/**
 * Decide the visible sidebar/title-bar boundary without touching the DOM.
 * The expanded width remains available while the collapsed rail is visible.
 */
export function sidebarLayoutPlan({
    collapsed = false,
    expandedWidth = DEFAULT_EXPANDED_WIDTH,
    minWidth = DEFAULT_MIN_WIDTH,
    maxWidth = DEFAULT_MAX_WIDTH,
    railWidth = DEFAULT_RAIL_WIDTH,
} = {}) {
    const minimum = finiteWidth(minWidth, DEFAULT_MIN_WIDTH);
    const maximum = Math.max(minimum, finiteWidth(maxWidth, DEFAULT_MAX_WIDTH));
    const normalizedExpandedWidth = Math.min(
        maximum,
        Math.max(minimum, finiteWidth(expandedWidth, DEFAULT_EXPANDED_WIDTH)),
    );
    const normalizedRailWidth = Math.max(0, finiteWidth(railWidth, DEFAULT_RAIL_WIDTH));

    return {
        collapsed: Boolean(collapsed),
        expandedWidth: normalizedExpandedWidth,
        visibleWidth: collapsed ? normalizedRailWidth : normalizedExpandedWidth,
        minimumVisibleWidth: collapsed ? normalizedRailWidth : minimum,
    };
}
