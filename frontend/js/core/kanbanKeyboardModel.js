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

function addHeightDelta(tree, index, delta) {
    for (let cursor = index + 1; cursor < tree.length; cursor += cursor & -cursor) {
        tree[cursor] += delta;
    }
}

function heightDeltaBefore(tree, index) {
    let total = 0;
    for (let cursor = index; cursor > 0; cursor -= cursor & -cursor) {
        total += tree[cursor];
    }
    return total;
}

/** Create a DOM-independent height index for a variable-height virtual column. */
export function createKanbanVirtualLayout(cardCount, estimatedStride = 91) {
    const count = Math.max(0, Math.floor(Number(cardCount) || 0));
    const estimate = Math.max(1, Number(estimatedStride) || 1);
    return {
        count,
        estimate,
        measured: new Float64Array(count),
        deltas: new Float64Array(count + 1),
        calibrated: false,
    };
}

/** Calibrate unmeasured rows while retaining exact measurements already seen. */
export function calibrateKanbanVirtualLayout(layout, estimatedStride) {
    const estimate = Math.max(1, Number(estimatedStride) || 1);
    if (!layout || estimate === layout.estimate) {
        if (layout) layout.calibrated = true;
        return layout;
    }
    layout.estimate = estimate;
    layout.deltas.fill(0);
    layout.measured.forEach((height, index) => {
        if (height > 0) addHeightDelta(layout.deltas, index, height - estimate);
    });
    layout.calibrated = true;
    return layout;
}

/** Record exact row strides without coupling the virtual-window policy to DOM reads. */
export function recordKanbanVirtualMeasurements(layout, measurements) {
    if (!layout) return layout;
    for (const measurement of measurements || []) {
        const index = Number(measurement?.index);
        const height = Number(measurement?.height);
        if (!Number.isInteger(index) || index < 0 || index >= layout.count || !Number.isFinite(height) || height <= 0) continue;
        const previous = layout.measured[index] || layout.estimate;
        if (Math.abs(previous - height) < 0.01) continue;
        layout.measured[index] = height;
        addHeightDelta(layout.deltas, index, height - previous);
    }
    return layout;
}

/** Estimated world-space top of one logical card index. */
export function kanbanVirtualOffset(layout, index) {
    if (!layout) return 0;
    const bounded = Math.max(0, Math.min(layout.count, Math.floor(Number(index) || 0)));
    return bounded * layout.estimate + heightDeltaBefore(layout.deltas, bounded);
}

/** Logical card intersecting a world-space vertical offset. */
export function kanbanVirtualIndexAtOffset(layout, offset) {
    if (!layout?.count) return 0;
    const target = Math.max(0, Number(offset) || 0);
    let low = 0;
    let high = layout.count - 1;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (kanbanVirtualOffset(layout, middle) <= target) low = middle;
        else high = middle - 1;
    }
    return low;
}
