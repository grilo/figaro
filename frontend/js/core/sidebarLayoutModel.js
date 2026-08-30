const DEFAULT_EXPANDED_WIDTH = 280;
export const SIDEBAR_MINIMUM = 225;
export const SIDEBAR_MAXIMUM = 500;
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
    minWidth = SIDEBAR_MINIMUM,
    maxWidth = SIDEBAR_MAXIMUM,
    railWidth = DEFAULT_RAIL_WIDTH,
} = {}) {
    const minimum = finiteWidth(minWidth, SIDEBAR_MINIMUM);
    const maximum = Math.max(minimum, finiteWidth(maxWidth, SIDEBAR_MAXIMUM));
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
