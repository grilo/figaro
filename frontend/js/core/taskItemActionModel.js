import { isISODate } from './dueDateModel.js';
import { normalizedKanbanColumns, semanticDueDateLink } from './taskDueDateCompletionModel.js';

const openTaskPrefix = /^[\t ]*[-*+][\t ]+\[ \](?=$|[\t ])/;
const dueLinkPattern = /\[due\s+(\d{4}-\d{2}-\d{2})\]\((\d{4}-\d{2}-\d{2})\.md\)/gi;

function semanticDueLinks(line) {
    const links = [];
    dueLinkPattern.lastIndex = 0;
    let match;
    while ((match = dueLinkPattern.exec(String(line || ''))) !== null) {
        if (match[1] !== match[2] || !isISODate(match[1])) continue;
        links.push({ from: match.index, to: match.index + match[0].length, date: match[1] });
    }
    return links;
}

function removeRangeAndAdjacentSpace(source, from, to) {
    const before = source.slice(0, from).replace(/[\t ]+$/, '');
    const after = source.slice(to).replace(/^[\t ]+/, '');
    return before && after ? `${before} ${after}` : before + after;
}

function withoutSemanticDueLinks(line, links) {
    let result = String(line || '');
    for (let index = links.length - 1; index >= 0; index--) {
        result = removeRangeAndAdjacentSpace(result, links[index].from, links[index].to);
    }
    return result.replace(/[\t ]+$/, '');
}

function appendToken(line, token) {
    const base = String(line || '').replace(/[\t ]+$/, '');
    return base ? `${base} ${token}` : token;
}

function standaloneTag(line, column) {
    const escaped = String(column || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)#${escaped}(?=\\s|$)`, 'i').test(String(line || ''));
}

/** Describe the two source actions available for one unfinished task item. */
export function taskItemActionPlan(line) {
    const source = String(line || '');
    if (!openTaskPrefix.test(source)) return null;
    const links = semanticDueLinks(source);
    return {
        dueDate: links[0]?.date || '',
        completionOffset: links[0]?.from ?? source.length,
    };
}

/** Add one Kanban column and leave every valid due link after all task text/tags. */
export function planTaskItemKanbanSelection(line, column) {
    const source = String(line || '');
    if (!taskItemActionPlan(source)) return null;
    const normalized = normalizedKanbanColumns([column])
        .find(candidate => candidate === String(column || '').toLowerCase());
    if (!normalized) return null;

    const links = semanticDueLinks(source);
    let next = withoutSemanticDueLinks(source, links);
    if (!standaloneTag(next, normalized)) next = appendToken(next, `#${normalized}`);
    if (links[0]) next = appendToken(next, semanticDueDateLink(links[0].date));
    return { text: next, selectionOffset: next.length };
}

/** Set or clear one due date, always serializing it after existing task tags. */
export function planTaskItemDueDateSelection(line, date) {
    const source = String(line || '');
    if (!taskItemActionPlan(source) || (date && !isISODate(date))) return null;
    const links = semanticDueLinks(source);
    let next = withoutSemanticDueLinks(source, links);
    if (date) next = appendToken(next, semanticDueDateLink(date));
    return { text: next, selectionOffset: next.length };
}
