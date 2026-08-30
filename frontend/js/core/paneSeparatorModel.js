export const PANE_SEPARATOR_STEP = 8;
export const PANE_SEPARATOR_LARGE_STEP = 32;

/** Decide a pane width from one separator key without touching layout state. */
export function paneSeparatorKeyboardPlan({
    key,
    width,
    minimum,
    maximum,
    shiftKey = false,
    increaseOnArrowRight = true,
} = {}) {
    const current = Number(width);
    const min = Number(minimum);
    const max = Math.max(min, Number(maximum));
    let requested = current;

    if (key === 'Home') requested = min;
    else if (key === 'End') requested = max;
    else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const step = shiftKey ? PANE_SEPARATOR_LARGE_STEP : PANE_SEPARATOR_STEP;
        const arrowDirection = key === 'ArrowRight' ? 1 : -1;
        requested += arrowDirection * step * (increaseOnArrowRight ? 1 : -1);
    } else {
        return { handled: false, width: current };
    }

    return {
        handled: true,
        width: Math.min(max, Math.max(min, requested)),
    };
}
