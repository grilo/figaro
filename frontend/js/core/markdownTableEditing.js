function isEscaped(value, index) {
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashes += 1;
    return slashes % 2 === 1;
}

function tablePipes(line) {
    const positions = [];
    for (let index = 0; index < line.length; index += 1) {
        if (line[index] === '|' && !isEscaped(line, index)) positions.push(index);
    }
    return positions;
}

/** Split one GFM row while preserving every cell's authored whitespace. */
export function parseMarkdownTableRow(line = '') {
    const text = String(line ?? '');
    const pipes = tablePipes(text);
    const firstVisible = text.search(/\S/);
    const lastVisible = firstVisible < 0 ? -1 : text.search(/\s*$/) - 1;
    const leadingPipe = firstVisible >= 0 && text[firstVisible] === '|' && pipes.includes(firstVisible);
    const trailingPipe = lastVisible >= 0 && text[lastVisible] === '|' && pipes.includes(lastVisible);
    const innerFrom = leadingPipe ? firstVisible + 1 : 0;
    const innerTo = trailingPipe ? lastVisible : text.length;
    const separators = pipes.filter(position => position >= innerFrom && position < innerTo);
    const cells = [];
    let cursor = innerFrom;
    for (const separator of separators) {
        cells.push({ from: cursor, to: separator, raw: text.slice(cursor, separator) });
        cursor = separator + 1;
    }
    cells.push({ from: cursor, to: innerTo, raw: text.slice(cursor, innerTo) });
    return {
        source: text,
        prefix: text.slice(0, innerFrom),
        suffix: text.slice(innerTo),
        cells,
    };
}

function separatorCell(cell) {
    return /^:?-{3,}:?$/.test(String(cell?.raw || '').trim());
}

/** Parse a rectangular GFM table without normalizing its source. */
export function parseMarkdownTable(source = '') {
    const text = String(source ?? '');
    const lines = text.split('\n');
    const rows = lines.map(parseMarkdownTableRow);
    const columns = rows[0]?.cells.length || 0;
    const valid = rows.length >= 2
        && columns > 0
        && rows.every(row => row.cells.length === columns)
        && rows[1].cells.every(separatorCell);
    return { source: text, lines, rows, columns, valid };
}

function lineOffsets(lines) {
    const offsets = [];
    let offset = 0;
    for (const line of lines) {
        offsets.push(offset);
        offset += line.length + 1;
    }
    return offsets;
}

function cursorOffsetFor(lines, rowIndex, columnIndex) {
    const offsets = lineOffsets(lines);
    const row = parseMarkdownTableRow(lines[rowIndex] || '');
    const cell = row.cells[Math.max(0, Math.min(row.cells.length - 1, columnIndex))];
    if (!cell) return offsets[rowIndex] || 0;
    const leadingSpace = cell.raw.search(/\S/);
    return (offsets[rowIndex] || 0) + cell.from + (leadingSpace < 0 ? cell.raw.length : leadingSpace);
}

/** Resolve one rendered table cell to its first authored content position. */
export function markdownTableCellCursorOffset(source, rowIndex, columnIndex) {
    const tableSource = String(source ?? '').split('\n').filter(line => (
        !/^\s*<!--\s*figaro:table-merge\s+[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*\s*-->\s*$/iu.test(line)
    )).join('\n');
    const table = parseMarkdownTable(tableSource);
    const row = Number(rowIndex);
    const column = Number(columnIndex);
    if (!table.valid || !Number.isInteger(row) || !Number.isInteger(column)
        || row < 0 || row >= table.rows.length || column < 0 || column >= table.columns) {
        return null;
    }
    return cursorOffsetFor(table.lines, row, column);
}
