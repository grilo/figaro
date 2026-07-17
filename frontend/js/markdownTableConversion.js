const delimiterCharacters = {
    tab: '\t',
    comma: ',',
    pipe: '|',
};

const delimiterLabels = {
    tab: 'Tab',
    comma: 'Comma',
    pipe: 'Pipe',
};

function isBlankRow(row) {
    return row.every(cell => !String(cell || '').trim());
}

function trimBlankEdgeRows(rows) {
    const result = rows.map(row => [...row]);
    while (result.length && isBlankRow(result[0])) result.shift();
    while (result.length && isBlankRow(result[result.length - 1])) result.pop();
    return result;
}

function stripPipeBoundaries(rows) {
    const result = rows.map(row => [...row]);
    if (result.length && result.every(row => !String(row[0] || '').trim())) {
        result.forEach(row => row.shift());
    }
    if (result.length && result.every(row => !String(row[row.length - 1] || '').trim())) {
        result.forEach(row => row.pop());
    }
    return result;
}

function parseDelimitedRows(source, delimiter) {
    const text = String(source ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    let quoteClosed = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const next = text[index + 1];

        if (quoted) {
            if (character === '"' && next === '"') {
                cell += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
                quoteClosed = true;
            } else {
                cell += character;
            }
            continue;
        }

        if (character === '"' && !cell.trim() && !quoteClosed) {
            quoted = true;
            cell = '';
            continue;
        }
        if (delimiter === '|' && character === '\\' && next === '|') {
            cell += '|';
            index += 1;
            continue;
        }
        if (character === delimiter) {
            row.push(cell.trim());
            cell = '';
            quoteClosed = false;
            continue;
        }
        if (character === '\n') {
            row.push(cell.trim());
            rows.push(row);
            row = [];
            cell = '';
            quoteClosed = false;
            continue;
        }
        if (quoteClosed && character.trim()) {
            return { ok: false, error: 'Text after a closing quote is not valid tabular data.' };
        }
        cell += character;
    }

    if (quoted) return { ok: false, error: 'A quoted cell is missing its closing quote.' };
    row.push(cell.trim());
    rows.push(row);
    return { ok: true, rows };
}

function markdownSeparatorRow(row) {
    return row.length > 1 && row.every(cell => /^:?-{3,}:?$/.test(String(cell || '').trim()));
}

/** Parse text using one explicit delimiter and validate its rectangular shape. */
export function parseTabularText(source, delimiterName) {
    const delimiter = delimiterCharacters[delimiterName];
    if (!delimiter) return { ok: false, error: 'Choose a supported delimiter.' };

    const parsed = parseDelimitedRows(source, delimiter);
    if (!parsed.ok) return parsed;
    let rows = trimBlankEdgeRows(parsed.rows);
    if (delimiterName === 'pipe') rows = stripPipeBoundaries(rows);
    if (rows.length < 2) {
        return { ok: false, error: 'A table needs at least two rows.' };
    }

    const columns = rows[0]?.length || 0;
    if (columns < 2) {
        return { ok: false, error: `No ${delimiterLabels[delimiterName].toLowerCase()}-separated columns were found.` };
    }
    if (rows.some(row => row.length !== columns)) {
        return { ok: false, error: 'Every row must contain the same number of columns.' };
    }

    const alreadyMarkdown = delimiterName === 'pipe' && markdownSeparatorRow(rows[1]);
    if (alreadyMarkdown) rows = [rows[0], ...rows.slice(2)];
    if (rows.length < 2) {
        return { ok: false, error: 'A table needs a header and at least one data row.' };
    }

    return {
        ok: true,
        delimiter: delimiterName,
        delimiterLabel: delimiterLabels[delimiterName],
        rows,
        columns,
        alreadyMarkdown,
    };
}

/** Detect a rectangular CSV, TSV, or pipe-delimited selection. */
export function analyzeTabularText(source, options = {}) {
    const requestedDelimiter = options.delimiter || 'auto';
    if (requestedDelimiter !== 'auto') return parseTabularText(source, requestedDelimiter);

    const text = String(source ?? '');
    const candidates = [];
    for (const delimiter of ['tab', 'pipe', 'comma']) {
        if (!text.includes(delimiterCharacters[delimiter])) continue;
        const parsed = parseTabularText(text, delimiter);
        if (!parsed.ok) continue;
        const confidence = (delimiter === 'tab' ? 300 : delimiter === 'pipe' ? 200 : 100)
            + parsed.rows.length * 2 + parsed.columns;
        candidates.push({ ...parsed, confidence });
    }
    if (!candidates.length) {
        return { ok: false, error: 'Select at least two consistent CSV, TSV, or pipe-delimited rows.' };
    }
    candidates.sort((left, right) => right.confidence - left.confidence);
    return candidates[0];
}

function markdownCell(value) {
    return String(value ?? '')
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .replaceAll('\\', '\\\\')
        .replaceAll('|', '\\|')
        .replaceAll('\n', '<br>');
}

/** Serialize rectangular cells as a portable GFM table. */
export function markdownTableFromRows(rows, options = {}) {
    const values = Array.isArray(rows) ? rows.map(row => Array.from(row || [], markdownCell)) : [];
    if (!values.length || !values[0]?.length) return '';
    const columns = values[0].length;
    const firstRowIsHeader = options.firstRowIsHeader !== false;
    const header = firstRowIsHeader
        ? values[0]
        : Array.from({ length: columns }, (_, index) => `Column ${index + 1}`);
    const body = firstRowIsHeader ? values.slice(1) : values;
    const line = row => `| ${row.join(' | ')} |`;
    return [line(header), line(Array(columns).fill('---')), ...body.map(line)].join('\n');
}

function trailingNewlineCount(text) {
    const match = String(text || '').match(/\n+$/);
    return match ? match[0].length : 0;
}

function leadingNewlineCount(text) {
    const match = String(text || '').match(/^\n+/);
    return match ? match[0].length : 0;
}

/** Add safe block boundaries without changing any text outside the range. */
export function markdownTableInsertion(documentText, range, markdown) {
    const text = String(documentText ?? '');
    const from = Math.max(0, Number(range?.from) || 0);
    const to = Math.max(from, Number(range?.to) || from);
    const before = text.slice(0, from);
    const after = text.slice(to);
    const prefix = before.length ? '\n'.repeat(Math.max(0, 2 - trailingNewlineCount(before))) : '';
    const suffix = after.length ? '\n'.repeat(Math.max(0, 2 - leadingNewlineCount(after))) : '';
    const table = String(markdown || '');
    return {
        insert: `${prefix}${table}${suffix}`,
        cursorOffset: prefix.length + table.length,
    };
}

function htmlCellText(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('br').forEach(breakElement => breakElement.replaceWith('\n'));
    return String(clone.textContent || '').replace(/\u00a0/g, ' ').trim();
}

/** Extract the first simple rectangular HTML table from clipboard markup. */
export function parseHTMLTable(html) {
    if (typeof DOMParser === 'undefined') return { ok: false, error: 'HTML clipboard data is unavailable.' };
    const clipboardDocument = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const table = clipboardDocument.querySelector('table');
    if (!table) return { ok: false, error: 'No HTML table was found.' };

    const rowElements = [...table.querySelectorAll('tr')]
        .filter(row => row.closest('table') === table);
    const rows = rowElements.map(row => [...row.children]
        .filter(cell => /^(TH|TD)$/i.test(cell.tagName))
        .flatMap(cell => Array.from({ length: Math.max(1, Number(cell.colSpan) || 1) }, (_, index) =>
            index === 0 ? htmlCellText(cell) : ''
        )));
    const values = trimBlankEdgeRows(rows);
    if (values.length < 2 || values[0].length < 2 || values.some(row => row.length !== values[0].length)) {
        return { ok: false, error: 'The clipboard HTML table is not a rectangular table with at least two rows and columns.' };
    }
    if (rowElements.some(row => [...row.children].some(cell => Number(cell.rowSpan) > 1))) {
        return { ok: false, error: 'Tables with vertically merged cells cannot be converted safely.' };
    }

    const firstRowIsHeader = Boolean(rowElements[0]?.closest('thead'))
        || [...rowElements[0].children].every(cell => cell.tagName?.toLowerCase() === 'th');
    return {
        ok: true,
        delimiter: 'html',
        delimiterLabel: 'HTML table',
        rows: values,
        columns: values[0].length,
        firstRowIsHeader,
        alreadyMarkdown: false,
    };
}

/** Convert only high-confidence clipboard data or safely bound existing GFM. */
export function markdownTableFromClipboard({ text = '', html = '', mimeType = '' } = {}) {
    if (html) {
        const parsedHTML = parseHTMLTable(html);
        if (parsedHTML.ok) {
            return {
                ...parsedHTML,
                // Clipboard tables need a Markdown header. Treat the first
                // copied row consistently with TSV/CSV even when spreadsheet
                // HTML uses <td> rather than semantic <th> elements.
                firstRowIsHeader: true,
                markdown: markdownTableFromRows(parsedHTML.rows),
            };
        }
    }

    const parsed = analyzeTabularText(text);
    if (!parsed.ok) return null;
    if (parsed.alreadyMarkdown) {
        return {
            ...parsed,
            firstRowIsHeader: true,
            // Preserve the existing separator/alignment source; insertion
            // only contributes blank block boundaries around it.
            markdown: String(text || '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim(),
        };
    }
    const normalizedMime = String(mimeType || '').toLowerCase();
    const explicitCSV = normalizedMime.includes('csv');
    // Two lines of comma-containing prose are too easy to misclassify. CSV
    // clipboard MIME is explicit; otherwise require at least three rows.
    if (parsed.delimiter === 'comma' && !explicitCSV && parsed.rows.length < 3) return null;
    return {
        ...parsed,
        firstRowIsHeader: true,
        markdown: markdownTableFromRows(parsed.rows),
    };
}

export const supportedTableDelimiters = Object.freeze({ ...delimiterLabels });
