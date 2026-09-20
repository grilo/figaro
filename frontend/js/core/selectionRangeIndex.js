/** Immutable interval tree. Build only when parsed or mapped source ranges change. */
export function createSelectionRangeIndex(ranges) {
    const entries = ranges.map(({ from, to }, index) => ({ from, to, index }))
        .sort((a, b) => a.from - b.from || a.to - b.to);
    const build = (from, to) => {
        if (from >= to) return null;
        const middle = (from + to) >> 1;
        const left = build(from, middle), right = build(middle + 1, to);
        const entry = entries[middle];
        return { ...entry, left, right, minFrom: entries[from].from,
            maxTo: Math.max(entry.to, left?.maxTo ?? -Infinity, right?.maxTo ?? -Infinity) };
    };
    return build(0, entries.length);
}

/** Inclusive overlap preserves cursor-at-boundary and nonempty selection semantics. */
export function selectedRangeIndices(root, selections) {
    const indices = new Set();
    let visited = 0;
    const visit = (node, from, to) => {
        if (!node) return;
        visited++;
        if (node.maxTo < from || node.minFrom > to) return;
        if (node.from <= to && node.to >= from) indices.add(node.index);
        visit(node.left, from, to);
        visit(node.right, from, to);
    };
    for (const { from, to } of selections) visit(root, from, to);
    return { indices, visited };
}

/** Plan only visibility transitions; unchanged blocks and earlier states stay intact. */
export function sourceRevealChanges(value, selections, visible) {
    const query = selectedRangeIndices(value.revealIndex, selections);
    const changes = [];
    let visibleIndices = value.visibleIndices;
    for (const index of query.indices) {
        const block = value.blocks[index];
        const next = Boolean(visible(block));
        if (next === visibleIndices.has(index)) continue;
        if (visibleIndices === value.visibleIndices) visibleIndices = new Set(visibleIndices);
        if (next) visibleIndices.add(index);
        else visibleIndices.delete(index);
        changes.push({ index, block, visible: next });
    }
    return { changes, visibleIndices, visited: query.visited, checks: query.indices.size };
}
