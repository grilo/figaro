export function relationshipWindow(
    resultCount,
    { anchorIndex = 0, selectedIndex = -1, windowSize = 96 } = {},
) {
    const count = Math.max(0, Number(resultCount) || 0);
    if (!count) return { start: 0, end: 0 };
    const size = Math.min(count, Math.max(1, Number(windowSize) || 1));
    const requestedAnchor = selectedIndex >= 0 ? selectedIndex : anchorIndex;
    const anchor = Math.min(count - 1, Math.max(0, Number(requestedAnchor) || 0));
    const start = Math.min(count - size, Math.max(0, anchor - Math.floor(size / 2)));
    return { start, end: start + size };
}

/**
 * Page a long list that is revealed step by step. `end` is how many results
 * are shown (at least one page), `remaining` how many are still hidden, and
 * `next` how many the next step reveals.
 */
export function relationshipPage(resultCount, shown = 0, pageSize = 100) {
    const count = Math.max(0, Number(resultCount) || 0);
    const size = Math.max(1, Number(pageSize) || 1);
    const end = Math.min(count, Math.max(size, Number(shown) || 0));
    const remaining = count - end;
    return { end, remaining, next: Math.min(remaining, size) };
}
