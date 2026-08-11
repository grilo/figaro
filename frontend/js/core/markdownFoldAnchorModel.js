function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}
/**
 * Plan the scroll offset and trailing reserve needed to keep a clicked
 * Markdown guide at the same viewport coordinate after its fold changes.
 */
export function markdownFoldAnchorPlan({
    currentGuideTop,
    targetGuideTop,
    scrollTop,
    scrollHeight,
    clientHeight,
    currentReserve = 0,
}) {
    const safeScrollTop = Math.max(0, finiteNumber(scrollTop));
    const safeReserve = Math.max(0, finiteNumber(currentReserve));
    const guideDelta = finiteNumber(currentGuideTop) - finiteNumber(targetGuideTop);
    const targetScrollTop = Math.max(0, safeScrollTop + guideDelta);
    const naturalScrollHeight = Math.max(
        finiteNumber(clientHeight),
        finiteNumber(scrollHeight) - safeReserve,
    );
    const naturalMaximum = Math.max(0, naturalScrollHeight - finiteNumber(clientHeight));

    return {
        reserve: Math.max(0, targetScrollTop - naturalMaximum),
        scrollTop: targetScrollTop,
    };
}
