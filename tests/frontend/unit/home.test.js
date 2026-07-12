/**
 * Home tab behaviour: it keeps Momentum on the left and recent notes on the right.
 */

import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/tabManager.js', () => ({
    openTab: jest.fn(),
    switchTab: jest.fn()
}));

import { openTab } from '../frontend/js/tabManager.js';
import { setState } from '../frontend/js/state.js';
import { renderHome } from '../frontend/js/home.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('Home tab', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();

        setState('recentFiles', [{ path: 'Projects/Plan.md', title: 'Project plan' }]);
        setState('pinnedTabs', ['reference.md']);
        setState('openTabs', [{ id: 'reference.md', type: 'file', title: 'Reference', path: 'Reference.md' }]);
        window.pywebview.api.get_kanban_board.mockResolvedValue({
            todo: [{ file: 'Projects/Plan.md', file_name: 'Plan.md', line: 12, text: 'Clarify the next milestone', tag: 'todo' }],
            done: [{ file: 'Done.md', file_name: 'Done.md', line: 1, text: 'Already finished', tag: 'done' }]
        });
    });

    test('shows Momentum before recent notes and omits the pinned workspace card', async () => {
        const panel = document.getElementById('tab-panels');
        renderHome(panel);
        await Promise.resolve();
        await Promise.resolve();

        const cards = panel.querySelectorAll('.home-card');
        expect(cards).toHaveLength(2);
        expect(cards[0].textContent).toContain('Momentum');
        expect(cards[0].textContent).toContain('Clarify the next milestone');
        expect(cards[1].textContent).toContain('Notes');
        expect(cards[1].textContent).toContain('Project plan');
        expect(panel.textContent).not.toContain('Pinned tabs');
        expect(panel.querySelector('[data-home-action="today"]')).toBeNull();
        expect(panel.textContent).not.toContain('Already finished');
    });

    test('opens a task at its source line', async () => {
        const panel = document.getElementById('tab-panels');
        renderHome(panel);
        await Promise.resolve();
        await Promise.resolve();

        panel.querySelector('.home-task-row').click();
        await testUtils.waitFor(0);

        expect(openTab).toHaveBeenCalledWith('Projects/Plan.md', 'Plan.md', 'file', {
            path: 'Projects/Plan.md',
            line: 12,
            mtime: undefined
        });
    });

    test('does not let an earlier task request overwrite a newer Home render', async () => {
        const slow = deferred();
        const fast = deferred();
        window.pywebview.api.get_kanban_board
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);
        const panel = document.getElementById('tab-panels');

        renderHome(panel);
        renderHome(panel);

        fast.resolve({
            todo: [{ file: 'Current.md', file_name: 'Current.md', line: 1, text: 'Current task', tag: 'todo' }]
        });
        await Promise.resolve();
        await Promise.resolve();

        slow.resolve({
            todo: [{ file: 'Stale.md', file_name: 'Stale.md', line: 1, text: 'Stale task', tag: 'todo' }]
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(panel.textContent).toContain('Current task');
        expect(panel.textContent).not.toContain('Stale task');
    });
});
