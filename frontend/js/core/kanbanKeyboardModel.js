export function kanbanCardOrderRef(card) {
    return {
        file: String(card?.file ?? card?.dataset?.file ?? ''),
        line: Number(card?.line ?? card?.dataset?.line ?? 0),
        text: String(card?.text ?? card?.dataset?.text ?? ''),
    };
}

function sameCard(first, second, { exactLine = true } = {}) {
    const a = kanbanCardOrderRef(first);
    const b = kanbanCardOrderRef(second);
    return a.file === b.file && (exactLine ? a.line === b.line && a.text === b.text : a.text === b.text);
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
    const remaining = [...(cards || [])];
    const ordered = [];
    for (const ref of refs || []) {
        let index = remaining.findIndex(card => sameCard(card, ref));
        if (index < 0) {
            index = remaining.findIndex(card => sameCard(card, ref, { exactLine: false }));
        }
        if (index >= 0) ordered.push(...remaining.splice(index, 1));
    }
    return ordered.concat(remaining);
}

export function adjacentKanbanColumn(columns, current, offset) {
    const index = (columns || []).indexOf(current);
    const target = index + offset;
    return index >= 0 && target >= 0 && target < columns.length ? columns[target] : null;
}
