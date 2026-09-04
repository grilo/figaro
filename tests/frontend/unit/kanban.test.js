import { testUtils } from './test_setup.js';
import { getState, setState } from '../frontend/js/state.js';

jest.mock('../frontend/js/app.js', () => ({
    openTab: jest.fn(),
    handleFileOpen: jest.fn(),
}));

const mockKanbanErrorDialog = jest.fn().mockResolvedValue(undefined);
jest.mock('../frontend/js/dialogs.js', () => ({
    confirmDialog: jest.fn().mockResolvedValue(true),
    errorDialog: (...args) => mockKanbanErrorDialog(...args),
    promptDialog: jest.fn().mockResolvedValue(null),
}));

import {
    KANBAN_CARD_TEXT_LIMIT,
    configureKanbanWorkspace,
    initKanban,
    applySavedKanbanSnapshot,
    kanbanCardsForBuffer,
    overlayDirtyKanbanBuffers,
    renderKanbanBoard,
    initKanbanPresentationSettings,
    truncateKanbanCardText,
} from '../frontend/js/kanban.js';
import { localISODate } from '../frontend/js/core/dueDateModel.js';
import { handleFileOpen, openTab } from '../frontend/js/app.js';

describe('live Kanban buffers and compact cards', () => {
    beforeEach(() => {
        configureKanbanWorkspace({ openTab, openFile: handleFileOpen });
        testUtils.createMockDOM();
        jest.clearAllMocks();
        setState('openTabs', []);
        setState('activeTabId', null);
        setState('kanbanDensity', 'comfortable');
        setState('kanbanLayout', 'side-by-side');
        document.getElementById('tab-panels').innerHTML = '<div id="kanban-board-main"></div>';
        window.go.desktop.App.GetKanbanColumns.mockResolvedValue({ columns: ['todo', 'wip', 'done'], colors: {} });
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({ todo: [], wip: [], done: [] });
        window.go.desktop.App.GetTaskSchedules.mockResolvedValue([]);
        window.go.desktop.App.SetColumnColor = jest.fn().mockResolvedValue({ success: true, colors: {} });
        window.go.desktop.App.SetTaskSchedule.mockResolvedValue(null);
        window.go.desktop.App.SetTaskDueDate.mockResolvedValue({ success: true });
        window.go.desktop.App.SetKanbanCardOrder.mockResolvedValue({ success: true });
        window.go.desktop.App.UpdateTaskTag.mockResolvedValue({ success: true });
        window.go.desktop.App.RemoveTagFromTask.mockResolvedValue({ success: true });
    });

    test('caps visible card text at 120 characters including a Unicode ellipsis', () => {
        const original = '🙂' + 'a'.repeat(150);
        const compact = truncateKanbanCardText(original);

        expect(Array.from(compact)).toHaveLength(KANBAN_CARD_TEXT_LIMIT);
        expect(compact.endsWith('…')).toBe(true);
        expect(truncateKanbanCardText('short task')).toBe('short task');
    });

    test('shows the shared three-column skeleton before a slow board request resolves', async () => {
        let resolveColumns;
        let resolveBoard;
        window.go.desktop.App.GetKanbanColumns.mockImplementationOnce(() => (
            new Promise(resolve => { resolveColumns = resolve; })
        ));
        window.go.desktop.App.GetKanbanBoard.mockImplementationOnce(() => (
            new Promise(resolve => { resolveBoard = resolve; })
        ));

        const rendering = renderKanbanBoard('kanban-board-main');
        const loading = document.querySelector('.kanban-loading');

        expect(loading).not.toBeNull();
        expect(loading.getAttribute('role')).toBe('status');
        expect(loading.getAttribute('aria-label')).toBe('Loading Kanban board');
        expect(loading.querySelectorAll('.kanban-skeleton-column')).toHaveLength(3);
        expect(loading.querySelectorAll('.ui-skeleton')).toHaveLength(11);
        expect([...loading.querySelectorAll('.kanban-skeleton-column')]
            .every(column => column.getAttribute('aria-hidden') === 'true')).toBe(true);

        resolveColumns({ columns: ['todo', 'wip', 'done'], colors: {} });
        resolveBoard({ todo: [], wip: [], done: [] });
        await rendering;

        expect(document.querySelector('.kanban-loading')).toBeNull();
        expect(document.querySelectorAll('.kanban-column')).toHaveLength(3);
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
                source: '- [ ] Current urgent paragraph #urgent',
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

    test('treats old due-looking links as ordinary Markdown, not metadata', () => {
        expect(kanbanCardsForBuffer('note.md', '- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)')).toEqual([
            {
                file: 'note.md', file_name: 'note.md', line: 1,
                text: 'Submit report [due 2026-08-14](2026-08-14.md)', tag: 'todo',
                source: '- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)',
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

    test('tabs directly through cards across column boundaries', async () => {
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [
                { file: 'tab-a.md', file_name: 'tab-a.md', line: 1, text: 'First card', tag: 'todo' },
                { file: 'tab-b.md', file_name: 'tab-b.md', line: 1, text: 'Last todo card', tag: 'todo' },
            ],
            wip: [{ file: 'tab-c.md', file_name: 'tab-c.md', line: 1, text: 'First wip card', tag: 'wip' }],
            done: [],
        });
        await renderKanbanBoard('kanban-board-main');

        const todoCards = document.querySelectorAll('.kanban-column[data-column="todo"] .kanban-card');
        const wipCard = document.querySelector('.kanban-column[data-column="wip"] .kanban-card');
        todoCards[1].focus();
        todoCards[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

        expect(document.activeElement).toBe(wipCard);
        expect([...document.querySelectorAll('.kanban-card-menu-trigger')]
            .every(button => button.tabIndex === -1)).toBe(true);
    });

    test('keeps a large logical column keyboard-operable outside its mounted window', async () => {
        const tasks = Array.from({ length: 300 }, (_, index) => ({
            file: `task-${index}.md`,
            file_name: `task-${index}.md`,
            line: index + 1,
            text: `Task ${index}`,
            tag: 'todo',
        }));
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({ todo: tasks, wip: [], done: [] });
        await renderKanbanBoard('kanban-board-main');

        expect(document.querySelectorAll('.kanban-card')).toHaveLength(96);
        document.querySelector('.kanban-card').focus();
        for (let index = 0; index < 150; index += 1) {
            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Tab', bubbles: true, cancelable: true,
            }));
        }

        expect(document.activeElement.dataset.cardIndex).toBe('150');
        expect(document.activeElement.dataset.file).toBe('task-150.md');
        expect(document.activeElement.getAttribute('aria-posinset')).toBe('151');
        expect(document.activeElement.getAttribute('aria-setsize')).toBe('300');
        expect(document.querySelectorAll('.kanban-card')).toHaveLength(96);

        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowDown', bubbles: true, cancelable: true,
        }));
        await testUtils.waitFor(0);
        const persistedRefs = window.go.desktop.App.SetKanbanCardOrder.mock.calls.at(-1)[1];
        expect(persistedRefs).toHaveLength(300);
        expect(persistedRefs[151].file).toBe('task-150.md');
        expect(document.activeElement.dataset.file).toBe('task-150.md');
    });

    test('preserves overlapping card nodes when scrolling advances the virtual window', async () => {
        const tasks = Array.from({ length: 300 }, (_, index) => ({
            file: `stable-${index}.md`,
            file_name: `stable-${index}.md`,
            line: index + 1,
            text: `Stable task ${index}`,
            tag: 'todo',
        }));
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({ todo: tasks, wip: [], done: [] });
        await renderKanbanBoard('kanban-board-main');

        const cards = document.querySelector('.kanban-column-cards[data-column="todo"]');
        const overlappingCard = cards.querySelector('[data-card-index="60"]');
        cards.scrollTop = 70 * 91;
        cards.dispatchEvent(new Event('scroll'));
        await testUtils.waitFor(30);

        expect(cards.querySelector('[data-card-index="60"]')).toBe(overlappingCard);
        expect(cards.querySelector('.kanban-card').dataset.cardIndex).toBe('22');
        expect(cards.querySelectorAll('.kanban-card')).toHaveLength(96);
    });

    test('persists ArrowUp reordering and restores focus to the moved card', async () => {
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [
                { file: 'order-a.md', file_name: 'order-a.md', line: 1, text: 'First ordered card', tag: 'todo' },
                { file: 'order-b.md', file_name: 'order-b.md', line: 2, text: 'Second ordered card', tag: 'todo' },
            ],
            wip: [], done: [],
        });
        await renderKanbanBoard('kanban-board-main');

        const second = document.querySelectorAll('.kanban-card')[1];
        second.focus();
        second.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
        await testUtils.waitFor(0);

        expect(window.go.desktop.App.SetKanbanCardOrder).toHaveBeenCalledWith('todo', [
            { file: 'order-b.md', line: 2, text: 'Second ordered card' },
            { file: 'order-a.md', line: 1, text: 'First ordered card' },
        ]);
        const reordered = [...document.querySelectorAll('.kanban-column[data-column="todo"] .kanban-card')];
        expect(reordered.map(card => card.dataset.text)).toEqual(['Second ordered card', 'First ordered card']);
        expect(document.activeElement.dataset.text).toBe('Second ordered card');
    });

    test('leaves card order unchanged when keyboard persistence fails', async () => {
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [
                { file: 'safe-a.md', file_name: 'safe-a.md', line: 1, text: 'Keep first', tag: 'todo' },
                { file: 'safe-b.md', file_name: 'safe-b.md', line: 2, text: 'Keep second', tag: 'todo' },
            ],
            wip: [], done: [],
        });
        window.go.desktop.App.SetKanbanCardOrder.mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
        await renderKanbanBoard('kanban-board-main');

        const first = document.querySelector('.kanban-card');
        first.focus();
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        await testUtils.waitFor(0);

        expect([...document.querySelectorAll('.kanban-column[data-column="todo"] .kanban-card')]
            .map(card => card.dataset.text)).toEqual(['Keep first', 'Keep second']);
        expect(mockKanbanErrorDialog).toHaveBeenCalledWith(
            'Couldn’t reorder task',
            'disk unavailable',
            'The task order was not changed.',
        );
    });

    test('uses ArrowRight to move a focused card to the adjacent column', async () => {
        window.go.desktop.App.GetKanbanBoard
            .mockResolvedValueOnce({
                todo: [{ file: 'move.md', file_name: 'move.md', line: 3, text: 'Move sideways', tag: 'todo' }],
                wip: [], done: [],
            })
            .mockResolvedValue({
                todo: [],
                wip: [{ file: 'move.md', file_name: 'move.md', line: 3, text: 'Move sideways', tag: 'wip' }],
                done: [],
            });
        await renderKanbanBoard('kanban-board-main');
        const card = document.querySelector('.kanban-card');
        card.focus();
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        await testUtils.waitFor(10);

        expect(window.go.desktop.App.UpdateTaskTag).toHaveBeenCalledWith('move.md', 3, 'todo', 'wip');
        expect(document.activeElement.dataset.tag).toBe('wip');
        expect(document.activeElement.dataset.text).toBe('Move sideways');
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

    test('lays out task actions above two clickable schedule pills without showing the filename', async () => {
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'Roadmap.md', file_name: 'Roadmap.md', line: 4, text: 'Schedule me', tag: 'todo', source: 'Schedule me #todo' }],
            wip: [], done: [],
        });
        await renderKanbanBoard('kanban-board-main');

        const card = document.querySelector('.kanban-card');
        const header = card.querySelector('.kanban-card-header');
        const dates = card.querySelector('.kanban-card-dates');
        expect([...header.children].map(element => element.className)).toEqual([
            'kanban-card-text',
            'ui-icon-button ui-icon-button--small kanban-card-menu-trigger',
        ]);
        expect([...dates.querySelectorAll('.kanban-card-date')].map(button => button.dataset.dateField))
            .toEqual(['start', 'end']);
        expect(dates.querySelector('[data-date-field="start"]').textContent).toContain('Not started');
        expect(dates.querySelector('[data-date-field="end"]').textContent).toContain('No due date');
        expect(card.textContent).not.toContain('Roadmap.md');
        expect(card.querySelector('.kanban-card-source')).toBeNull();
        expect(dates.querySelector('[data-date-field="start"]').getAttribute('aria-label'))
            .toContain('Set task start date');
        expect(dates.querySelector('[data-date-field="end"]').getAttribute('aria-label'))
            .toContain('Set task due date');
    });

    test('sets each date from its pill while preserving the other schedule date', async () => {
        const today = localISODate();
        const task = { file: 'note.md', file_name: 'note.md', line: 4, text: 'Schedule me', tag: 'todo', source: 'Schedule me #todo' };
        let schedule = { id: 'schedule-one', task, start: '', end: '2026-10-01' };
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [task],
            wip: [], done: [],
        });
        window.go.desktop.App.GetTaskSchedules.mockImplementation(async () => [schedule]);
        window.go.desktop.App.SetTaskSchedule.mockImplementation(async (identity, start, end, id) => {
            schedule = { id: id || 'schedule-one', task: { ...task, ...identity }, start, end };
        });
        await renderKanbanBoard('kanban-board-main');

        document.querySelector('[data-date-field="start"]').click();
        expect(document.querySelector('.ui-date-picker').getAttribute('aria-label')).toBe('Choose start date');
        document.querySelector(`[data-date-picker-value="${today}"]`).click();
        await testUtils.waitFor(10);

        expect(window.go.desktop.App.SetTaskSchedule).toHaveBeenLastCalledWith(
            { file: 'note.md', line: 4, source: 'Schedule me #todo' },
            today,
            '2026-10-01',
            'schedule-one',
        );
        expect(document.querySelector('.kanban-card-start').textContent).toContain('Start');

        document.querySelector('[data-date-field="end"]').click();
        expect(document.querySelector('.ui-date-picker').getAttribute('aria-label')).toBe('Choose due date');
        document.querySelector(`[data-date-picker-value="${today}"]`).click();
        await testUtils.waitFor(10);

        expect(window.go.desktop.App.SetTaskSchedule).toHaveBeenLastCalledWith(
            { file: 'note.md', line: 4, source: 'Schedule me #todo' },
            today,
            today,
            'schedule-one',
        );
        expect(window.go.desktop.App.GetCalendarMonthData).not.toHaveBeenCalled();
        expect(openTab).not.toHaveBeenCalled();
    });

    test('puts clear-schedule and removal commands in the top task menu', async () => {
        const task = { file: 'note.md', file_name: 'note.md', line: 2, text: 'Review menu', source: 'Review menu #todo', tag: 'todo' };
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [task],
        });
        let schedules = [{ id: 'schedule-two', task, start: '2026-09-01', end: '2026-09-03' }];
        window.go.desktop.App.GetTaskSchedules.mockImplementation(async () => schedules);
        window.go.desktop.App.SetTaskSchedule.mockImplementation(async () => { schedules = []; });
        await renderKanbanBoard('kanban-board-main');
        const card = document.querySelector('.kanban-card');
        const trigger = card.querySelector('.kanban-card-menu-trigger');

        trigger.click();
        const menu = document.querySelector('.kanban-card-menu');
        expect(menu.parentElement).toBe(document.body);
        expect(menu.getAttribute('aria-label')).toContain('Review menu');
        expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent.trim()))
            .toEqual(['Clear start and due dates', 'Remove from board']);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(document.querySelector('.kanban-card-menu')).toBeNull();
        expect(document.activeElement).toBe(card);

        card.querySelector('.kanban-card-menu-trigger').click();
        document.querySelector('[data-card-action="clear-dates"]').click();
        await testUtils.waitFor(10);
        expect(window.go.desktop.App.SetTaskSchedule).toHaveBeenCalledWith(
            { file: 'note.md', line: 2, source: 'Review menu #todo' }, '', '', 'schedule-two',
        );
        expect(document.querySelector('.kanban-card-start').textContent).toContain('Not started');
        expect(document.querySelector('.kanban-card-due').textContent).toContain('No due date');

        const refreshedCard = document.querySelector('.kanban-card');
        refreshedCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        document.querySelector('[data-card-action="remove"]').click();
        await testUtils.waitFor(0);
        expect(window.go.desktop.App.RemoveTagFromTask).toHaveBeenCalledWith('note.md', 2, 'todo');
    });

    test('S/D and Escape preserve the focused card; only Delete removes its tag', async () => {
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: 'Keep me', source: 'Keep me #todo', tag: 'todo' }],
        });
        await renderKanbanBoard('kanban-board-main');
        const card = document.querySelector('.kanban-card');
        card.focus();
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
        expect(document.querySelector('.ui-date-picker').getAttribute('aria-label')).toBe('Choose start date');
        document.querySelector('.ui-date-picker').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.activeElement).toBe(card);
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }));
        const picker = document.querySelector('.ui-date-picker');
        expect(picker).not.toBeNull();
        expect(window.go.desktop.App.RemoveTagFromTask).not.toHaveBeenCalled();
        expect(window.go.desktop.App.SetTaskSchedule).not.toHaveBeenCalled();
        picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.activeElement).toBe(card);
        expect(card.isConnected).toBe(true);
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', bubbles: true, cancelable: true, repeat: true }));
        expect(document.querySelector('.ui-date-picker')).toBeNull();
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, ctrlKey: true }));
        expect(document.querySelector('.ui-date-picker')).toBeNull();
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
        await testUtils.waitFor(0);
        expect(window.go.desktop.App.RemoveTagFromTask).toHaveBeenCalledWith('note.md', 1, 'todo');
    });

    test('due-date write failures and dirty notes leave cards and Markdown alone', async () => {
        const source = 'Keep me #todo';
        window.go.desktop.App.GetKanbanBoard.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: 'Keep me', source, tag: 'todo' }],
        });
        await renderKanbanBoard('kanban-board-main');
        window.go.desktop.App.SetTaskSchedule.mockRejectedValueOnce(new Error('Read only'));
        document.querySelector('[data-date-field="end"]').click();
        document.querySelector('[data-date-picker-value]').click();
        await testUtils.waitFor(0);
        expect(mockKanbanErrorDialog).toHaveBeenCalled();
        expect(document.querySelector('.kanban-card').textContent).toContain('Keep me');
        expect(window.go.desktop.App.SaveFile).not.toHaveBeenCalled();
        expect(window.go.desktop.App.RemoveTagFromTask).not.toHaveBeenCalled();
        window.go.desktop.App.SetTaskSchedule.mockClear();
        setState('openTabs', [{ type: 'file', path: 'note.md', dirty: true, _content: source }]);
        document.querySelector('[data-date-field="end"]').click();
        document.querySelector('[data-date-picker-value]').click();
        await testUtils.waitFor(0);
        expect(window.go.desktop.App.SetTaskSchedule).not.toHaveBeenCalled();
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
