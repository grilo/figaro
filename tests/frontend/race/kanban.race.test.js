/** Board rendering must keep the newest backend snapshot. */

import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/app.js', () => ({
    openTab: jest.fn()
}));

import { renderKanbanBoard } from '../frontend/js/kanban.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('kanban async lifecycle', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        document.getElementById('tab-panels').innerHTML = '<div id="kanban-board-main"></div>';
        window.go.main.App.GetKanbanColumns.mockResolvedValue(['todo', 'wip', 'done']);
    });

    test('does not render an older board response over a newer one', async () => {
        const slow = deferred();
        const fast = deferred();
        window.go.main.App.GetKanbanBoard
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);

        const firstRender = renderKanbanBoard('kanban-board-main');
        const secondRender = renderKanbanBoard('kanban-board-main');

        fast.resolve({
            todo: [{ file: 'Current.md', file_name: 'Current.md', line: 1, text: 'Current task', tag: 'todo' }],
            wip: [],
            done: []
        });
        await secondRender;

        slow.resolve({
            todo: [{ file: 'Stale.md', file_name: 'Stale.md', line: 1, text: 'Stale task', tag: 'todo' }],
            wip: [],
            done: []
        });
        await firstRender;

        const board = document.getElementById('kanban-board-main');
        expect(board.textContent).toContain('Current task');
        expect(board.textContent).not.toContain('Stale task');
    });
});
