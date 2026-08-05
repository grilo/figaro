import { isISODate, parseDueDateLink } from './dueDateModel.js';

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

export function isExplicitUnfinishedTaskLine(line) {
    return /^\s*(?:[-+*]|\d+[.)])\s+\[\s\](?:\s+|$)/.test(String(line || ''));
}

export function hashtagTaskCompletionPlan(line, cursorOffset, columns = []) {
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

    const canSchedule = isExplicitUnfinishedTaskLine(source) && !parseDueDateLink(source);
    return {
        fromOffset: cursor - token.length,
        prefix,
        columns: matchingColumns,
        dueColumn: canSchedule && matchingColumns.includes(prefix) ? prefix : '',
        canSchedule,
    };
}

export function semanticDueDateLink(date) {
    return isISODate(date) ? `[due ${date}](${date}.md)` : '';
}

export function taskDueDateCompletionText(column, date) {
    const link = semanticDueDateLink(date);
    return validColumn.test(String(column || '')) && link ? `#${column} ${link}` : '';
}

export function planTaskDueDateInsertion(line, tagEndOffset, column, date) {
    const source = String(line || '');
    const tagEnd = Number(tagEndOffset);
    const tag = `#${String(column || '').toLowerCase()}`;
    const link = semanticDueDateLink(date);
    if (!link || !validColumn.test(tag.slice(1)) || !Number.isInteger(tagEnd)) return null;
    if (tagEnd < tag.length || tagEnd > source.length) return null;
    if (source.slice(tagEnd - tag.length, tagEnd).toLowerCase() !== tag) return null;
    const next = source.slice(tagEnd, tagEnd + 1);
    if ((next && !/\s/.test(next)) || !isExplicitUnfinishedTaskLine(source) || parseDueDateLink(source)) return null;
    return { from: tagEnd, to: tagEnd, insert: ` ${link}` };
}
