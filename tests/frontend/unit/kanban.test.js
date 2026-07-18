import { testUtils } from './test_setup.js';
import { getState, setState } from '../frontend/js/state.js';

jest.mock('../frontend/js/app.js', () => ({
    openTab: jest.fn(),
}));

import {
    KANBAN_CARD_TEXT_LIMIT,
    initKanban,
    applySavedKanbanSnapshot,
    kanbanCardsForBuffer,
    overlayDirtyKanbanBuffers,
    renderKanbanBoard,
    initKanbanPresentationSettings,
    truncateKanbanCardText,
} from '../frontend/js/kanban.js';

describe('live Kanban buffers and compact cards', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        setState('openTabs', []);
        setState('activeTabId', null);
        setState('kanbanDensity', 'comfortable');
        setState('kanbanLayout', 'side-by-side');
        document.getElementById('tab-panels').innerHTML = '<div id="kanban-board-main"></div>';
        window.go.main.App.GetKanbanColumns.mockResolvedValue({ columns: ['todo', 'wip', 'done'], colors: {} });
        window.go.main.App.GetKanbanBoard.mockResolvedValue({ todo: [], wip: [], done: [] });
    });

    test('caps visible card text at 120 characters including a Unicode ellipsis', () => {
        const original = '🙂' + 'a'.repeat(150);
        const compact = truncateKanbanCardText(original);

        expect(Array.from(compact)).toHaveLength(KANBAN_CARD_TEXT_LIMIT);
        expect(compact.endsWith('…')).toBe(true);
        expect(truncateKanbanCardText('short task')).toBe('short task');
    });

    test('dirty buffer hashtags replace stale saved cards without saving the note', () => {
        const saved = {
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: 'Old task', tag: 'todo' }],
            urgent: [],
        };
        const buffers = new Map([['note.md', '- [ ] Current urgent paragraph #urgent']]);

        expect(overlayDirtyKanbanBuffers(saved, buffers)).toEqual({
            todo: [],
            urgent: [{
                file: 'note.md',
                file_name: 'note.md',
                line: 1,
                text: 'Current urgent paragraph',
                tag: 'urgent',
            }],
        });
    });

    test('ignores anchors and color literals while indexing a dirty buffer', () => {
        expect(kanbanCardsForBuffer('note.md', '[Jump](#section) #fff\nReal #Urgent')).toEqual([
            expect.objectContaining({ line: 2, tag: 'urgent', text: 'Real' }),
        ]);
    });

    test('typing a new hashtag refreshes a visible board from the dirty snapshot', async () => {
        setState('openTabs', [{
            id: 'note.md', type: 'file', path: 'note.md', dirty: true,
            _content: 'A newly typed item #urgent',
        }]);
        initKanban();
        await testUtils.waitFor(20);
        window.go.main.App.GetKanbanBoard.mockClear();
        window.go.main.App.GetKanbanColumns.mockClear();
        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: 'note.md', content: 'A newly typed item #urgent' },
        }));
        await testUtils.waitFor(40);

        const board = document.getElementById('kanban-board-main');
        expect(board.textContent).toContain('#urgent');
        expect(board.textContent).toContain('A newly typed item');
        expect(window.go.main.App.SaveFile).not.toHaveBeenCalled();
        expect(window.go.main.App.GetKanbanBoard).not.toHaveBeenCalled();
        expect(window.go.main.App.GetKanbanColumns).not.toHaveBeenCalled();
    });

    test('projects a Figaro-saved note into Kanban without refetching the complete board', async () => {
        window.go.main.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: 'Old task', tag: 'todo' }],
            wip: [], done: [],
        });
        initKanban();
        await testUtils.waitFor(20);
        window.go.main.App.GetKanbanBoard.mockClear();
        window.go.main.App.GetKanbanColumns.mockClear();

        expect(applySavedKanbanSnapshot('note.md', '- [ ] Saved urgent task #urgent')).toBe(true);

        const board = document.getElementById('kanban-board-main');
        expect(board.textContent).toContain('#urgent');
        expect(board.textContent).toContain('Saved urgent task');
        expect(board.textContent).not.toContain('Old task');
        expect(window.go.main.App.GetKanbanBoard).not.toHaveBeenCalled();
        expect(window.go.main.App.GetKanbanColumns).not.toHaveBeenCalled();
    });

    test('renders the compact text while retaining the full card text in its title', async () => {
        const longText = 'x'.repeat(140);
        window.go.main.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: longText, tag: 'todo' }],
            wip: [], done: [],
        });

        await renderKanbanBoard('kanban-board-main');
        const text = document.querySelector('.kanban-card-text');
        expect(Array.from(text.textContent)).toHaveLength(120);
        expect(text.textContent.endsWith('…')).toBe(true);
        expect(text.title).toBe(longText);
    });

    test('changes density and stacked flow from Settings while preserving board and column scroll', async () => {
        window.go.main.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: 'Existing task', tag: 'todo' }],
            wip: [], done: [],
        });
        document.getElementById('tab-panels').innerHTML = `<div class="kanban-view-wrapper"><div id="kanban-board-main"></div></div>
            <section id="kanban-settings">
                <button data-kanban-density="comfortable"></button><button data-kanban-density="compact"></button>
                <button data-kanban-layout="side-by-side"></button><button data-kanban-layout="stacked"></button>
            </section>`;
        await renderKanbanBoard('kanban-board-main');
        const board = document.getElementById('kanban-board-main');
        const cards = board.querySelector('.kanban-column-cards[data-column="todo"]');
        board.scrollLeft = 73;
        board.scrollTop = 19;
        cards.scrollTop = 31;

        const settings = document.getElementById('kanban-settings');
        initKanbanPresentationSettings(settings);
        settings.querySelector('[data-kanban-density="compact"]').click();
        settings.querySelector('[data-kanban-layout="stacked"]').click();

        expect(getState('kanbanLayout')).toBe('stacked');
        expect(getState('kanbanDensity')).toBe('compact');
        expect(localStorage.getItem('kanbanDensity')).toBe('compact');
        expect(localStorage.getItem('kanbanLayout')).toBe('stacked');
        expect(document.querySelector('.kanban-view-wrapper').dataset.density).toBe('compact');
        expect(document.querySelector('.kanban-view-wrapper').dataset.layout).toBe('stacked');
        expect(settings.querySelector('[data-kanban-density="compact"]').getAttribute('aria-pressed')).toBe('true');
        expect(settings.querySelector('[data-kanban-layout="stacked"]').getAttribute('aria-pressed')).toBe('true');

        applySavedKanbanSnapshot('note.md', 'Updated task #todo');
        expect(board.scrollLeft).toBe(73);
        expect(board.scrollTop).toBe(19);
        expect(board.querySelector('.kanban-column-cards[data-column="todo"]').scrollTop).toBe(31);
    });
});
