function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

/** Return viewport-safe dimensions for a bottom-right editor-modal resize. */
export function editorModalResizePlan({
    startWidth,
    startHeight,
    deltaX = 0,
    deltaY = 0,
    minimumWidth = 480,
    minimumHeight = 360,
    maximumWidth,
    maximumHeight,
}) {
    const maxWidth = Math.max(0, finiteNumber(maximumWidth));
    const maxHeight = Math.max(0, finiteNumber(maximumHeight));
    const minWidth = Math.min(maxWidth, Math.max(0, finiteNumber(minimumWidth)));
    const minHeight = Math.min(maxHeight, Math.max(0, finiteNumber(minimumHeight)));
    const width = clamp(
        finiteNumber(startWidth, minWidth) + finiteNumber(deltaX),
        minWidth,
        maxWidth,
    );
    const height = clamp(
        finiteNumber(startHeight, minHeight) + finiteNumber(deltaY),
        minHeight,
        maxHeight,
    );
    return { width: Math.round(width), height: Math.round(height) };
}

/** Keep a previously user-sized modal fully inside a changed viewport. */
export function editorModalViewportPlan({
    left,
    top,
    width,
    height,
    viewportWidth,
    viewportHeight,
    margin = 24,
    minimumWidth = 480,
    minimumHeight = 360,
}) {
    const safeMargin = Math.max(0, finiteNumber(margin));
    const availableWidth = Math.max(0, finiteNumber(viewportWidth) - (safeMargin * 2));
    const availableHeight = Math.max(0, finiteNumber(viewportHeight) - (safeMargin * 2));
    const size = editorModalResizePlan({
        startWidth: width,
        startHeight: height,
        minimumWidth,
        minimumHeight,
        maximumWidth: availableWidth,
        maximumHeight: availableHeight,
    });
    const maximumLeft = Math.max(safeMargin, finiteNumber(viewportWidth) - safeMargin - size.width);
    const maximumTop = Math.max(safeMargin, finiteNumber(viewportHeight) - safeMargin - size.height);
    return {
        ...size,
        left: Math.round(clamp(finiteNumber(left, safeMargin), safeMargin, maximumLeft)),
        top: Math.round(clamp(finiteNumber(top, safeMargin), safeMargin, maximumTop)),
    };
}

/** Map accessible resize keys to the same width/height deltas used by pointer input. */
export function editorModalResizeKeyboardDelta(key, step = 24) {
    const distance = Math.max(1, finiteNumber(step, 24));
    return {
        ArrowLeft: { deltaX: -distance, deltaY: 0 },
        ArrowRight: { deltaX: distance, deltaY: 0 },
        ArrowUp: { deltaX: 0, deltaY: -distance },
        ArrowDown: { deltaX: 0, deltaY: distance },
    }[key] || null;
}

export default editorModalResizePlan;
