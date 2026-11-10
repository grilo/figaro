import {
    droppedKanbanColumns, kanbanColumnHashtag, kanbanColumnNameError, kanbanColumnsWithRetained, renameKanbanColumnInOrder,
} from '../../../frontend/js/core/kanbanColumnRetentionModel.js';

test('only custom columns that vanished from a refresh are retention candidates', () => {
    expect(droppedKanbanColumns(['alpha', 'urgent', 'todo', 'wip', 'done'], ['alpha', 'todo', 'done'])).toEqual(['urgent']);
});

test('retained columns return to their previous position among live columns', () => {
    const previous = ['alpha', 'urgent', 'zeta', 'todo', 'wip', 'done'];
    expect(kanbanColumnsWithRetained(previous, ['alpha', 'zeta', 'todo', 'wip', 'done'], new Set(['urgent'])))
        .toEqual(['alpha', 'urgent', 'zeta', 'todo', 'wip', 'done']);
    expect(kanbanColumnsWithRetained(['urgent', 'todo', 'wip', 'done'], ['todo', 'wip', 'done'], new Set(['urgent'])))
        .toEqual(['urgent', 'todo', 'wip', 'done']);
    // A retained column that has cards again is listed once.
    expect(kanbanColumnsWithRetained(previous, previous, new Set(['urgent']))).toEqual(previous);
    expect(kanbanColumnsWithRetained(previous, ['todo', 'wip', 'done'], new Set())).toEqual(['todo', 'wip', 'done']);
});

test('renaming keeps the column in place', () => {
    expect(renameKanbanColumnInOrder(['a', 'b', 'todo'], 'b', 'c')).toEqual(['a', 'c', 'todo']);
});

test('refuses a column name that reads as a color code or is not a hashtag', () => {
    expect(kanbanColumnHashtag('  Next Up ')).toBe('next-up');
    expect(kanbanColumnNameError('Next Up', { current: 'ideas', existing: ['todo', 'ideas'] })).toBe('');
    expect(kanbanColumnNameError('ideas', { current: 'ideas', existing: ['todo', 'ideas'] })).toBe('');
    expect(kanbanColumnNameError('todo', { current: 'ideas', existing: ['todo', 'ideas'] })).toBe('#todo already exists.');
    expect(kanbanColumnNameError('2026')).toMatch(/Start with a letter/);
    // #bad, #add and #decade are hex colors, which are never hashtags.
    for (const name of ['bad', 'ADD', 'decade', 'Facade']) {
        expect(kanbanColumnNameError(name)).toMatch(/reads as a color code/);
    }
    for (const name of ['bade', 'added', 'be', 'badger']) expect(kanbanColumnNameError(name)).toBe('');
});
