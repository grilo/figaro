import {
    hashtagCompletionPlan,
    planTaggedLineDueDateInsertion,
    taggedLineDueDateActionPlan,
} from './core/taskDueDateCompletionModel.js';
import { localISODate, shiftISODate } from './core/dueDateModel.js';

export function createTaskDueDateCompletionSource({
    getColumns = () => [],
    now = () => new Date(),
    openPicker = null,
    contextAllowed = () => true,
} = {}) {
    return context => {
        if (!contextAllowed(context)) return null;
        const line = context.state.doc.lineAt(context.pos);
        const cursorOffset = context.pos - line.from;
        const duePlan = taggedLineDueDateActionPlan(line.text, cursorOffset);
        if (duePlan) {
            const position = line.from + duePlan.fromOffset;
            const today = localISODate(now());
            const tomorrow = shiftISODate(today, 1);
            return {
                from: position,
                filter: false,
                options: [
                    {
                        label: 'Add due date…',
                        detail: `for #${duePlan.column}`,
                        type: 'keyword',
                        apply: view => {
                            if (typeof openPicker !== 'function') return;
                            queueMicrotask(() => {
                                if (view.isDestroyed) return;
                                openPicker({
                                    view,
                                    position,
                                    now,
                                    onSelect: date => insertPickedDueDate(
                                        view,
                                        position,
                                        duePlan.column,
                                        date,
                                    ),
                                });
                            });
                        },
                    },
                    dueShortcutOption('Due today', duePlan.column, today, position),
                    dueShortcutOption('Due tomorrow', duePlan.column, tomorrow, position),
                ],
            };
        }

        const plan = hashtagCompletionPlan(
            line.text,
            cursorOffset,
            getColumns(),
        );
        if (!plan) return null;

        const from = line.from + plan.fromOffset;
        const options = plan.columns.slice(0, 20).map(column => ({
            label: `#${column}`,
            detail: 'Kanban column',
            type: 'keyword',
            apply: (view, _completion, applyFrom, applyTo) => {
                const replacement = `#${column}`;
                view.dispatch({
                    changes: { from: applyFrom, to: applyTo, insert: replacement },
                    selection: { anchor: applyFrom + replacement.length },
                });
            },
        }));

        return { from, options, filter: false };
    };
}

function dueShortcutOption(label, column, date, position) {
    return {
        label,
        detail: date,
        type: 'keyword',
        apply: view => insertPickedDueDate(view, position, column, date),
    };
}

function insertPickedDueDate(view, absoluteCursor, column, date) {
    if (!date || view.isDestroyed) return false;
    const bounded = Math.max(0, Math.min(absoluteCursor, view.state.doc.length));
    const line = view.state.doc.lineAt(bounded);
    const change = planTaggedLineDueDateInsertion(line.text, bounded - line.from, column, date);
    if (!change) return false;
    const from = line.from + change.from;
    view.dispatch({
        changes: { from, to: line.from + change.to, insert: change.insert },
        selection: { anchor: from + change.insert.length },
    });
    return true;
}

export default { createTaskDueDateCompletionSource };
