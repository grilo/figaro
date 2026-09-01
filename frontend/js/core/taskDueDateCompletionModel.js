const systemColumns = ['todo', 'wip', 'done'];
const validColumn = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function normalizedKanbanColumns(columns = []) {
    const result = [];
    const seen = new Set();
    for (const column of [...systemColumns, ...(Array.isArray(columns) ? columns : [])]) {
        const normalized = String(column || '').toLowerCase();
        if (!validColumn.test(normalized) || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

export function hashtagCompletionPlan(line, cursorOffset, columns = []) {
    const source = String(line || '');
    const cursor = Number(cursorOffset);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > source.length) return null;
    const before = source.slice(0, cursor);
    // A leading # remains available for Markdown headings. Inline tags have a
    // whitespace boundary, matching Figaro's existing hashtag contract.
    const match = before.match(/\s(#([a-zA-Z][a-zA-Z0-9_-]*)?)$/);
    if (!match) return null;
    const next = source.slice(cursor, cursor + 1);
    if (next && !/\s/.test(next)) return null;

    const token = match[1];
    const prefix = String(match[2] || '').toLowerCase();
    const matchingColumns = normalizedKanbanColumns(columns)
        .filter(column => column.startsWith(prefix));
    if (matchingColumns.length === 0) return null;

    return {
        fromOffset: cursor - token.length,
        prefix,
        columns: matchingColumns,
    };
}

export function isHashtagCompletionTrigger(textBeforeCursor) {
    const source = String(textBeforeCursor || '');
    return /\s#[a-zA-Z0-9_-]*$/.test(source);
}
