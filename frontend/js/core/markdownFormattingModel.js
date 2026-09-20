import { selectedRangeIndices } from './selectionRangeIndex.js';

/** Select visible formatting markers without reading source or visiting syntax. */
export function formattingMarkerVisibility({ markers, selections, selectedLines,
    collapse = true, dragging = false }) {
    return markers.map(marker => !dragging && (marker.block
        ? selectedLines.some(range => range.from <= marker.line && marker.line <= range.to)
        : collapse && selections.some(range => range.from <= marker.to && range.to >= marker.from)));
}

/** Inspect selected markers and previously visible markers, retaining all others. */
export function formattingMarkerChanges(value, selections, { collapse = true, dragging = false } = {}) {
    const query = selectedRangeIndices(value.revealIndex, selections);
    const changes = [];
    let visibleIndices = value.visibleIndices;
    for (const index of new Set([...value.visibleIndices, ...query.indices])) {
        const visible = !dragging && query.indices.has(index) && (value.markers[index].block || collapse);
        if (visible === value.visibleIndices.has(index)) continue;
        if (visibleIndices === value.visibleIndices) visibleIndices = new Set(visibleIndices);
        if (visible) visibleIndices.add(index);
        else visibleIndices.delete(index);
        changes.push({ index, visible });
    }
    return { changes, visibleIndices, visited: query.visited };
}
