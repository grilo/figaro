function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

/** Keep one source anchor at the same vertical marker in the raw preview. */
export function rawPreviewScrollTopForAnchor({
    anchorViewportTop,
    stageViewportTop,
    currentScrollTop = 0,
    scrollHeight = 0,
    clientHeight = 0,
    markerRatio = 0.3,
} = {}) {
    if (!Number.isFinite(Number(anchorViewportTop)) || !Number.isFinite(Number(stageViewportTop))) {
        return null;
    }
    const viewportHeight = Math.max(0, finite(clientHeight));
    const maximum = Math.max(0, finite(scrollHeight) - viewportHeight);
    const marker = viewportHeight * clamp(finite(markerRatio, 0.3), 0, 1);
    const anchorDocumentTop = finite(currentScrollTop)
        + finite(anchorViewportTop)
        - finite(stageViewportTop);
    return clamp(anchorDocumentTop - marker, 0, maximum);
}

/** Fall back to source-relative progress when a DOM Range cannot be measured. */
export function rawPreviewScrollTopForProgress(position, sourceLength, scrollHeight, clientHeight) {
    const maximum = Math.max(0, finite(scrollHeight) - Math.max(0, finite(clientHeight)));
    const length = Math.max(0, finite(sourceLength));
    const progress = length > 0 ? clamp(finite(position) / length, 0, 1) : 0;
    return maximum * progress;
}
