/**
 * Pure planning rules for Figaro's printable Markdown table extensions.
 *
 * GFM tables do not define merged cells. Figaro accepts an exact `^` marker
 * in a data cell as a request to continue the cell immediately above it
 * when producing rendered HTML. The source remains rectangular Markdown so
 * the root CodeMirror source editor can continue to edit it normally.
 */

export function isVerticalTableMergeMarker(value) {
    return String(value ?? '').trim() === '^';
}

/**
 * Plan vertical row spans for a rectangular table matrix.
 *
 * Header cells are never merge markers. A marker without a preceding data
 * cell in the same column is left untouched by the caller rather than being
 * treated as a destructive merge request.
 */
export function planVerticalTableMerges(rows, options = {}) {
    const tableRows = Array.isArray(rows) ? rows : [];
    const headerRows = Math.max(0, Number.parseInt(options.headerRows ?? 1, 10) || 0);
    const activeAnchors = [];
    const anchors = [];
    const merges = [];
    const covered = [];

    tableRows.forEach((row, rowIndex) => {
        const cells = Array.isArray(row) ? row : [];
        cells.forEach((value, colIndex) => {
            const isHeader = rowIndex < headerRows;
            if (!isHeader && isVerticalTableMergeMarker(value)) {
                const anchor = activeAnchors[colIndex];
                if (anchor) {
                    anchor.rowSpan += 1;
                    covered.push({
                        row: rowIndex,
                        col: colIndex,
                        anchorRow: anchor.row,
                        anchorCol: anchor.col,
                    });
                    return;
                }
                // An unanchored marker remains literal and must not become
                // an anchor for a later marker in the same column.
                activeAnchors[colIndex] = null;
                return;
            }

            if (isHeader) {
                activeAnchors[colIndex] = null;
                return;
            }

            const anchor = { row: rowIndex, col: colIndex, rowSpan: 1 };
            activeAnchors[colIndex] = anchor;
            anchors.push(anchor);
        });
    });

    for (const anchor of anchors) {
        if (anchor?.rowSpan > 1) merges.push(anchor);
    }

    return { merges, covered };
}
