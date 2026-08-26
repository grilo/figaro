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
 * Plan vertical wheel navigation over the Calendar month grid. Trackpad-sized
 * pixel deltas accumulate into one deliberate step, while a conventional
 * wheel notch advances one month immediately.
 */
export function calendarWheelNavigationPlan({
    deltaX = 0,
    deltaY = 0,
    deltaMode = 0,
    accumulatedDeltaY = 0,
    modified = false,
}) {
    const horizontal = finiteNumber(deltaX);
    const vertical = finiteNumber(deltaY);
    if (modified || vertical === 0 || Math.abs(horizontal) >= Math.abs(vertical)) {
        return { handled: false, accumulatedDeltaY: 0, monthOffset: 0 };
    }

    const scaledDelta = vertical * wheelDeltaScale(deltaMode);
    const prior = finiteNumber(accumulatedDeltaY);
    const accumulated = prior === 0 || Math.sign(prior) === Math.sign(scaledDelta)
        ? prior + scaledDelta
        : scaledDelta;
    if (Math.abs(accumulated) < pixelStepThreshold) {
        return { handled: true, accumulatedDeltaY: accumulated, monthOffset: 0 };
    }

    return {
        handled: true,
        accumulatedDeltaY: 0,
        monthOffset: accumulated > 0 ? 1 : -1,
    };
}
