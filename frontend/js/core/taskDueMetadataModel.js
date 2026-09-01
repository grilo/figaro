import { isISODate } from './dueDateModel.js';
import { taskItemActionPlan, planTaskItemKanbanSelection } from './taskItemActionModel.js';
import { calendarDateLink, taskLineTokens } from './taskLineTokens.js';

/** One line-scoped source transaction; only task lines also request metadata. */
export function taskDueMetadataPlan(documentText, position, range, date, style = 'markdown') {
    if (date && !isISODate(date)) return null;
    const source = String(documentText);
    if (!Number.isInteger(position) || position < 0 || position > source.length) return null;
    const from = position === 0 ? 0 : source.lastIndexOf('\n', position - 1) + 1;
    const nextBreak = source.indexOf('\n', position);
    const to = nextBreak < 0 ? source.length : nextBreak;
    let line = source.slice(from, to);
    const tokens = taskLineTokens(line);
    const dates = tokens.filter(token => token.kind.startsWith('date'));
    const hasColumn = tokens.some(token => token.kind === 'tag');
    const isTask = hasColumn || Boolean(taskItemActionPlan(line));
    const link = date ? calendarDateLink(date, style) : '';
    let selectionOffset;
    if (range) {
        if (range.from < from || range.to > to || !/^@(?:d(?:a(?:t(?:e)?)?)?)?$/i.test(source.slice(range.from, range.to))) return null;
        const commandFrom = range.from - from;
        const commandTo = range.to - from;
        if (date && dates.length === 1) {
            const existing = dates[0];
            let removeFrom = commandFrom, removeTo = commandTo;
            if (/[\t ]/.test(line[removeFrom - 1] || '')) removeFrom--;
            else if (/[\t ]/.test(line[removeTo] || '')) removeTo++;
            const edits = [{ from: existing.from, to: existing.to, insert: link }, { from: removeFrom, to: removeTo, insert: '' }];
            for (const edit of edits.sort((a, b) => b.from - a.from)) {
                line = line.slice(0, edit.from) + edit.insert + line.slice(edit.to);
            }
            selectionOffset = existing.from + link.length - (removeTo <= existing.from ? removeTo - removeFrom : 0);
        } else {
            line = line.slice(0, commandFrom) + link + line.slice(commandTo);
            selectionOffset = commandFrom + link.length;
        }
    } else if (date) {
        line = dates.length === 1
            ? line.slice(0, dates[0].from) + link + line.slice(dates[0].to)
            : `${line.trimEnd()} ${link}`;
    }
    if (isTask && !hasColumn) {
        line = planTaskItemKanbanSelection(line, 'todo').text;
    }
    const content = source.slice(0, from) + line + source.slice(to);
    selectionOffset ??= line.length;
    return { from, to, line, content, isTask, selectionOffset, lineNumber: source.slice(0, from).split('\n').length };
}
