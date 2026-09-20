/** Select visible formatting markers without reading source or visiting syntax. */
export function formattingMarkerVisibility({ markers, selections, selectedLines,
    collapse = true, dragging = false }) {
    return markers.map(marker => !dragging && (marker.block
        ? selectedLines.some(range => range.from <= marker.line && marker.line <= range.to)
        : collapse && selections.some(range => range.from <= marker.to && range.to >= marker.from)));
}
