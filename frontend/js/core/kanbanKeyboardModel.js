export function kanbanCardOrderRef(card) {
    return {
        file: String(card?.file ?? card?.dataset?.file ?? ''),
        line: Number(card?.line ?? card?.dataset?.line ?? 0),
        text: String(card?.text ?? card?.dataset?.text ?? ''),
    };
}

function cardOrderKey(card, exactLine) {
    const ref = kanbanCardOrderRef(card);
    return exactLine
        ? JSON.stringify([ref.file, ref.line, ref.text])
        : JSON.stringify([ref.file, ref.text]);
}

export function reorderKanbanCardRefs(refs, index, offset) {
    const result = (refs || []).map(kanbanCardOrderRef);
    const target = index + offset;
    if (index < 0 || index >= result.length || target < 0 || target >= result.length) {
        return { changed: false, refs: result, targetIndex: index };
    }
    const [card] = result.splice(index, 1);
    result.splice(target, 0, card);
    return { changed: true, refs: result, targetIndex: target };
}

/** Match the backend's exact-line, then same-file/text reconciliation rule. */
export function applyKanbanCardOrder(cards, refs) {
    const source = [...(cards || [])];
    const exact = new Map();
    const loose = new Map();
    source.forEach((card, index) => {
        for (const [map, key] of [
            [exact, cardOrderKey(card, true)],
            [loose, cardOrderKey(card, false)],
        ]) {
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(index);
        }
    });

    const consumed = new Set();
    const cursors = new Map();
    const take = (map, key, namespace) => {
        const candidates = map.get(key) || [];
        const cursorKey = `${namespace}:${key}`;
        let cursor = cursors.get(cursorKey) || 0;
        while (cursor < candidates.length && consumed.has(candidates[cursor])) cursor += 1;
        cursors.set(cursorKey, cursor + 1);
        return cursor < candidates.length ? candidates[cursor] : -1;
    };
    const ordered = [];
    for (const ref of refs || []) {
        let index = take(exact, cardOrderKey(ref, true), 'exact');
        if (index < 0) index = take(loose, cardOrderKey(ref, false), 'loose');
        if (index >= 0) {
            consumed.add(index);
            ordered.push(source[index]);
        }
    }
    source.forEach((card, index) => {
        if (!consumed.has(index)) ordered.push(card);
    });
    return ordered;
}

export function adjacentKanbanColumn(columns, current, offset) {
    const index = (columns || []).indexOf(current);
    const target = index + offset;
    return index >= 0 && target >= 0 && target < columns.length ? columns[target] : null;
}

export function kanbanCardWindow(
    cardCount,
    { anchorIndex = 0, selectedIndex = -1, windowSize = 96 } = {},
) {
    const count = Math.max(0, Number(cardCount) || 0);
    if (!count) return { start: 0, end: 0 };
    const size = Math.min(count, Math.max(1, Number(windowSize) || 1));
    const requestedAnchor = selectedIndex >= 0 ? selectedIndex : anchorIndex;
    const anchor = Math.min(count - 1, Math.max(0, Number(requestedAnchor) || 0));
    const start = Math.min(count - size, Math.max(0, anchor - Math.floor(size / 2)));
    return { start, end: start + size };
}
