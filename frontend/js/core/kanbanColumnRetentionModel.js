/**
 * Emptied Kanban columns stay visible for the rest of an open board session.
 * The backend derives columns from hashtags still in use, so a column whose
 * last card moved away disappears from its list; the board keeps showing it
 * until the board is closed, and the next opening shows only live columns.
 */

const systemColumns = new Set(['todo', 'wip', 'done']);

/** Custom columns rendered before a refresh that the refresh no longer lists. */
export function droppedKanbanColumns(previousOrder, currentColumns) {
    const current = new Set(currentColumns);
    return previousOrder.filter(column => !current.has(column) && !systemColumns.has(column));
}

/**
 * Current columns plus retained ones, each retained column placed after the
 * nearest column that preceded it in the previous render.
 */
export function kanbanColumnsWithRetained(previousOrder, currentColumns, retained) {
    const result = [...currentColumns];
    for (const column of previousOrder) {
        if (!retained.has(column) || result.includes(column)) continue;
        const before = previousOrder.slice(0, previousOrder.indexOf(column)).reverse().find(item => result.includes(item));
        result.splice(before === undefined ? 0 : result.indexOf(before) + 1, 0, column);
    }
    return result;
}

/** Rename one column in a render order without moving it. */
export function renameKanbanColumnInOrder(order, oldName, newName) {
    return order.map(column => column === oldName ? newName : column);
}
