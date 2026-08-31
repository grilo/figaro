/**
 * Plan a fixed-position menu beside its trigger without relying on DOM state.
 * The adapter owns measuring and applying the returned geometry.
 */
export function planFloatingMenuPlacement({
    trigger,
    menuHeight,
    menuWidth,
    viewportWidth,
    viewportHeight,
    gap = 6,
    margin = 8,
    maximumHeight = 310,
}) {
    const viewport = {
        width: Math.max(0, Number(viewportWidth) || 0),
        height: Math.max(0, Number(viewportHeight) || 0),
    };
    const bounds = {
        top: Number(trigger?.top) || 0,
        right: Number(trigger?.right) || 0,
        bottom: Number(trigger?.bottom) || 0,
        left: Number(trigger?.left) || 0,
        width: Math.max(0, Number(trigger?.width) || 0),
    };
    const safeMargin = Math.max(0, Number(margin) || 0);
    const safeGap = Math.max(0, Number(gap) || 0);
    const availableWidth = Math.max(0, viewport.width - (safeMargin * 2));
    const requestedWidth = menuWidth === undefined
        ? bounds.width
        : Math.max(0, Number(menuWidth) || 0);
    const width = Math.min(requestedWidth, availableWidth);
    const left = Math.min(
        Math.max(safeMargin, bounds.left),
        Math.max(safeMargin, viewport.width - safeMargin - width),
    );
    const below = Math.max(0, viewport.height - safeMargin - bounds.bottom - safeGap);
    const above = Math.max(0, bounds.top - safeMargin - safeGap);
    const desiredHeight = Math.min(
        Math.max(0, Number(menuHeight) || 0),
        Math.max(0, Number(maximumHeight) || 0),
    );
    const placement = below >= desiredHeight || below >= above ? 'bottom' : 'top';
    const availableHeight = placement === 'bottom' ? below : above;
    const maxHeight = Math.min(desiredHeight, availableHeight);
    const top = placement === 'bottom'
        ? bounds.bottom + safeGap
        : Math.max(safeMargin, bounds.top - safeGap - maxHeight);

    return { top, left, width, maxHeight, placement };
}

export default planFloatingMenuPlacement;
