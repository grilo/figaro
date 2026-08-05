import {
    hashtagTaskCompletionPlan,
    planTaskDueDateInsertion,
    taskDueDateCompletionText,
} from './core/taskDueDateCompletionModel.js';
import { localISODate, shiftISODate } from './core/dueDateModel.js';

export function createTaskDueDateCompletionSource({
    getColumns = () => [],
    now = () => new Date(),
    openPicker = null,
    restartCompletion = null,
    contextAllowed = () => true,
} = {}) {
    return context => {
        if (!contextAllowed(context)) return null;
        const line = context.state.doc.lineAt(context.pos);
        const plan = hashtagTaskCompletionPlan(
            line.text,
            context.pos - line.from,
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
                if (plan.canSchedule && typeof restartCompletion === 'function') {
                    queueMicrotask(() => {
                        if (!view.isDestroyed) restartCompletion(view);
                    });
                }
            },
        }));

        if (plan.dueColumn) {
            const today = localISODate(now());
            const tomorrow = shiftISODate(today, 1);
            options.push(
                {
                    label: 'Add due date…',
                    detail: `for #${plan.dueColumn}`,
                    type: 'keyword',
                    apply: (view, _completion, applyFrom, applyTo) => {
                        const replacement = `#${plan.dueColumn}`;
                        const tagEnd = applyFrom + replacement.length;
                        view.dispatch({
                            changes: { from: applyFrom, to: applyTo, insert: replacement },
                            selection: { anchor: tagEnd },
                        });
                        if (typeof openPicker !== 'function') return;
                        queueMicrotask(() => {
                            if (view.isDestroyed) return;
                            openPicker({
                                view,
                                position: tagEnd,
                                now,
                                onSelect: date => insertPickedDueDate(view, tagEnd, plan.dueColumn, date),
                            });
                        });
                    },
                },
                dueShortcutOption('Due today', plan.dueColumn, today),
                dueShortcutOption('Due tomorrow', plan.dueColumn, tomorrow),
            );
        }

        return { from, options, filter: false };
    };
}

function dueShortcutOption(label, column, date) {
    return {
        label,
        detail: date,
        type: 'keyword',
        apply: (view, _completion, from, to) => {
            const replacement = taskDueDateCompletionText(column, date);
            view.dispatch({
                changes: { from, to, insert: replacement },
                selection: { anchor: from + replacement.length },
            });
        },
    };
}

function insertPickedDueDate(view, absoluteTagEnd, column, date) {
    if (!date || view.isDestroyed) return false;
    const bounded = Math.max(0, Math.min(absoluteTagEnd, view.state.doc.length));
    const line = view.state.doc.lineAt(bounded);
    const change = planTaskDueDateInsertion(line.text, bounded - line.from, column, date);
    if (!change) return false;
    const from = line.from + change.from;
    view.dispatch({
        changes: { from, to: line.from + change.to, insert: change.insert },
        selection: { anchor: from + change.insert.length },
    });
    return true;
}

export default { createTaskDueDateCompletionSource };
