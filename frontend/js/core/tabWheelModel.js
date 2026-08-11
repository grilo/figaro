const pixelStepThreshold = 40;

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function wheelDeltaScale(deltaMode) {
    if (deltaMode === 1) return pixelStepThreshold;
    if (deltaMode === 2) return pixelStepThreshold * 3;
    return 1;
}

/**
 * Plan one vertical wheel gesture over the tab rail. Small pixel deltas are
 * accumulated so a high-resolution trackpad does not race through tabs, while
 * one conventional line/page wheel event still advances exactly one tab.
 */
export function wheelTabNavigationPlan({
    tabIds = [],
    activeTabId = null,
    deltaX = 0,
    deltaY = 0,
    deltaMode = 0,
    accumulatedDeltaY = 0,
    modified = false,
}) {
    const horizontal = finiteNumber(deltaX);
    const vertical = finiteNumber(deltaY);
    const ids = Array.isArray(tabIds) ? tabIds.filter(Boolean) : [];
    if (modified || ids.length < 2 || vertical === 0 || Math.abs(horizontal) >= Math.abs(vertical)) {
        return { handled: false, accumulatedDeltaY: 0, targetTabId: null };
    }

    const scaledDelta = vertical * wheelDeltaScale(deltaMode);
    const prior = finiteNumber(accumulatedDeltaY);
    const accumulated = prior === 0 || Math.sign(prior) === Math.sign(scaledDelta)
        ? prior + scaledDelta
        : scaledDelta;
    if (Math.abs(accumulated) < pixelStepThreshold) {
        return { handled: true, accumulatedDeltaY: accumulated, targetTabId: null };
    }

    const direction = accumulated > 0 ? 1 : -1;
    const activeIndex = ids.indexOf(activeTabId);
    const targetIndex = activeIndex < 0
        ? (direction > 0 ? 0 : ids.length - 1)
        : (activeIndex + direction + ids.length) % ids.length;
    return {
        handled: true,
        accumulatedDeltaY: 0,
        targetTabId: ids[targetIndex],
    };
}
