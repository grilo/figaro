const defaultEpsilon = 1;

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Describe the scroll affordances for a horizontal tab viewport.
 */
export function tabOverflowState({
    scrollSize,
    viewportSize,
    scrollOffset = 0,
    epsilon = defaultEpsilon,
}) {
    const size = Math.max(0, finiteNumber(scrollSize));
    const viewport = Math.max(0, finiteNumber(viewportSize));
    const tolerance = Math.max(0, finiteNumber(epsilon, defaultEpsilon));
    const maxScroll = Math.max(0, size - viewport);
    const offset = clamp(finiteNumber(scrollOffset), 0, maxScroll);
    const overflow = maxScroll > tolerance;

    return {
        overflow,
        canScrollStart: overflow && offset > tolerance,
        canScrollEnd: overflow && offset < maxScroll - tolerance,
        maxScroll,
    };
}

/**
 * Return the nearest horizontal scroll offset that fully reveals one tab.
 */
export function activeTabScrollTarget({
    currentScroll = 0,
    viewportStart,
    viewportEnd,
    tabStart,
    tabEnd,
    maxScroll = Number.POSITIVE_INFINITY,
}) {
    const current = Math.max(0, finiteNumber(currentScroll));
    const viewportLeft = finiteNumber(viewportStart);
    const viewportRight = finiteNumber(viewportEnd, viewportLeft);
    const itemLeft = finiteNumber(tabStart);
    const itemRight = finiteNumber(tabEnd, itemLeft);
    const maximum = Math.max(0, finiteNumber(maxScroll, Number.MAX_SAFE_INTEGER));

    let target = current;
    if (itemLeft < viewportLeft) {
        target -= viewportLeft - itemLeft;
    } else if (itemRight > viewportRight) {
        target += itemRight - viewportRight;
    }
    return clamp(target, 0, maximum);
}
