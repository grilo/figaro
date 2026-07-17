/**
 * Unit tests for tabManager.js
 * Run with: npx jest js/tabManager.test.js
 */

import { testUtils } from './test_setup.js';

// Mock state (using jest.fn for proper hoisting)
const mockState = {
    openTabs: [],
    activeTabId: null,
    pinnedTabs: [],
    recentFiles: [],
    _restoredTabs: null,
    _restoredActiveTabId: null
};

jest.mock('../frontend/js/state.js', () => ({
    get state() { return mockState; },
    setState: jest.fn((key, value) => { mockState[key] = value; }),
    getState: jest.fn((key) => mockState[key]),
    subscribe: jest.fn(),
    recordRecentFile: jest.fn((path, title) => {
        mockState.recentFiles = [{ path, title }, ...mockState.recentFiles.filter(file => file.path !== path)].slice(0, 8);
    }),
    initState: jest.fn(),
    persistState: jest.fn()
}));

jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn().mockReturnValue({ isDestroyed: false }),
    getEditorContent: jest.fn().mockReturnValue(''),
    getEditorDocumentTabId: jest.fn().mockReturnValue(null),
    setEditorContent: jest.fn(),
    focusEditor: jest.fn(),
    saveCursorState: jest.fn().mockReturnValue({ anchor: 0, head: 0 }),
    restoreCursorState: jest.fn(),
    createEditorView: jest.fn(),
    configureEditorForFile: jest.fn().mockResolvedValue(true),
    setImageBasePath: jest.fn(),
}));

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() }
}));

jest.mock('../frontend/js/dialogs.js', () => ({
    confirmDialog: jest.fn().mockResolvedValue(true)
}));

jest.mock('../frontend/js/calendar.js', () => ({
    renderCalendar: jest.fn(),
    loadCalendarResults: jest.fn()
}));
jest.mock('../frontend/js/backlinks.js', () => ({
    loadBacklinksResults: jest.fn()
}));
jest.mock('../frontend/js/kanban.js', () => ({
    renderKanbanBoard: jest.fn()
}));
jest.mock('../frontend/js/theme.js', () => ({
    initSettingsPanel: jest.fn().mockResolvedValue()
}));

import { state, setState, getState } from '../frontend/js/state.js';
import { getEditorView, getEditorContent, getEditorDocumentTabId, setEditorContent, focusEditor, saveCursorState, restoreCursorState } from '../frontend/js/editor.js';
import { initSettingsPanel } from '../frontend/js/theme.js';
import { setAutoCommitMode } from '../frontend/js/automation.js';
import { statusBar } from '../frontend/js/statusBar.js';
// confirmDialog accessed via window.confirmDialog

import { 
    initTabManager, 
    openTab, 
    closeTab, 
    switchTab, 
    getActiveTab, 
    markTabDirty, 
    updateTabTitle,
    reorderTab,
    movedTabPath,
    replaceActiveFileTab,
    updateTabsForMovedPath,
    prepareTabsForPathCopy,
    prepareTabsForPathMove,
	prepareTabsForVaultLinkRewrite,
    refreshTabsForUpdatedLinks,
    closeTabsForDeletedPath,
    saveFileSnapshot,
    renderTabBar 
} from '../frontend/js/tabManager.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

// Mock window.pywebview API
window.pywebview = { api: {
    save_file: jest.fn().mockResolvedValue({ success: true, mtime: Date.now() }),
    save_session: jest.fn().mockResolvedValue({ success: true }),
    read_file: jest.fn().mockResolvedValue({ content: '', mtime: Date.now(), path: '' }),
    commit_current_file: jest.fn().mockResolvedValue(null),
} };

describe('Tab Manager', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        
        // Reset state
        mockState.openTabs = [];
        mockState.activeTabId = null;
        mockState.pinnedTabs = [];
        mockState.recentFiles = [];
        getEditorDocumentTabId.mockReturnValue(null);
        getEditorContent.mockReturnValue('');
        setAutoCommitMode(3600);
    });

    describe('openTab', () => {
        test('should create new file tab', () => {
            const tab = openTab('test.md', 'Test', 'file', { path: 'test.md', mtime: 1000 });
            
            expect(tab.id).toBe('test.md');
            expect(tab.title).toBe('Test');
            expect(tab.type).toBe('file');
            expect(tab.path).toBe('test.md');
            expect(tab.mtime).toBe(1000);
            expect(tab.dirty).toBe(false);
            expect(getState('activeTabId')).toBe('test.md');
        });

        test('mounts a newly created path as an empty document owned by its tab', async () => {
            openTab('fresh.md', 'Fresh', 'file', { path: 'fresh.md', isNew: true });
            await testUtils.waitFor(0);

            expect(setEditorContent).toHaveBeenCalledWith('', 'fresh.md');
            expect(window.pywebview.api.read_file).not.toHaveBeenCalled();
        });

        test('should create new calendar tab', () => {
            const tab = openTab('calendar-2024-01-15', 'Date', 'calendar', { dateStr: '2024-01-15' });
            
            expect(tab.type).toBe('calendar');
            expect(tab.dateStr).toBe('2024-01-15');
        });

        test('should create new backlinks tab', () => {
            const tab = openTab('backlinks-test.md', 'Backlinks', 'backlinks', { targetPath: 'test.md' });
            
            expect(tab.type).toBe('backlinks');
            expect(tab.targetPath).toBe('test.md');
        });

        test('should create new kanban tab', () => {
            const tab = openTab('kanban-board', 'Kanban', 'kanban', { focusCol: 'todo' });
            
            expect(tab.type).toBe('kanban');
            expect(tab.focusCol).toBe('todo');
        });

        test('animates the requested panel types when they open', () => {
            for (const [id, title, type, data] of [
                ['kanban-board', 'Kanban', 'kanban', {}],
                ['settings', 'Settings', 'settings', {}],
                ['calendar-2024-01-15', 'Date', 'calendar', { dateStr: '2024-01-15' }],
            ]) {
                openTab(id, title, type, data);
                expect(document.querySelector(`.tab-panel[data-tab-id="${id}"]`))
                    .not.toBeNull();
                expect(document.querySelector(`.tab-panel[data-tab-id="${id}"]`).classList.contains('figaro-panel-enter'))
                    .toBe(true);
            }
        });

        test('should switch to existing tab instead of creating duplicate', () => {
            openTab('test.md', 'Test', 'file', { path: 'test.md' });
            const tab2 = openTab('test.md', 'Test 2', 'file', { path: 'test.md' });
            
            expect(tab2.id).toBe('test.md');
            expect(getState('openTabs').length).toBe(1);
        });

        test('should force new tab when forceNew is true', () => {
            openTab('test.md', 'Test', 'file', { path: 'test.md' });
            const tab2 = openTab('test.md', 'Test 2', 'file', { path: 'test.md' }, true);
            
            expect(getState('openTabs').length).toBe(2);
        });

        test('should generate unique ID for new-file tabs', () => {
            const tab1 = openTab('', 'Untitled', 'file', { isNew: true });
            const tab2 = openTab('', 'Untitled', 'file', { isNew: true });
            
            expect(tab1.id).not.toBe(tab2.id);
            expect(tab1.id).toMatch(/^tab-\d+$/);
        });

        test('reinitializes settings when the settings tab is reopened', async () => {
            openTab('note.md', 'Note', 'file', { path: 'note.md' });
            openTab('settings', 'Settings', 'settings');
            await Promise.resolve();
            await Promise.resolve();

            const firstPanel = document.querySelector('.tab-panel[data-tab-id="settings"]');
            expect(initSettingsPanel).toHaveBeenCalledTimes(1);
            expect(initSettingsPanel).toHaveBeenLastCalledWith(firstPanel);

            closeTab('settings');
            openTab('settings', 'Settings', 'settings');
            await Promise.resolve();
            await Promise.resolve();

            const secondPanel = document.querySelector('.tab-panel[data-tab-id="settings"]');
            expect(secondPanel).not.toBe(firstPanel);
            expect(initSettingsPanel).toHaveBeenCalledTimes(2);
            expect(initSettingsPanel).toHaveBeenLastCalledWith(secondPanel);
        });

        test('renders a browser executable fallback in Settings', () => {
            openTab('settings', 'Settings', 'settings');
            const panel = document.querySelector('.tab-panel[data-tab-id="settings"]');

            expect(panel.querySelector('#pdf-browser-status')).not.toBeNull();
            expect(panel.querySelector('#pdf-browser-choose').textContent).toContain('Choose');
            expect(panel.querySelector('#pdf-browser-clear').textContent).toContain('automatic');
        });

        test('renders Links style as a themed accessible combobox instead of a native select', () => {
            openTab('settings', 'Settings', 'settings');
            const panel = document.querySelector('.tab-panel[data-tab-id="settings"]');
            const trigger = panel.querySelector('#link-style-select');
            const menu = panel.querySelector('#link-style-menu');

            expect(trigger.tagName).toBe('BUTTON');
            expect(trigger.classList.contains('settings-picker-btn')).toBe(true);
            expect(trigger.getAttribute('role')).toBe('combobox');
            expect(trigger.getAttribute('aria-controls')).toBe('link-style-menu');
            expect(menu.getAttribute('role')).toBe('listbox');
            expect(menu.querySelectorAll('[role="option"]')).toHaveLength(2);
            expect(panel.querySelector('#line-numbers-toggle')).not.toBeNull();
            expect(panel.querySelector('#auto-commit-interval option[value="-1"]').textContent).toBe('On Save');
            expect(panel.querySelector('#auto-commit-interval').value).toBe('3600');
        });

        test('does not let an older read overwrite a newer load of the same tab', async () => {
            const firstA = deferred();
            const latestA = deferred();
            window.pywebview.api.read_file
                .mockImplementationOnce(() => firstA.promise)
                .mockResolvedValueOnce({ content: 'B content', mtime: 2, path: 'b.md' })
                .mockImplementationOnce(() => latestA.promise);

            openTab('a', 'A', 'file', { path: 'a.md', mtime: 1 });
            openTab('b', 'B', 'file', { path: 'b.md', mtime: 2 });
            openTab('a', 'A', 'file', { path: 'a.md', mtime: 1 });

            latestA.resolve({ content: 'Latest A content', mtime: 3, path: 'a.md' });
            await testUtils.waitFor(0);

            firstA.resolve({ content: 'Stale A content', mtime: 1, path: 'a.md' });
            await testUtils.waitFor(0);

            expect(setEditorContent).toHaveBeenLastCalledWith('Latest A content', 'a');
        });
    });

    describe('switchTab', () => {
        test('should switch to existing tab', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            
            switchTab('tab1');
            
            expect(getState('activeTabId')).toBe('tab1');
        });

        test('should save cursor state when switching file tabs', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            
            switchTab('tab1');
            
            expect(saveCursorState).toHaveBeenCalled();
        });

        test('should auto-save dirty file tab when switching away', async () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            // tab2 is currently active, mark it dirty, then switch to tab1
            const tab2 = getState('openTabs').find(t => t.id === 'tab2');
            tab2.dirty = true;
            
            await switchTab('tab1');
            
            expect(getEditorContent).toHaveBeenCalled();
        });

        test('rapid switching saves each dirty tab from its owned buffer instead of the stale visible document', async () => {
            const saveB = deferred();
            window.pywebview.api.save_file.mockImplementationOnce(() => saveB.promise);
            mockState.openTabs = [
                { id: 'a', title: 'A', type: 'file', path: 'a.md', dirty: true, _content: 'A draft', _editGeneration: 1 },
                { id: 'b', title: 'B', type: 'file', path: 'b.md', dirty: true, _content: 'B draft', _editGeneration: 1 },
            ];
            mockState.activeTabId = 'b';
            getEditorDocumentTabId.mockReturnValue('a');
            getEditorContent.mockReturnValue('A still visible');

            switchTab('a');
            await testUtils.waitFor(0);

            expect(window.pywebview.api.save_file).toHaveBeenCalledWith('b.md', 'B draft', 0);
            expect(mockState.openTabs[1]._content).toBe('B draft');
            saveB.resolve({ success: true, mtime: 3 });
            await testUtils.waitFor(0);
        });
    });

    describe('closeTab', () => {
        test('should close tab and remove from state', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            
            closeTab('tab1');
            
            expect(getState('openTabs').length).toBe(1);
            expect(getState('openTabs')[0].id).toBe('tab2');
        });

        test('should switch to another tab when closing active tab', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            
            closeTab('tab1');
            
            expect(getState('activeTabId')).toBe('tab2');
        });

        test('should prefer file tab when switching after close', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('cal', 'Calendar', 'calendar', { dateStr: '2024-01-15' });
            
            closeTab('tab1');
            
            expect(getState('activeTabId')).toBe('cal');
        });

        test('should not close dirty tab without confirmation', async () => {
            window.confirmDialog = jest.fn().mockResolvedValue(false);
            
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            const tab1 = getState('openTabs').find(t => t.id === 'tab1');
            tab1.dirty = true;
            
            await closeTab('tab1');
            
            expect(getState('openTabs').length).toBe(2);
            expect(window.confirmDialog).toHaveBeenCalledWith(
                'Discard unsaved changes?',
                '“Tab 1” has changes that have not been saved. Closing it will discard them.',
                true,
                false,
                {
                    confirmLabel: 'Discard and close',
                    cancelLabel: 'Keep editing',
                    icon: 'warning',
                }
            );
        });

        test('should unpin tab when closing', () => {
            mockState.pinnedTabs = ['tab1', 'tab2'];
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            
            closeTab('tab1');

            expect(getState('pinnedTabs')).not.toContain('tab1');
        });

        test('opens the Welcome tab after closing the last tab', async () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });

            await closeTab('tab1');

            expect(getState('openTabs')).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: 'home', title: 'Welcome', type: 'home' })
            ]));
            expect(getState('openTabs')).toHaveLength(1);
            expect(getState('activeTabId')).toBe('home');
        });

        test('keeps the only Welcome tab open and disables its close control', async () => {
            openTab('home', 'Welcome', 'home');
            renderTabBar();

            const closeButton = document.querySelector('[data-tab-id="home"] .tab-close');
            expect(closeButton.disabled).toBe(true);
            expect(closeButton.getAttribute('aria-disabled')).toBe('true');
            await expect(closeTab('home')).resolves.toBe(false);
            expect(getState('openTabs')).toEqual([
                expect.objectContaining({ id: 'home', type: 'home' }),
            ]);
        });

        test('enables the Welcome close control when another tab is open', () => {
            openTab('home', 'Welcome', 'home');
            openTab('note.md', 'Note', 'file', { path: 'note.md' });
            renderTabBar();

            const closeButton = document.querySelector('[data-tab-id="home"] .tab-close');
            expect(closeButton.disabled).toBe(false);
            expect(closeButton.getAttribute('aria-disabled')).toBeNull();
        });
    });

    describe('safe link replacement', () => {
        test('saves a dirty source tab before reusing it for a link destination', async () => {
            openTab('source.md', 'Source', 'file', { path: 'source.md', mtime: 1 });
            markTabDirty('source.md');
            window.pywebview.api.save_file.mockResolvedValueOnce({ success: true, mtime: 2 });

            await replaceActiveFileTab('target.md', 'Target', 'file', { path: 'target.md', mtime: 3 });

            expect(window.pywebview.api.save_file).toHaveBeenCalledWith('source.md', '', 1);
            expect(getState('openTabs')).toEqual([
                expect.objectContaining({ id: 'target.md', path: 'target.md', type: 'file' }),
            ]);
            expect(getState('activeTabId')).toBe('target.md');
        });

        test('preserves a dirty source tab when saving before navigation fails', async () => {
            openTab('source.md', 'Source', 'file', { path: 'source.md', mtime: 1 });
            markTabDirty('source.md');
            window.pywebview.api.save_file.mockRejectedValueOnce(new Error('disk full'));

            await replaceActiveFileTab('target.md', 'Target', 'file', { path: 'target.md', mtime: 3 });

            expect(getState('openTabs')).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: 'source.md', path: 'source.md', dirty: true }),
                expect.objectContaining({ id: 'target.md', path: 'target.md' }),
            ]));
            expect(getState('activeTabId')).toBe('target.md');
        });
    });

    describe('file tree path updates', () => {
        test('maps a moved directory path and leaves unrelated paths unchanged', () => {
            expect(movedTabPath('notes/drafts/a.md', 'notes', 'archive/notes')).toBe('archive/notes/drafts/a.md');
            expect(movedTabPath('elsewhere.md', 'notes', 'archive/notes')).toBeNull();
        });

        test('updates file and Draw.io tab paths, ids, pins, and the active tab after a move', () => {
            mockState.openTabs = [
                { id: 'notes/a.md', title: 'a.md', type: 'file', path: 'notes/a.md' },
                { id: 'notes/diagram.drawio.svg', title: 'diagram.drawio.svg', type: 'drawio', path: 'notes/diagram.drawio.svg' },
            ];
            mockState.activeTabId = 'notes/diagram.drawio.svg';
            mockState.pinnedTabs = ['notes/diagram.drawio.svg'];

            expect(updateTabsForMovedPath('notes', 'archive/notes')).toBe(true);

            expect(getState('openTabs')).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: 'archive/notes/a.md', path: 'archive/notes/a.md', title: 'a.md' }),
                expect.objectContaining({ id: 'archive/notes/diagram.drawio.svg', path: 'archive/notes/diagram.drawio.svg', type: 'drawio' }),
            ]));
            expect(getState('activeTabId')).toBe('archive/notes/diagram.drawio.svg');
            expect(getState('pinnedTabs')).toEqual(['archive/notes/diagram.drawio.svg']);
        });

        test('closes deleted Draw.io tabs and restores Welcome after the final editor tab disappears', () => {
            mockState.openTabs = [{ id: 'diagram.drawio.svg', title: 'Diagram', type: 'drawio', path: 'diagram.drawio.svg' }];
            mockState.activeTabId = 'diagram.drawio.svg';

            expect(closeTabsForDeletedPath('diagram.drawio.svg')).toBe(true);
            expect(getState('openTabs')).toEqual([
                expect.objectContaining({ id: 'home', type: 'home', title: 'Welcome' }),
            ]);
            expect(getState('activeTabId')).toBe('home');
        });

        test('requires an explicitly saved Draw.io editor before moving it', async () => {
            mockState.openTabs = [{ id: 'diagram.drawio.svg', title: 'Diagram', type: 'drawio', path: 'diagram.drawio.svg', dirty: true }];
            mockState.activeTabId = 'diagram.drawio.svg';

            await expect(prepareTabsForPathMove('diagram.drawio.svg')).resolves.toEqual({
                success: false,
                error: 'Save "Diagram" before moving it',
            });
            expect(window.pywebview.api.save_file).not.toHaveBeenCalled();
        });

        test('requires an explicitly saved Draw.io editor before copying it', async () => {
            mockState.openTabs = [{ id: 'diagrams/design.drawio.svg', title: 'Design', type: 'drawio', path: 'diagrams/design.drawio.svg', dirty: true }];
            mockState.activeTabId = 'diagrams/design.drawio.svg';

            await expect(prepareTabsForPathCopy('diagrams')).resolves.toEqual({
                success: false,
                error: 'Save "Design" before copying it',
            });
            expect(window.pywebview.api.save_file).not.toHaveBeenCalled();
        });

        test('saves dirty source content before copying without saving unrelated dirty notes', async () => {
            mockState.openTabs = [
                { id: 'Projects/plan.md', title: 'Plan', type: 'file', path: 'Projects/plan.md', dirty: true, mtime: 10 },
                { id: 'outside.md', title: 'Outside', type: 'file', path: 'outside.md', dirty: true, mtime: 20, _content: 'unrelated dirty content' },
            ];
            mockState.activeTabId = 'Projects/plan.md';
            getEditorContent.mockReturnValueOnce('latest visible plan');

            await expect(prepareTabsForPathCopy('Projects')).resolves.toEqual({ success: true });

            expect(window.pywebview.api.save_file).toHaveBeenCalledTimes(1);
            expect(window.pywebview.api.save_file).toHaveBeenCalledWith(
                'Projects/plan.md', 'latest visible plan', 10
            );
            expect(mockState.openTabs[0].dirty).toBe(false);
            expect(mockState.openTabs[1].dirty).toBe(true);
        });

        test('does not move a Draw.io tab while its SVG save is still in flight', async () => {
            mockState.openTabs = [{ id: 'diagram.drawio.svg', title: 'Diagram', type: 'drawio', path: 'diagram.drawio.svg', dirty: false }];
            mockState.activeTabId = 'diagram.drawio.svg';
            const panel = document.createElement('section');
            panel.className = 'tab-panel';
            panel.dataset.tabId = 'diagram.drawio.svg';
            panel._drawioSession = { saving: true };
            document.getElementById('tab-panels').appendChild(panel);

            await expect(prepareTabsForPathMove('diagram.drawio.svg')).resolves.toEqual({
                success: false,
                error: 'Save "Diagram" before moving it',
            });
        });

        test('saves an open dirty Markdown backlink source before a move', async () => {
            mockState.openTabs = [
                { id: 'moved.txt', title: 'Moved', type: 'file', path: 'moved.txt', dirty: false },
                { id: 'notes/backlink.md', title: 'Backlink', type: 'file', path: 'notes/backlink.md', dirty: true, _content: '[Moved](moved.txt)' },
            ];
            mockState.activeTabId = 'moved.txt';

            await expect(prepareTabsForPathMove('moved.txt')).resolves.toEqual({ success: true });
            expect(window.pywebview.api.save_file).toHaveBeenCalledWith(
                'notes/backlink.md', '[Moved](moved.txt)', expect.anything()
            );
        });

		test('saves every dirty Markdown buffer before a vault-wide link rewrite', async () => {
			mockState.openTabs = [
				{ id: 'active.md', title: 'Active', type: 'file', path: 'active.md', dirty: true, mtime: 10 },
				{ id: 'notes/other.md', title: 'Other', type: 'file', path: 'notes/other.md', dirty: true, mtime: 20, _content: 'other latest' },
				{ id: 'code.js', title: 'Code', type: 'file', path: 'code.js', dirty: true, mtime: 30, _content: 'code latest' },
			];
			mockState.activeTabId = 'active.md';
			getEditorContent.mockReturnValueOnce('active latest');

			await expect(prepareTabsForVaultLinkRewrite()).resolves.toEqual({ success: true });
			expect(window.pywebview.api.save_file).toHaveBeenCalledTimes(2);
			expect(window.pywebview.api.save_file).toHaveBeenCalledWith('active.md', 'active latest', 10);
			expect(window.pywebview.api.save_file).toHaveBeenCalledWith('notes/other.md', 'other latest', 20);
		});

		test('cancels a vault-wide rewrite if a note changes while its save is in flight', async () => {
			const save = deferred();
			const tab = { id: 'active.md', title: 'Active', type: 'file', path: 'active.md', dirty: true, mtime: 10 };
			mockState.openTabs = [tab];
			mockState.activeTabId = tab.id;
			getEditorContent.mockReturnValueOnce('snapshot');
			window.pywebview.api.save_file.mockReturnValueOnce(save.promise);

			const preparing = prepareTabsForVaultLinkRewrite();
			await testUtils.waitFor(0);
			tab._editGeneration = 1;
			tab.dirty = true;
			save.resolve({ success: true, mtime: 11 });

			await expect(preparing).resolves.toEqual({
				success: false,
				error: '"Active" changed while it was being saved; links were not rewritten',
			});
		});

        test('refreshes clean open tabs whose links were rewritten on disk', async () => {
            mockState.openTabs = [{ id: 'notes/backlink.md', title: 'Backlink', type: 'file', path: 'notes/backlink.md', dirty: false }];
            mockState.activeTabId = 'notes/backlink.md';
            window.pywebview.api.read_file.mockResolvedValueOnce({
                path: 'notes/backlink.md', content: '[Moved](archive/moved.txt)', mtime: 42,
            });

            await expect(refreshTabsForUpdatedLinks(['notes/backlink.md'])).resolves.toBe(true);
            expect(setEditorContent).toHaveBeenCalledWith('[Moved](archive/moved.txt)', 'notes/backlink.md');
            expect(mockState.openTabs[0]).toEqual(expect.objectContaining({
                _content: '[Moved](archive/moved.txt)', mtime: 42,
            }));
        });
    });

    describe('markTabDirty', () => {
        test('should mark tab as dirty', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            
            markTabDirty('tab1');
            
            const tab = getState('openTabs').find(t => t.id === 'tab1');
            expect(tab.dirty).toBe(true);
        });
    });

    describe('save queue', () => {
        test('On Save commits the saved file while interval modes do not', async () => {
            const tab = { id: 'note', type: 'file', path: 'note.md', title: 'Note', mtime: 10, dirty: true };
            mockState.openTabs = [tab];
            mockState.activeTabId = tab.id;
            window.pywebview.api.save_file.mockResolvedValue({ success: true, mtime: 11 });

            setAutoCommitMode(-1);
            await saveFileSnapshot(tab, 'saved and committed');
            expect(window.pywebview.api.commit_current_file).toHaveBeenCalledWith('note.md');

            window.pywebview.api.commit_current_file.mockClear();
            tab.dirty = true;
            setAutoCommitMode(3600);
            await saveFileSnapshot(tab, 'saved only');
            expect(window.pywebview.api.commit_current_file).not.toHaveBeenCalled();
        });

        test('On Save keeps a successful save and reports a failed history commit', async () => {
            const tab = { id: 'note', type: 'file', path: 'note.md', title: 'Note', mtime: 10, dirty: true };
            mockState.openTabs = [tab];
            mockState.activeTabId = tab.id;
            window.pywebview.api.save_file.mockResolvedValue({ success: true, mtime: 11 });
            window.pywebview.api.commit_current_file.mockRejectedValueOnce(new Error('git unavailable'));
            setAutoCommitMode(-1);

            await expect(saveFileSnapshot(tab, 'saved despite Git failure')).resolves.toEqual(
                expect.objectContaining({ success: true }),
            );
            expect(tab.dirty).toBe(false);
            expect(statusBar.set).toHaveBeenLastCalledWith('Saved; history commit failed');
        });

        test('serializes snapshots for one file using the prior save revision', async () => {
            let resolveFirst;
            let resolveSecond;
            const first = new Promise(resolve => { resolveFirst = resolve; });
            const second = new Promise(resolve => { resolveSecond = resolve; });
            const tab = { id: 'note', type: 'file', path: 'note.md', title: 'Note', mtime: 10, dirty: true };
            mockState.openTabs = [tab];
            mockState.activeTabId = tab.id;
            window.pywebview.api.save_file
                .mockImplementationOnce(() => first)
                .mockImplementationOnce(() => second);

            const firstSave = saveFileSnapshot(tab, 'first version');
            const secondSave = saveFileSnapshot(tab, 'second version');
            await testUtils.waitFor(0);

            expect(window.pywebview.api.save_file).toHaveBeenCalledTimes(1);
            expect(window.pywebview.api.save_file).toHaveBeenLastCalledWith('note.md', 'first version', 10);

            resolveFirst({ success: true, mtime: 11 });
            await firstSave;
            await testUtils.waitFor(0);

            expect(window.pywebview.api.save_file).toHaveBeenCalledTimes(2);
            expect(window.pywebview.api.save_file).toHaveBeenLastCalledWith('note.md', 'second version', 11);

            resolveSecond({ success: true, mtime: 12 });
            await secondSave;

            expect(tab.mtime).toBe(12);
            expect(tab.dirty).toBe(false);
        });
    });

    describe('updateTabTitle', () => {
        test('should update tab title', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            
            updateTabTitle('tab1', 'New Title');
            
            const tab = getState('openTabs').find(t => t.id === 'tab1');
            expect(tab.title).toBe('New Title');
        });
    });

    describe('getActiveTab', () => {
        test('should return active tab', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            
            const active = getActiveTab();
            
            expect(active.id).toBe('tab1');
        });

        test('should return null when no active tab', () => {
            const active = getActiveTab();
            expect(active).toBeNull();
        });
    });

    describe('renderTabBar', () => {
        test('should render tabs in tab strip', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            
            renderTabBar();
            
            const tabStrip = document.getElementById('tab-strip');
            expect(tabStrip.children.length).toBe(2);
        });

        test('marks rendered tabs as draggable', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            renderTabBar();

            expect(document.querySelector('[data-tab-id="tab1"]').getAttribute('draggable')).toBe('true');
        });

        test('should mark active tab', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            
            renderTabBar();
            
            const tabStrip = document.getElementById('tab-strip');
            const activeTab = tabStrip.querySelector('.tab.active');
            expect(activeTab.dataset.tabId).toBe('tab2');
        });

        test('should show dirty indicator', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            markTabDirty('tab1');
            
            renderTabBar();
            
            const tabStrip = document.getElementById('tab-strip');
            const dirtyTab = tabStrip.querySelector('.tab.dirty');
            expect(dirtyTab).not.toBeNull();
        });

        test('should sort pinned tabs first', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            mockState.pinnedTabs = ['tab2'];
            
            renderTabBar();
            
            const tabStrip = document.getElementById('tab-strip');
            const firstTab = tabStrip.children[0];
            expect(firstTab.dataset.tabId).toBe('tab2');
            expect(firstTab.classList.contains('pinned')).toBe(true);
        });

        test('should add pinned class to pinned tabs', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            mockState.pinnedTabs = ['tab1'];
            
            renderTabBar();
            
            const tabStrip = document.getElementById('tab-strip');
            const pinnedTab = tabStrip.querySelector('.tab.pinned');
            expect(pinnedTab).not.toBeNull();
            expect(pinnedTab.dataset.tabId).toBe('tab1');
        });

        test('should not add pinned class to unpinned tabs', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            mockState.pinnedTabs = ['tab1'];
            
            renderTabBar();
            
            const tabStrip = document.getElementById('tab-strip');
            const unpinnedTab = tabStrip.querySelectorAll('.tab:not(.pinned)');
            expect(unpinnedTab.length).toBe(1);
            expect(unpinnedTab[0].dataset.tabId).toBe('tab2');
        });
    });

    describe('tab reordering', () => {
        test('moves a tab and keeps the active tab unchanged', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            openTab('tab3', 'Tab 3', 'file', { path: 'tab3.md' });

            expect(reorderTab('tab3', 'tab1')).toBe(true);
            expect(getState('openTabs').map(tab => tab.id)).toEqual(['tab3', 'tab1', 'tab2']);
            expect(getState('activeTabId')).toBe('tab3');
            expect([...document.querySelectorAll('#tab-strip .tab')].map(tab => tab.dataset.tabId))
                .toEqual(['tab3', 'tab1', 'tab2']);
        });

        test('does not move a tab across the pinned tab boundary', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            mockState.pinnedTabs = ['tab1'];

            expect(reorderTab('tab2', 'tab1')).toBe(false);
            expect(getState('openTabs').map(tab => tab.id)).toEqual(['tab1', 'tab2']);
        });

        test('reorders through the native tab drag events', async () => {
            initTabManager();
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            openTab('tab3', 'Tab 3', 'file', { path: 'tab3.md' });

            const dataTransfer = {
                effectAllowed: '',
                dropEffect: '',
                setData: jest.fn(),
            };
            const dispatchDrag = (element, type, clientX = 1) => {
                const event = new Event(type, { bubbles: true, cancelable: true });
                Object.defineProperties(event, {
                    clientX: { value: clientX },
                    dataTransfer: { value: dataTransfer },
                });
                element.dispatchEvent(event);
            };

            const source = document.querySelector('[data-tab-id="tab1"]');
            const target = document.querySelector('[data-tab-id="tab3"]');
            dispatchDrag(source, 'dragstart');
            dispatchDrag(target, 'dragover');
            expect(target.classList.contains('drop-after')).toBe(true);
            dispatchDrag(target, 'drop');
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'tab1');
            expect(getState('openTabs').map(tab => tab.id)).toEqual(['tab2', 'tab3', 'tab1']);
            expect(document.querySelector('#tab-strip').classList.contains('is-dragging')).toBe(false);
        });
    });

    describe('middle-click close', () => {
        test('should close tab on middle-click', () => {
            initTabManager();
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            renderTabBar();
            
            const tabEl = document.querySelector('[data-tab-id="tab1"]');
            tabEl.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
            
            expect(getState('openTabs').length).toBe(1);
        });
    });
});
