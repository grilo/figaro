import { hashtagCompletionPlan } from './core/taskDueDateCompletionModel.js';

export function createTaskDueDateCompletionSource({
    getColumns = () => [],
    contextAllowed = () => true,
} = {}) {
    return context => {
        if (!contextAllowed(context)) return null;
        const line = context.state.doc.lineAt(context.pos);
        const cursorOffset = context.pos - line.from;
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
