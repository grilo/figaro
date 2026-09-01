import { normalizedKanbanColumns } from './taskDueDateCompletionModel.js';
import { taskLineTokens } from './taskLineTokens.js';

const openTaskPrefix = /^[\t ]*[-*+][\t ]+\[ \](?=$|[\t ])/;

/** Metadata actions do not interpret or reorder Markdown links. */
export function taskItemActionPlan(line) {
    const source = String(line || '');
    return openTaskPrefix.test(source) ? { completionOffset: source.length } : null;
}

export function planTaskItemKanbanSelection(line, column) {
    const source = String(line || '');
    if (!taskItemActionPlan(source)) return null;
    const normalized = normalizedKanbanColumns([column])
        .find(candidate => candidate === String(column || '').toLowerCase());
    if (!normalized) return null;
    const tags = taskLineTokens(source).filter(token => token.kind === 'tag');
    const present = tags.some(token => token.value === normalized);
    const next = present ? source : tags.length === 1
        ? source.slice(0, tags[0].from) + `#${normalized}` + source.slice(tags[0].to)
        : `${source.replace(/[\t ]+$/, '')} #${normalized}`;
    return { text: next, selectionOffset: next.length };
}
