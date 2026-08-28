function containsPoint(rect, point) {
    return Boolean(rect && point)
        && point.x >= rect.left
        && point.x <= rect.right
        && point.y >= rect.top
        && point.y <= rect.bottom;
}

/**
 * Join a rendered block to its helper rail with one uninterrupted pointer
 * target. Heading sections use only the narrow approach lane so their control
 * does not remain visible while the pointer is anywhere in a long section.
 */
export function blockControlActivationRect({
    controlRect,
    contentRect,
    blockRect,
    heading = false,
    approach = 8,
} = {}) {
    if (!controlRect || !contentRect || !blockRect) return null;
    return {
        left: controlRect.left - approach,
        right: heading ? contentRect.left + approach : contentRect.right,
        top: Math.min(controlRect.top, blockRect.top),
        bottom: Math.max(controlRect.bottom, blockRect.bottom),
    };
}

export function blockControlShouldReveal({
    folded = false,
    focused = false,
    caretInside = false,
    pointer = null,
    activationRect = null,
} = {}) {
    return Boolean(folded || focused || caretInside || containsPoint(activationRect, pointer));
}
