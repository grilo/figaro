import { parseMarkdownTable } from './markdownTableEditing.js';

const mergeLinePattern = /^\s*<!--\s*figaro:table-merge\s+([A-Z]+[1-9]\d*):([A-Z]+[1-9]\d*)\s*-->\s*$/iu;
const mergeLineGlobalPattern = /^[\t ]*<!--\s*figaro:table-merge\s+[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*\s*-->[\t ]*(?:\r?\n|$)/gimu;

function columnIndex(label) {
    let value = 0;
    for (const character of String(label || '').toUpperCase()) {
        value = (value * 26) + character.charCodeAt(0) - 64;
    }
    return value - 1;
}

function columnLabel(index) {
    let value = Math.max(0, Number(index) || 0) + 1;
    let label = '';
    while (value > 0) {
        value -= 1;
        label = String.fromCharCode(65 + (value % 26)) + label;
        value = Math.floor(value / 26);
    }
    return label;
}

export function tableCellAddress(cell) {
    return `${columnLabel(cell?.col)}${Math.max(0, Number(cell?.row) || 0) + 1}`;
}

function normalizedSpan(from, to) {
    return {
        fromRow: Math.min(from.row, to.row),
        toRow: Math.max(from.row, to.row),
        fromCol: Math.min(from.col, to.col),
        toCol: Math.max(from.col, to.col),
    };
}

function spansOverlap(left, right) {
    return left.fromRow <= right.toRow && left.toRow >= right.fromRow
        && left.fromCol <= right.toCol && left.toCol >= right.fromCol;
}

function spanContains(span, cell) {
    return cell.row >= span.fromRow && cell.row <= span.toRow
        && cell.col >= span.fromCol && cell.col <= span.toCol;
}

function splitEditorSource(source) {
    const lines = String(source ?? '').split('\n');
    let metadataFrom = lines.length;
    while (metadataFrom > 0 && mergeLinePattern.test(lines[metadataFrom - 1])) metadataFrom -= 1;
    return {
        tableSource: lines.slice(0, metadataFrom).join('\n'),
        metadataLines: lines.slice(metadataFrom),
    };
}

function parseMetadataSpan(line) {
    const match = String(line || '').match(mergeLinePattern);
    if (!match) return null;
    const from = { col: columnIndex(match[1].match(/[A-Z]+/iu)?.[0]), row: Number.parseInt(match[1].match(/\d+/u)?.[0], 10) - 1 };
    const to = { col: columnIndex(match[2].match(/[A-Z]+/iu)?.[0]), row: Number.parseInt(match[2].match(/\d+/u)?.[0], 10) - 1 };
    return { ...normalizedSpan(from, to), kind: 'metadata', cachedCells: null };
}

function caretSpans(rows) {
    const spans = [];
    const anchors = [];
    for (let row = 1; row < rows.length; row += 1) {
        for (let col = 0; col < rows[row].cells.length; col += 1) {
            if (String(rows[row].cells[col] || '').trim() === '^') {
                const anchor = anchors[col];
                if (anchor) anchor.toRow = row;
                continue;
            }
            const previous = anchors[col];
            if (previous && previous.toRow > previous.fromRow) spans.push(previous);
            anchors[col] = {
                fromRow: row,
                toRow: row,
                fromCol: col,
                toCol: col,
                kind: 'caret',
                cachedCells: null,
            };
        }
    }
    for (const anchor of anchors) {
        if (anchor?.toRow > anchor.fromRow) spans.push(anchor);
    }
    return spans;
}

function cloneState(state) {
    return {
        ...state,
        rows: state.rows.map(row => ({ ...row, cells: [...row.cells] })),
        separator: { ...state.separator, cells: [...state.separator.cells] },
        spans: state.spans.map(span => ({
            ...span,
            cachedCells: span.cachedCells?.map(cell => ({ ...cell })) || null,
        })),
    };
}

/** Parse one exact table plus Figaro merge metadata into an isolated draft. */
export function createMarkdownTableEditorState(source = '') {
    const exactSource = String(source ?? '');
    const { tableSource, metadataLines } = splitEditorSource(exactSource);
    const table = parseMarkdownTable(tableSource);
    if (!table.valid) return { valid: false, error: 'The Markdown table is not rectangular.' };

    const rows = [table.rows[0], ...table.rows.slice(2)].map(row => ({
        prefix: row.prefix,
        suffix: row.suffix,
        cells: row.cells.map(cell => cell.raw),
    }));
    const separator = {
        prefix: table.rows[1].prefix,
        suffix: table.rows[1].suffix,
        cells: table.rows[1].cells.map(cell => cell.raw),
    };
    const spans = caretSpans(rows);
    for (const line of metadataLines) {
        const span = parseMetadataSpan(line);
        if (!span
            || span.fromRow < 1
            || span.toRow >= rows.length
            || span.fromCol < 0
            || span.toCol >= table.columns
            || (span.fromRow === span.toRow && span.fromCol === span.toCol)
            || spans.some(existing => spansOverlap(existing, span))) {
            return { valid: false, error: 'The table contains invalid or overlapping merge metadata.' };
        }
        spans.push(span);
    }
    return {
        valid: true,
        originalSource: exactSource,
        rows,
        separator,
        spans,
        columns: table.columns,
    };
}

function serializeRow(row) {
    return `${row.prefix}${row.cells.join('|')}${row.suffix}`;
}

/** Serialize a draft without normalizing untouched authored cells. */
export function serializeMarkdownTableEditorState(state) {
    if (!state?.valid) return '';
    const lines = [serializeRow(state.rows[0]), serializeRow(state.separator)];
    for (const row of state.rows.slice(1)) lines.push(serializeRow(row));
    const metadata = state.spans
        .filter(span => span.kind === 'metadata')
        .sort((left, right) => left.fromRow - right.fromRow || left.fromCol - right.fromCol)
        .map(span => `<!-- figaro:table-merge ${tableCellAddress({ row: span.fromRow, col: span.fromCol })}:${tableCellAddress({ row: span.toRow, col: span.toCol })} -->`);
    return [...lines, ...metadata].join('\n');
}

export function markdownTableEditorCellValue(state, row, col) {
    return String(state?.rows?.[row]?.cells?.[col] ?? '').trim();
}

function withCellContent(raw, value) {
    const text = String(raw ?? '');
    const leading = text.match(/^\s*/u)?.[0] || '';
    const trailing = text.match(/\s*$/u)?.[0] || '';
    const content = String(value ?? '')
        .replace(/\r?\n/gu, '<br>')
        .replace(/(^|[^\\])\|/gu, '$1\\|');
    if (!content) return leading || trailing || ' ';
    return `${leading}${content}${trailing}`;
}

export function updateMarkdownTableEditorCell(state, row, col, value) {
    if (!state?.valid || !state.rows[row]?.cells?.[col] && state.rows[row]?.cells?.[col] !== '') return state;
    const next = cloneState(state);
    next.rows[row].cells[col] = withCellContent(next.rows[row].cells[col], value);
    return next;
}

export function markdownTableEditorSelection(anchor, head = anchor, rangeActive = false) {
    const safeAnchor = { row: Math.max(0, anchor?.row || 0), col: Math.max(0, anchor?.col || 0) };
    const safeHead = { row: Math.max(0, head?.row || 0), col: Math.max(0, head?.col || 0) };
    return { anchor: safeAnchor, head: safeHead, rangeActive: Boolean(rangeActive) };
}

export function markdownTableEditorSelectedCells(selection) {
    if (!selection?.rangeActive) return [];
    const range = normalizedSpan(selection.anchor, selection.head);
    const cells = [];
    for (let row = range.fromRow; row <= range.toRow; row += 1) {
        for (let col = range.fromCol; col <= range.toCol; col += 1) cells.push({ row, col });
    }
    return cells;
}

export function markdownTableEditorSpanAt(state, cell) {
    return state?.spans?.find(span => spanContains(span, cell)) || null;
}

function activeCell(selection) {
    return selection?.head || selection?.anchor || { row: 0, col: 0 };
}

function insertionCutsSpan(spans, axis, boundary) {
    const from = axis === 'row' ? 'fromRow' : 'fromCol';
    const to = axis === 'row' ? 'toRow' : 'toCol';
    return spans.some(span => boundary > span[from] && boundary <= span[to]);
}

function deletionCutsSpan(spans, axis, index) {
    const from = axis === 'row' ? 'fromRow' : 'fromCol';
    const to = axis === 'row' ? 'toRow' : 'toCol';
    return spans.some(span => index >= span[from] && index <= span[to]);
}

/** Return a contextual enabled state and the tooltip reason for one command. */
export function markdownTableEditorActionState(state, selection, action) {
    if (!state?.valid) return { enabled: false, reason: 'The Markdown table is invalid.' };
    const active = activeCell(selection);
    const selected = markdownTableEditorSelectedCells(selection);
    if (action === 'merge') {
        if (!selection?.rangeActive || selected.length < 2) {
            return { enabled: false, reason: 'Hold Shift and click another cell, drag across cells, or use Alt+Shift+Arrow to select at least two cells.' };
        }
        if (selected.some(cell => cell.row === 0)) {
            return { enabled: false, reason: 'Header cells cannot be merged.' };
        }
        const range = normalizedSpan(selection.anchor, selection.head);
        if (state.spans.some(span => spansOverlap(span, range))) {
            return { enabled: false, reason: 'Split the existing merged cell before merging this range.' };
        }
        return { enabled: true, reason: 'Merge the selected cells.' };
    }
    if (action === 'split') {
        const span = markdownTableEditorSpanAt(state, active);
        if (!span) return { enabled: false, reason: 'Place the focus in a merged cell to split it.' };
        if (selected.length && selected.some(cell => !spanContains(span, cell))) {
            return { enabled: false, reason: 'The selection must stay inside one merged cell.' };
        }
        return { enabled: true, reason: 'Split the focused merged cell.' };
    }
    if (action === 'add-row-above' || action === 'add-row-below') {
        if (action === 'add-row-above' && active.row === 0) {
            return { enabled: false, reason: 'A row cannot be inserted above the table header.' };
        }
        const boundary = action === 'add-row-above' ? active.row : active.row + 1;
        if (insertionCutsSpan(state.spans, 'row', boundary)) {
            return { enabled: false, reason: 'Split the merged cell before inserting through its row span.' };
        }
        return { enabled: true, reason: 'Insert a table row.' };
    }
    if (action === 'delete-row') {
        if (active.row === 0) return { enabled: false, reason: 'The table header cannot be deleted.' };
        if (deletionCutsSpan(state.spans, 'row', active.row)) {
            return { enabled: false, reason: 'Split the merged cell before deleting a row inside its span.' };
        }
        return { enabled: true, reason: 'Delete the focused row.' };
    }
    if (action === 'add-column-before' || action === 'add-column-after') {
        const boundary = action === 'add-column-before' ? active.col : active.col + 1;
        if (insertionCutsSpan(state.spans, 'column', boundary)) {
            return { enabled: false, reason: 'Split the merged cell before inserting through its column span.' };
        }
        return { enabled: true, reason: 'Insert a table column.' };
    }
    if (action === 'delete-column') {
        if (state.columns <= 1) return { enabled: false, reason: 'A Markdown table needs at least one column.' };
        if (deletionCutsSpan(state.spans, 'column', active.col)) {
            return { enabled: false, reason: 'Split the merged cell before deleting a column inside its span.' };
        }
        return { enabled: true, reason: 'Delete the focused column.' };
    }
    return { enabled: false, reason: 'That table command is unavailable.' };
}

function shiftSpans(spans, axis, boundary, amount, deleting = false) {
    const from = axis === 'row' ? 'fromRow' : 'fromCol';
    const to = axis === 'row' ? 'toRow' : 'toCol';
    const cellAxis = axis === 'row' ? 'row' : 'col';
    return spans.map(span => {
        const next = { ...span, cachedCells: span.cachedCells?.map(cell => ({ ...cell })) || null };
        if (deleting) {
            if (next[from] > boundary) next[from] -= 1;
            if (next[to] > boundary) next[to] -= 1;
            next.cachedCells?.forEach(cell => { if (cell[cellAxis] > boundary) cell[cellAxis] -= 1; });
        } else {
            if (next[from] >= boundary) next[from] += amount;
            if (next[to] >= boundary) next[to] += amount;
            next.cachedCells?.forEach(cell => { if (cell[cellAxis] >= boundary) cell[cellAxis] += amount; });
        }
        return next;
    });
}

function blankRow(template, columns) {
    return { prefix: template.prefix, suffix: template.suffix, cells: Array.from({ length: columns }, () => ' ') };
}

function mergeCellContent(state, cells) {
    return cells.map(cell => markdownTableEditorCellValue(state, cell.row, cell.col)).filter(Boolean).join('<br>');
}

/** Apply one local draft command. The caller owns modal history. */
export function applyMarkdownTableEditorAction(state, selection, action) {
    const availability = markdownTableEditorActionState(state, selection, action);
    if (!availability.enabled) return null;
    const next = cloneState(state);
    const active = activeCell(selection);
    let nextSelection;

    if (action === 'merge') {
        const range = normalizedSpan(selection.anchor, selection.head);
        const cells = markdownTableEditorSelectedCells(selection);
        const cachedCells = cells.map(cell => ({ ...cell, raw: next.rows[cell.row].cells[cell.col] }));
        const content = mergeCellContent(next, cells);
        next.rows[range.fromRow].cells[range.fromCol] = withCellContent(
            next.rows[range.fromRow].cells[range.fromCol],
            content,
        );
        for (const cell of cells) {
            if (cell.row === range.fromRow && cell.col === range.fromCol) continue;
            next.rows[cell.row].cells[cell.col] = ' ';
        }
        next.spans.push({ ...range, kind: 'metadata', cachedCells });
        nextSelection = markdownTableEditorSelection(
            { row: range.fromRow, col: range.fromCol },
            { row: range.toRow, col: range.toCol },
            true,
        );
    } else if (action === 'split') {
        const span = markdownTableEditorSpanAt(next, active);
        if (span.cachedCells?.length) {
            for (const cell of span.cachedCells) next.rows[cell.row].cells[cell.col] = cell.raw;
        } else {
            for (let row = span.fromRow; row <= span.toRow; row += 1) {
                for (let col = span.fromCol; col <= span.toCol; col += 1) {
                    if (row === span.fromRow && col === span.fromCol) continue;
                    next.rows[row].cells[col] = ' ';
                }
            }
        }
        next.spans = next.spans.filter(candidate => candidate !== span);
        nextSelection = markdownTableEditorSelection({ row: span.fromRow, col: span.fromCol });
    } else if (action === 'add-row-above' || action === 'add-row-below') {
        const insertAt = action === 'add-row-above' ? active.row : active.row + 1;
        const template = next.rows[Math.min(active.row, next.rows.length - 1)] || next.rows[0];
        next.rows.splice(insertAt, 0, blankRow(template, next.columns));
        next.spans = shiftSpans(next.spans, 'row', insertAt, 1);
        nextSelection = markdownTableEditorSelection({ row: insertAt, col: active.col });
    } else if (action === 'delete-row') {
        next.rows.splice(active.row, 1);
        next.spans = shiftSpans(next.spans, 'row', active.row, -1, true);
        nextSelection = markdownTableEditorSelection({
            row: Math.min(active.row, next.rows.length - 1),
            col: active.col,
        });
    } else {
        const deleting = action === 'delete-column';
        const insertAt = action === 'add-column-before' ? active.col : active.col + 1;
        const boundary = deleting ? active.col : insertAt;
        for (const row of next.rows) {
            if (deleting) row.cells.splice(active.col, 1);
            else row.cells.splice(insertAt, 0, ' ');
        }
        if (deleting) next.separator.cells.splice(active.col, 1);
        else next.separator.cells.splice(insertAt, 0, ' --- ');
        next.spans = shiftSpans(next.spans, 'column', boundary, deleting ? -1 : 1, deleting);
        next.columns += deleting ? -1 : 1;
        nextSelection = markdownTableEditorSelection({
            row: active.row,
            col: deleting ? Math.min(active.col, next.columns - 1) : insertAt,
        });
    }
    return { state: next, selection: nextSelection };
}

/** Extend a CodeMirror table range through immediately adjacent merge lines. */
export function markdownTableMetadataEnd(documentSource, tableTo) {
    const source = String(documentSource ?? '');
    let cursor = Math.max(0, Math.min(source.length, Number(tableTo) || 0));
    while (cursor < source.length) {
        const newline = source.startsWith('\r\n', cursor) ? '\r\n' : source[cursor] === '\n' ? '\n' : '';
        if (!newline) break;
        const lineFrom = cursor + newline.length;
        const lineEnd = source.indexOf('\n', lineFrom);
        const contentEnd = lineEnd < 0 ? source.length : (source[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd);
        if (!mergeLinePattern.test(source.slice(lineFrom, contentEnd))) break;
        cursor = contentEnd;
    }
    return cursor;
}

/** Remove private merge metadata before Markdown-It renders user-visible HTML. */
export function stripMarkdownTableMergeMetadata(markdown) {
    return String(markdown ?? '').replace(mergeLineGlobalPattern, '');
}

/** Find merge plans in table order for the shared live/PDF renderer. */
export function markdownTableMergePlans(markdown) {
    const lines = String(markdown ?? '').split(/\r?\n/u);
    const plans = [];
    for (let index = 0; index + 1 < lines.length; index += 1) {
        const first = parseMarkdownTable([lines[index], lines[index + 1]].join('\n'));
        if (!first.valid) continue;
        let end = index + 2;
        while (end < lines.length) {
            const candidate = parseMarkdownTable([...lines.slice(index, end), lines[end]].join('\n'));
            if (!candidate.valid) break;
            end += 1;
        }
        const visibleRows = 1 + Math.max(0, end - index - 2);
        const spans = [];
        let metadata = end;
        while (metadata < lines.length && mergeLinePattern.test(lines[metadata])) {
            const span = parseMetadataSpan(lines[metadata]);
            if (span && span.fromRow >= 1 && span.toRow < visibleRows
                && span.fromCol >= 0 && span.toCol < first.columns
                && !spans.some(existing => spansOverlap(existing, span))) spans.push(span);
            metadata += 1;
        }
        plans.push(spans);
        index = metadata - 1;
    }
    return plans;
}
