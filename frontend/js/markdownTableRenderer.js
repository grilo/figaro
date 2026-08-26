/**
 * Render the same GFM table surface used by the live editor and printable
 * Markdown output. The source remains CodeMirror text; this module only
 * decorates the rendered DOM.
 */
import { createPrintMarkdownRenderer } from '../vendored/markdown-it-plugins/index.js';
import {
    isVerticalTableMergeMarker,
    planVerticalTableMerges,
} from './core/printableTableModel.js';
import {
    markdownTableMergePlans,
    stripMarkdownTableMergeMetadata,
} from './core/markdownTableEditorModel.js';

let renderer = null;

function markdownRenderer() {
    renderer ||= createPrintMarkdownRenderer();
    return renderer;
}

function renderTableBreaks(cell) {
    const ownerDocument = cell.ownerDocument;
    const textNodes = [];
    const walker = ownerDocument.createTreeWalker(cell, 4);
    let node = walker.nextNode();
    while (node) {
        if (!node.parentElement?.closest('code, pre') && /<br\s*\/?>/iu.test(node.nodeValue || '')) {
            textNodes.push(node);
        }
        node = walker.nextNode();
    }

    for (const textNode of textNodes) {
        const value = textNode.nodeValue || '';
        const fragment = ownerDocument.createDocumentFragment();
        let cursor = 0;
        for (const match of value.matchAll(/<br\s*\/?>/giu)) {
            const start = match.index ?? cursor;
            if (start > cursor) fragment.append(ownerDocument.createTextNode(value.slice(cursor, start)));
            fragment.append(ownerDocument.createElement('br'));
            cursor = start + match[0].length;
        }
        if (cursor < value.length) fragment.append(ownerDocument.createTextNode(value.slice(cursor)));
        textNode.replaceWith(fragment);
    }
}

function tableMergeMarker(cell) {
    // A formatted or code-spanned caret is ordinary cell content. Only the
    // bare marker used by the Figaro table convention changes structure.
    return cell.children.length === 0 && isVerticalTableMergeMarker(cell.textContent);
}

/** Apply Figaro's shared printable/live table extensions to rendered HTML. */
export function decorateMarkdownTables(container, options = {}) {
    const explicitPlans = options.mergePlans || [];
    Array.from(container.querySelectorAll('table')).forEach((table, tableIndex) => {
        const rows = [
            ...(table.tHead ? Array.from(table.tHead.rows) : []),
            ...Array.from(table.tBodies).flatMap(body => Array.from(body.rows)),
        ];
        const cellsByRow = rows.map(row => Array.from(row.cells));
        if (!cellsByRow.length) return;

        for (const row of cellsByRow) {
            for (const cell of row) renderTableBreaks(cell);
        }

        const markerMatrix = cellsByRow.map(row => row.map(cell => (
            tableMergeMarker(cell) ? '^' : ''
        )));
        const vertical = planVerticalTableMerges(markerMatrix);
        const occupied = new Set();
        const anchors = new Set();
        const mergePlans = vertical.merges.map(merge => ({
            fromRow: merge.row,
            toRow: merge.row + merge.rowSpan - 1,
            fromCol: merge.col,
            toCol: merge.col,
            kind: 'rowspan',
        }));
        mergePlans.push(...(explicitPlans[tableIndex] || []).map(merge => ({ ...merge, kind: 'range' })));
        for (const merge of mergePlans) {
            const anchor = cellsByRow[merge.fromRow]?.[merge.fromCol];
            if (!anchor) continue;
            const keys = [];
            for (let row = merge.fromRow; row <= merge.toRow; row += 1) {
                for (let col = merge.fromCol; col <= merge.toCol; col += 1) keys.push(`${row}:${col}`);
            }
            if (keys.some(key => occupied.has(key))) continue;
            keys.forEach(key => occupied.add(key));
            anchors.add(`${merge.fromRow}:${merge.fromCol}`);
            anchor.rowSpan = merge.toRow - merge.fromRow + 1;
            anchor.colSpan = merge.toCol - merge.fromCol + 1;
            anchor.dataset.figaroTableMerge = merge.kind;
        }
        for (const key of occupied) {
            const [row, col] = key.split(':').map(Number);
            if (!anchors.has(key)) cellsByRow[row]?.[col]?.remove();
        }
    });
}

/** Render one GFM table into the supplied document without changing source. */
export function renderMarkdownTable(source, ownerDocument = globalThis.document) {
    if (!ownerDocument?.createElement) return null;
    const template = ownerDocument.createElement('template');
    const exactSource = String(source ?? '');
    template.innerHTML = markdownRenderer().render(stripMarkdownTableMergeMetadata(exactSource));
    const table = template.content.querySelector('table');
    if (table) {
        const headerRows = table.tHead ? Array.from(table.tHead.rows) : [];
        const bodyRows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows));
        headerRows.forEach((row, rowIndex) => Array.from(row.cells).forEach((cell, columnIndex) => {
            cell.dataset.figaroSourceRow = String(rowIndex);
            cell.dataset.figaroSourceColumn = String(columnIndex);
        }));
        bodyRows.forEach((row, rowIndex) => Array.from(row.cells).forEach((cell, columnIndex) => {
            // GFM's delimiter row is source row 1 but has no rendered DOM row.
            cell.dataset.figaroSourceRow = String(headerRows.length + rowIndex + 1);
            cell.dataset.figaroSourceColumn = String(columnIndex);
        }));
    }
    decorateMarkdownTables(template.content, { mergePlans: markdownTableMergePlans(exactSource) });
    return table;
}
