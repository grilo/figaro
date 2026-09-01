import { startCompletion } from '@codemirror/autocomplete';
import { isolateHistory } from '@codemirror/commands';
import { normalizedKanbanColumns } from './core/taskDueDateCompletionModel.js';
import {
    planTaskItemKanbanSelection,
    taskItemActionPlan,
} from './core/taskItemActionModel.js';

const pendingRequests = new WeakMap();

/** Open CodeMirror's existing suggestion list for one unfinished task line. */
export function requestTaskItemKanbanCompletion(view, lineFrom) {
    if (!view || view.isDestroyed) return false;
    const bounded = Math.max(0, Math.min(Number(lineFrom) || 0, view.state.doc.length));
    const line = view.state.doc.lineAt(bounded);
    const plan = taskItemActionPlan(line.text);
    if (!plan) return false;

    const position = line.from + plan.completionOffset;
    pendingRequests.set(view, { lineFrom: line.from, lineText: line.text, position });
    view.dispatch({
        selection: { anchor: position },
        scrollIntoView: true,
    });
    view.focus();
    return startCompletion(view);
}

export function createTaskItemKanbanCompletionSource({ getColumns = () => [] } = {}) {
    return context => {
        const view = context.view;
        const request = view ? pendingRequests.get(view) : null;
        if (!request || !context.explicit || context.pos !== request.position) return null;
        pendingRequests.delete(view);

        const line = context.state.doc.lineAt(request.lineFrom);
        if (line.from !== request.lineFrom || line.text !== request.lineText || !taskItemActionPlan(line.text)) return null;
        const options = normalizedKanbanColumns(getColumns()).map(column => ({
            label: `#${column}`,
            detail: 'Kanban column',
            type: 'keyword',
            apply: targetView => {
                if (targetView.isDestroyed) return;
                const currentLine = targetView.state.doc.lineAt(
                    Math.min(request.lineFrom, targetView.state.doc.length),
                );
                if (currentLine.from !== request.lineFrom) return;
                const plan = planTaskItemKanbanSelection(currentLine.text, column);
                if (!plan) return;
                targetView.dispatch({
                    changes: { from: currentLine.from, to: currentLine.to, insert: plan.text },
                    selection: { anchor: currentLine.from + plan.selectionOffset },
                    userEvent: 'input.task-kanban',
                    annotations: isolateHistory.of('full'),
                });
                targetView.focus();
            },
        }));

        return { from: context.pos, filter: false, options };
    };
}
