/** macOS and Apple touch devices always keep their native scrolling physics. */
export function usesNativeAppleScrolling(platform = '') {
    return /Mac|iPhone|iPad|darwin/i.test(platform);
}

/** Conservative wheel-step policy; fine/fractional pixel input stays native. */
export function smoothWheelDelta({ enabled, platform, reducedMotion, deltaY = 0, deltaX = 0,
    deltaMode = 0, ctrlKey, metaKey, altKey, shiftKey, defaultPrevented, cancelable = true,
    lineHeight = 20, pageHeight = 600 }) {
    if (!enabled || usesNativeAppleScrolling(platform) || reducedMotion || defaultPrevented || !cancelable
        || ctrlKey || metaKey || altKey || shiftKey || !Number.isFinite(deltaY) || !deltaY
        || Math.abs(deltaX) > 0) return null;
    if (deltaMode === 0 && (!Number.isInteger(deltaY) || Math.abs(deltaY) < 50)) return null;
    if (![0, 1, 2].includes(deltaMode)) return null;
    const distance = deltaY * (deltaMode === 1 ? lineHeight : deltaMode === 2 ? pageHeight : 1);
    return Math.sign(distance) * Math.min(Math.abs(distance), Math.max(100, pageHeight));
}

export function wheelScrollTarget({ offset, target = offset, delta, maximum, pageHeight }) {
    const remaining = target - offset;
    const base = remaining && Math.sign(remaining) === Math.sign(delta) ? target : offset;
    const budget = Math.max(100, pageHeight);
    return Math.max(0, Math.min(maximum, offset + Math.max(-budget, Math.min(budget, base + delta - offset))));
}

/** Exponential convergence uses elapsed time, independently of display refresh rate. */
export function wheelScrollStep(offset, target, elapsed) {
    const distance = target - offset;
    if (Math.abs(distance) < 0.75) return target;
    return offset + distance * (1 - Math.exp(-Math.max(0, Math.min(64, elapsed)) / 45));
}
