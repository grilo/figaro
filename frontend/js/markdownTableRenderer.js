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
export function decorateMarkdownTables(container) {
    for (const table of container.querySelectorAll('table')) {
        const rows = [
            ...(table.tHead ? Array.from(table.tHead.rows) : []),
            ...Array.from(table.tBodies).flatMap(body => Array.from(body.rows)),
        ];
        const cellsByRow = rows.map(row => Array.from(row.cells));
        if (!cellsByRow.length) continue;

        for (const row of cellsByRow) {
            for (const cell of row) renderTableBreaks(cell);
        }

        const markerMatrix = cellsByRow.map(row => row.map(cell => (
            tableMergeMarker(cell) ? '^' : ''
        )));
        const { merges, covered } = planVerticalTableMerges(markerMatrix);
        for (const merge of merges) {
            const anchor = cellsByRow[merge.row]?.[merge.col];
            if (!anchor) continue;
            anchor.rowSpan = merge.rowSpan;
            anchor.dataset.figaroTableMerge = 'rowspan';
        }
        for (const marker of covered) {
            cellsByRow[marker.row]?.[marker.col]?.remove();
        }
    }
}

/** Render one GFM table into the supplied document without changing source. */
export function renderMarkdownTable(source, ownerDocument = globalThis.document) {
    if (!ownerDocument?.createElement) return null;
    const template = ownerDocument.createElement('template');
    template.innerHTML = markdownRenderer().render(String(source ?? ''));
    decorateMarkdownTables(template.content);
    return template.content.querySelector('table');
}
