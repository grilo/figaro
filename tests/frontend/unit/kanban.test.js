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
import { localISODate } from '../frontend/js/core/dueDateModel.js';

describe('live Kanban buffers and compact cards', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        setState('openTabs', []);
        setState('activeTabId', null);
        setState('kanbanDensity', 'comfortable');
        setState('kanbanLayout', 'side-by-side');
        document.getElementById('tab-panels').innerHTML = '<div id="kanban-board-main"></div>';
        window.go.desktop.App.GetKanbanColumns.mockResolvedValue({ columns: ['todo', 'wip', 'done'], colors: {} });
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({ todo: [], wip: [], done: [] });
        window.go.desktop.App.SetColumnColor = jest.fn().mockResolvedValue({ success: true, colors: {} });
        window.go.desktop.App.SetTaskDueDate.mockResolvedValue({ success: true });
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

    test('parses a semantic due link into card metadata without showing it as task text', () => {
        expect(kanbanCardsForBuffer('note.md', '- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)')).toEqual([
            {
                file: 'note.md', file_name: 'note.md', line: 1,
                text: 'Submit report', tag: 'todo', due_date: '2026-08-14',
            },
        ]);
    });

    test('typing a new hashtag refreshes a visible board from the dirty snapshot', async () => {
        setState('openTabs', [{
            id: 'note.md', type: 'file', path: 'note.md', dirty: true,
            _content: 'A newly typed item #urgent',
        }]);
        initKanban();
        await testUtils.waitFor(20);
        window.go.desktop.App.GetKanbanBoard.mockClear();
        window.go.desktop.App.GetKanbanColumns.mockClear();
        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: 'note.md', content: 'A newly typed item #urgent' },
        }));
        await testUtils.waitFor(40);

        const board = document.getElementById('kanban-board-main');
        expect(board.textContent).toContain('#urgent');
        expect(board.textContent).toContain('A newly typed item');
        expect(getState('kanbanColumns')).toContain('urgent');
        expect(getState('kanbanCompletionColumns')).not.toContain('urgent');
        expect(window.go.desktop.App.SaveFile).not.toHaveBeenCalled();
        expect(window.go.desktop.App.GetKanbanBoard).not.toHaveBeenCalled();
        expect(window.go.desktop.App.GetKanbanColumns).not.toHaveBeenCalled();
    });

    test('projects a Figaro-saved note into Kanban without refetching the complete board', async () => {
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: 'Old task', tag: 'todo' }],
            wip: [], done: [],
        });
        initKanban();
        await testUtils.waitFor(20);
        window.go.desktop.App.GetKanbanBoard.mockClear();
        window.go.desktop.App.GetKanbanColumns.mockClear();

        expect(applySavedKanbanSnapshot('note.md', '- [ ] Saved urgent task #urgent')).toBe(true);

        const board = document.getElementById('kanban-board-main');
        expect(board.textContent).toContain('#urgent');
        expect(board.textContent).toContain('Saved urgent task');
        expect(board.textContent).not.toContain('Old task');
        expect(getState('kanbanCompletionColumns')).toContain('urgent');
        expect(window.go.desktop.App.GetKanbanBoard).not.toHaveBeenCalled();
        expect(window.go.desktop.App.GetKanbanColumns).not.toHaveBeenCalled();
    });

    test('does not promote another dirty note hashtag into the saved completion vocabulary', async () => {
        setState('openTabs', [{
            id: 'draft.md', type: 'file', path: 'draft.md', dirty: true,
            _content: 'Still typing #ur',
        }]);
        initKanban();
        await testUtils.waitFor(20);

        expect(applySavedKanbanSnapshot('saved.md', '- [ ] Saved task #todo')).toBe(true);

        expect(getState('kanbanColumns')).toContain('ur');
        expect(getState('kanbanCompletionColumns')).not.toContain('ur');
    });

    test('renders the compact text while retaining the full card text in its title', async () => {
        const longText = 'x'.repeat(140);
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: longText, tag: 'todo' }],
            wip: [], done: [],
        });

        await renderKanbanBoard('kanban-board-main');
        const text = document.querySelector('.kanban-card-text');
        expect(Array.from(text.textContent)).toHaveLength(120);
        expect(text.textContent.endsWith('…')).toBe(true);
        expect(text.title).toBe(longText);
    });

    test('replaces the neutral color icon with the selected column-color indicator', async () => {
        await renderKanbanBoard('kanban-board-main');
        const initialControl = document.querySelector('.color-col[data-column="todo"]');
        expect(initialControl.dataset.selectedColor).toBe('');
        expect(initialControl.querySelector('svg')).not.toBeNull();
        expect(initialControl.querySelector('.kanban-column-color-indicator')).toBeNull();
        expect(initialControl.getAttribute('aria-label')).toContain('no color selected');

        window.go.desktop.App.SetColumnColor.mockResolvedValueOnce({
            success: true,
            colors: { todo: '#22c55e' },
        });
        window.go.desktop.App.GetKanbanColumns.mockResolvedValue({
            columns: ['todo', 'wip', 'done'],
            colors: { todo: '#22c55e' },
        });
        initialControl.click();
        const green = [...document.querySelectorAll('.kanban-color-swatch')]
            .find(swatch => swatch.dataset.color === '#22c55e');
        green.click();
        await testUtils.waitFor(20);

        const selectedControl = document.querySelector('.color-col[data-column="todo"]');
        const indicator = selectedControl.querySelector('.kanban-column-color-indicator');
        expect(window.go.desktop.App.SetColumnColor).toHaveBeenCalledWith('todo', '#22c55e');
        expect(selectedControl.dataset.selectedColor).toBe('#22c55e');
        expect(selectedControl.querySelector('svg')).toBeNull();
        expect(indicator.style.getPropertyValue('--kanban-column-color')).toBe('#22c55e');
        expect(selectedControl.getAttribute('aria-label')).toContain('selected color #22c55e');
    });

    test('renders due-state chips and makes the Kanban navigation urgent for tasks due today', async () => {
        const today = localISODate();
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: 'Due work', tag: 'todo', due_date: today }],
            wip: [], done: [],
        });

        await renderKanbanBoard('kanban-board-main');

        expect(document.querySelector('.kanban-card-due').textContent).toContain('Due today');
        expect(document.getElementById('sidebar-kanban').classList.contains('kanban-due-today')).toBe(true);
        expect(document.getElementById('sidebar-kanban').getAttribute('aria-label')).toContain('1 task due today');
        expect(document.querySelector('.kanban-due-badge').textContent).toBe('Due 1');
    });

    test('sets a due date from the card picker without opening the source note', async () => {
        const today = localISODate();
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 4, text: 'Schedule me', tag: 'todo' }],
            wip: [], done: [],
        });
        await renderKanbanBoard('kanban-board-main');

        document.querySelector('.kanban-card-due-action').click();
        document.querySelector(`[data-date-picker-value="${today}"]`).click();
        await testUtils.waitFor(0);

        expect(window.go.desktop.App.SetTaskDueDate).toHaveBeenCalledWith('note.md', 4, today);
        expect(window.go.desktop.App.GetCalendarMonthData).not.toHaveBeenCalled();
    });

    test('changes density and stacked flow from Settings while preserving board and column scroll', async () => {
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
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
