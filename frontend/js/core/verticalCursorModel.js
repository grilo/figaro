/**
 * Return the safe cursor target for a document-edge vertical move, or null
 * when the editor's result remains directionally valid.
 *
 * This policy uses plain geometry facts so browser- and CodeMirror-specific
 * adapters can share the same non-wrapping boundary contract.
 */
export function verticalBoundaryTarget({
    beforePosition = 0,
    afterPosition = beforePosition,
    sourceLineNumber = 1,
    movedLineNumber = sourceLineNumber,
    sourceLineFrom = 0,
    sourceLineTo = 0,
    totalLines = 1,
    documentLength = 0,
    forward = true,
} = {}) {
    const before = Math.max(0, Number(beforePosition) || 0);
    const after = Math.max(0, Number(afterPosition) || 0);
    const lastPosition = Math.max(0, Number(documentLength) || 0);
    const sourceLine = Math.max(1, Number(sourceLineNumber) || 1);
    const movedLine = Math.max(1, Number(movedLineNumber) || 1);
    const lineCount = Math.max(1, Number(totalLines) || 1);

    if (forward && before >= lastPosition) return lastPosition;
    if (!forward && before <= 0) return 0;

    const crossedInWrongDirection = forward
        ? movedLine < sourceLine
        : movedLine > sourceLine;
    const reversedInsideBoundaryLine = forward
        ? sourceLine === lineCount && after < before
        : sourceLine === 1 && after > before;

    if (!crossedInWrongDirection && !reversedInsideBoundaryLine) return null;
    return forward
        ? Math.max(0, Number(sourceLineTo) || 0)
        : Math.max(0, Number(sourceLineFrom) || 0);
}

/**
 * Return the scroll boundary that a vertical wheel gesture would cross, or
 * null when the browser can safely perform its normal scrolling.
 */
export function verticalViewportBoundaryTarget({
    scrollTop = 0,
    scrollHeight = 0,
    clientHeight = 0,
    deltaY = 0,
    deltaMode = 0,
    lineHeight = 16,
    tolerance = 1,
} = {}) {
    const top = Math.max(0, Number(scrollTop) || 0);
    const height = Math.max(0, Number(scrollHeight) || 0);
    const viewport = Math.max(0, Number(clientHeight) || 0);
    const maximum = Math.max(0, height - viewport);
    const rawDelta = Number(deltaY) || 0;
    const mode = Number(deltaMode) || 0;
    const edgeTolerance = Math.max(0, Number(tolerance) || 0);
    const deltaPixels = mode === 2
        ? rawDelta * viewport
        : mode === 1
            ? rawDelta * Math.max(1, Number(lineHeight) || 16)
            : rawDelta;

    if (deltaPixels > 0 && top + deltaPixels >= maximum - edgeTolerance) {
        return maximum;
    }
    if (deltaPixels < 0 && top + deltaPixels <= edgeTolerance) {
        return 0;
    }
    return null;
}
