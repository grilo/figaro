export const EDITOR_TEXT_SCALE_DEFAULT = 100;
export const EDITOR_TEXT_SCALE_MIN = 70;
export const EDITOR_TEXT_SCALE_MAX = 150;
export const EDITOR_TEXT_SCALE_STEP = 10;

const wheelPixelThreshold = 40;

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function wheelDeltaScale(deltaMode) {
    if (deltaMode === 1) return wheelPixelThreshold;
    if (deltaMode === 2) return wheelPixelThreshold * 3;
    return 1;
}

/** Normalize saved, per-buffer, and requested scales through one policy. */
export function normalizeEditorTextScale(value, fallback = EDITOR_TEXT_SCALE_DEFAULT) {
    const requested = Number(value);
    const fallbackValue = Number(fallback);
    const resolved = Number.isFinite(requested)
        ? requested
        : (Number.isFinite(fallbackValue) ? fallbackValue : EDITOR_TEXT_SCALE_DEFAULT);
    return Math.min(EDITOR_TEXT_SCALE_MAX, Math.max(EDITOR_TEXT_SCALE_MIN, Math.round(resolved)));
}

/** Resolve an open buffer's temporary value without manufacturing persistence. */
export function editorTextScaleForBuffer(bufferScale, configuredScale) {
    return normalizeEditorTextScale(
        bufferScale,
        normalizeEditorTextScale(configuredScale),
    );
}

/**
 * Plan one Ctrl/Cmd+wheel gesture. Pixel deltas accumulate for trackpads,
 * while a conventional line/page wheel notch advances exactly one step.
 */
export function editorTextScaleWheelPlan({
    currentScale = EDITOR_TEXT_SCALE_DEFAULT,
    deltaX = 0,
    deltaY = 0,
    deltaMode = 0,
    accumulatedDeltaY = 0,
    modified = false,
} = {}) {
    const current = normalizeEditorTextScale(currentScale);
    const horizontal = finiteNumber(deltaX);
    const vertical = finiteNumber(deltaY);
    if (!modified || vertical === 0 || Math.abs(horizontal) >= Math.abs(vertical)) {
        return { handled: false, accumulatedDeltaY: 0, scale: current };
    }

    const scaledDelta = vertical * wheelDeltaScale(deltaMode);
    const prior = finiteNumber(accumulatedDeltaY);
    const accumulated = prior === 0 || Math.sign(prior) === Math.sign(scaledDelta)
        ? prior + scaledDelta
        : scaledDelta;
    if (Math.abs(accumulated) < wheelPixelThreshold) {
        return { handled: true, accumulatedDeltaY: accumulated, scale: current };
    }

    // Wheel up enlarges text; wheel down reduces it, matching native zoom.
    const direction = accumulated < 0 ? 1 : -1;
    return {
        handled: true,
        accumulatedDeltaY: 0,
        scale: normalizeEditorTextScale(current + direction * EDITOR_TEXT_SCALE_STEP),
    };
}

/** Accessible status presentation for the active document buffer. */
export function editorTextScaleStatus({
    bufferType = '',
    scale = EDITOR_TEXT_SCALE_DEFAULT,
    configuredScale = EDITOR_TEXT_SCALE_DEFAULT,
} = {}) {
    if (bufferType !== 'file') {
        return { hidden: true, label: '', ariaLabel: '', title: '' };
    }
    const current = normalizeEditorTextScale(scale, configuredScale);
    const configured = normalizeEditorTextScale(configuredScale);
    return {
        hidden: false,
        label: `Scale ${current}%`,
        ariaLabel: `Editor scale ${current}%. Reset to Settings default ${configured}%`,
        title: `Reset editor scale to Settings default (${configured}%)`,
    };
}
