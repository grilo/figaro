function boundedIndex(index, count) {
    if (count <= 0) return -1;
    return Math.max(0, Math.min(count - 1, index));
}

/** Pure keyboard policy for Figaro's select-only settings pickers. */
export function pickerKeyboardPlan({ key, open, activeIndex, optionCount }) {
    const count = Math.max(0, Number(optionCount) || 0);
    const current = boundedIndex(Number(activeIndex) || 0, count);

    if (key === 'Tab') {
        return { handled: false, preventDefault: false, open: false, activeIndex: current };
    }
    if (key === 'Escape') {
        return { handled: Boolean(open), preventDefault: Boolean(open), open: false, activeIndex: current };
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
        if (!count) return { handled: false, preventDefault: false, open: false, activeIndex: -1 };
        const direction = key === 'ArrowDown' ? 1 : -1;
        const next = open ? (current + direction + count) % count : current;
        return { handled: true, preventDefault: true, open: true, activeIndex: next };
    }
    if (key === 'Home' || key === 'End') {
        if (!count) return { handled: false, preventDefault: false, open: false, activeIndex: -1 };
        return {
            handled: true,
            preventDefault: true,
            open: true,
            activeIndex: key === 'Home' ? 0 : count - 1,
        };
    }
    if (key === 'Enter' || key === ' ') {
        if (!count) return { handled: false, preventDefault: false, open: false, activeIndex: -1 };
        return {
            handled: true,
            preventDefault: true,
            open: !open,
            activeIndex: current,
            chooseIndex: open ? current : undefined,
        };
    }
    return { handled: false, preventDefault: false, open: Boolean(open), activeIndex: current };
}
