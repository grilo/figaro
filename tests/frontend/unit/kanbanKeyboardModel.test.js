import {
    adjacentKanbanColumn,
    applyKanbanCardOrder,
    kanbanCardOrderRef,
    reorderKanbanCardRefs,
} from '../frontend/js/core/kanbanKeyboardModel.js';

describe('Kanban keyboard decisions', () => {
    const refs = [
        { file: 'tasks.md', line: 1, text: 'First' },
        { file: 'tasks.md', line: 2, text: 'Second' },
        { file: 'tasks.md', line: 3, text: 'Third' },
    ];

    test('moves a card one vertical position without mutating the input', () => {
        const result = reorderKanbanCardRefs(refs, 1, -1);
        expect(result).toEqual({
            changed: true,
            targetIndex: 0,
            refs: [refs[1], refs[0], refs[2]],
        });
        expect(refs.map(card => card.text)).toEqual(['First', 'Second', 'Third']);
        expect(reorderKanbanCardRefs(refs, 0, -1).changed).toBe(false);
    });

    test('chooses only an immediately adjacent column', () => {
        const columns = ['todo', 'wip', 'done'];
        expect(adjacentKanbanColumn(columns, 'wip', -1)).toBe('todo');
        expect(adjacentKanbanColumn(columns, 'wip', 1)).toBe('done');
        expect(adjacentKanbanColumn(columns, 'todo', -1)).toBeNull();
    });

    test('reconciles line movement and leaves new cards visible', () => {
        const cards = [refs[0], { ...refs[1], line: 20 }, refs[2]];
        expect(applyKanbanCardOrder(cards, [refs[1], refs[0]]).map(card => card.text))
            .toEqual(['Second', 'First', 'Third']);
    });

    test('builds the same persistence reference from card data or a DOM dataset', () => {
        expect(kanbanCardOrderRef({ dataset: { file: 'tasks.md', line: '2', text: 'Second' } }))
            .toEqual(refs[1]);
    });
});
