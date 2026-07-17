import { markdownTableFromClipboard, markdownTableInsertion } from './markdownTableConversion.js';
import { statusBar } from './statusBar.js';

function clipboardText(clipboardData, type) {
    try {
        return String(clipboardData?.getData?.(type) || '');
    } catch (_) {
        return '';
    }
}

/** Read the synchronous text formats exposed by a native paste event. */
export function clipboardTablePayload(clipboardData) {
    const html = clipboardText(clipboardData, 'text/html');
    const csv = clipboardText(clipboardData, 'text/csv');
    const tsv = clipboardText(clipboardData, 'text/tab-separated-values');
    const plain = clipboardText(clipboardData, 'text/plain');
    if (html) return { html, text: plain || tsv || csv, mimeType: 'text/html' };
    if (tsv) return { text: tsv, mimeType: 'text/tab-separated-values' };
    if (csv) return { text: csv, mimeType: 'text/csv' };
    return { text: plain, mimeType: 'text/plain' };
}

/** Replace a selection with one block-separated Markdown table transaction. */
export function insertMarkdownTable(view, markdown, options = {}) {
    if (!view || !markdown) return false;
    const range = options.range || view.state.selection.main;
    const insertion = markdownTableInsertion(view.state.doc.toString(), range, markdown);
    view.dispatch({
        changes: { from: range.from, to: range.to, insert: insertion.insert },
        selection: { anchor: range.from + insertion.cursorOffset },
        scrollIntoView: true,
        userEvent: options.userEvent || 'input',
    });
    return true;
}

/** Replace the current selection with one Markdown table in a paste transaction. */
export function insertClipboardTable(view, conversion) {
    if (!conversion?.markdown
        || !insertMarkdownTable(view, conversion.markdown, { userEvent: 'input.paste' })) return false;
    statusBar.set(`Pasted ${conversion.rows.length} × ${conversion.columns} table`);
    setTimeout(() => statusBar.set('Ready'), 1500);
    return true;
}

/** Convert and insert high-confidence clipboard table data. */
export function pasteClipboardTable(view, payload) {
    return insertClipboardTable(view, markdownTableFromClipboard(payload));
}

/**
 * CodeMirror paste handler. Only clear tabular data is claimed; normal text
 * continues through CodeMirror's native paste path unchanged.
 */
export function handleClipboardTablePaste(event, view) {
    const conversion = markdownTableFromClipboard(clipboardTablePayload(event?.clipboardData));
    if (!conversion) return false;
    event.preventDefault();
    return insertClipboardTable(view, conversion);
}
