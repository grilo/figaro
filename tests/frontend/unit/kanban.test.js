import { testUtils } from './test_setup.js';
import { setState } from '../frontend/js/state.js';

jest.mock('../frontend/js/app.js', () => ({
    openTab: jest.fn(),
}));

import {
    KANBAN_CARD_TEXT_LIMIT,
    initKanban,
    kanbanCardsForBuffer,
    overlayDirtyKanbanBuffers,
    renderKanbanBoard,
    truncateKanbanCardText,
} from '../frontend/js/kanban.js';

describe('live Kanban buffers and compact cards', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        setState('openTabs', []);
        setState('activeTabId', null);
        document.getElementById('tab-panels').innerHTML = '<div id="kanban-board-main"></div>';
        window.pywebview.api.get_kanban_columns.mockResolvedValue({ columns: ['todo', 'wip', 'done'], colors: {} });
        window.pywebview.api.get_kanban_board.mockResolvedValue({ todo: [], wip: [], done: [] });
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
        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: 'note.md', content: 'A newly typed item #urgent' },
        }));
        await testUtils.waitFor(120);

        const board = document.getElementById('kanban-board-main');
        expect(board.textContent).toContain('#urgent');
        expect(board.textContent).toContain('A newly typed item');
        expect(window.pywebview.api.save_file).not.toHaveBeenCalled();
    });

    test('renders the compact text while retaining the full card text in its title', async () => {
        const longText = 'x'.repeat(140);
        window.pywebview.api.get_kanban_board.mockResolvedValue({
            todo: [{ file: 'note.md', file_name: 'note.md', line: 1, text: longText, tag: 'todo' }],
            wip: [], done: [],
        });

        await renderKanbanBoard('kanban-board-main');
        const text = document.querySelector('.kanban-card-text');
        expect(Array.from(text.textContent)).toHaveLength(120);
        expect(text.textContent.endsWith('…')).toBe(true);
        expect(text.title).toBe(longText);
    });
});
