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
    confirmDialog: jest.fn().mockResolvedValue(true),
    errorDialog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../frontend/js/calendar.js', () => ({
    renderCalendar: jest.fn(),
    loadCalendarResults: jest.fn(),
    invalidateCalendarCache: jest.fn(),
    refreshCalendarIfVisible: jest.fn(),
}));
jest.mock('../frontend/js/backlinks.js', () => ({
    loadBacklinksResults: jest.fn()
}));
jest.mock('../frontend/js/kanban.js', () => ({
    applyKanbanPresentationToViews: jest.fn(),
    initKanbanPresentationSettings: jest.fn(),
    renderKanbanBoard: jest.fn(),
}));
jest.mock('../frontend/js/theme.js', () => ({
    initSettingsPanel: jest.fn().mockResolvedValue()
}));
jest.mock('../frontend/js/home.js', () => ({
    renderHome: jest.fn(),
}));
jest.mock('../frontend/js/vaultHealth.js', () => ({
    renderVaultHealth: jest.fn().mockResolvedValue(),
}));
jest.mock('../frontend/js/drawio.js', () => ({
    renderDrawioTab: jest.fn().mockResolvedValue(),
}));

import { state, setState, getState } from '../frontend/js/state.js';
import { getEditorView, getEditorContent, getEditorDocumentTabId, setEditorContent, focusEditor, saveCursorState } from '../frontend/js/editor.js';
import { initSettingsPanel } from '../frontend/js/theme.js';
import { setAutoCommitEnabled } from '../frontend/js/automation.js';
import { statusBar } from '../frontend/js/statusBar.js';
import { errorDialog } from '../frontend/js/dialogs.js';
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
    prepareTabsForPathDelete,
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

// Mock native Wails App binding.
window.go = { desktop: { App: {
    SaveFile: jest.fn().mockResolvedValue({ success: true, mtime: Date.now() }),
    SaveSession: jest.fn().mockResolvedValue({ success: true }),
    ReadFile: jest.fn().mockResolvedValue({ content: '', mtime: Date.now(), path: '' }),
    ReadLaunchExternalFile: jest.fn().mockResolvedValue({ content: '', mtime: Date.now(), path: '' }),
    CommitCurrentFile: jest.fn().mockResolvedValue(null),
    GetApplicationVersion: jest.fn().mockResolvedValue('1.7.0'),
} } };

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
        setAutoCommitEnabled(true);
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

            expect(setEditorContent).toHaveBeenCalledWith('', 'fresh.md', null);
            expect(window.go.desktop.App.ReadFile).not.toHaveBeenCalled();
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

        test('keeps an external tab unselected until its capability read is ready', async () => {
            const externalRead = deferred();
            mockState.openTabs = [{
                id: 'inside.md',
                title: 'Inside',
                type: 'file',
                path: 'inside.md',
                dirty: false,
            }];
            mockState.activeTabId = 'inside.md';
            getEditorDocumentTabId.mockReturnValue('inside.md');
            window.go.desktop.App.ReadLaunchExternalFile.mockImplementationOnce(() => externalRead.promise);

            const external = openTab('external:launch-1', 'outside.md', 'file', {
                path: '/home/writer/outside.md',
                mtime: 1,
                externalFileId: 'launch-1',
            });

            expect(external.externalFileId).toBe('launch-1');
            expect(getState('activeTabId')).toBe('inside.md');
            expect(window.go.desktop.App.ReadLaunchExternalFile).toHaveBeenCalledWith('launch-1');
            expect(window.go.desktop.App.ReadFile).not.toHaveBeenCalledWith('/home/writer/outside.md');

            externalRead.resolve({
                content: '# Outside\n',
                mtime: 2,
                path: '/home/writer/outside.md',
            });
            await testUtils.waitFor(0);

            expect(getState('activeTabId')).toBe('external:launch-1');
            expect(setEditorContent).toHaveBeenCalledWith('# Outside\n', 'external:launch-1', null);
            expect(mockState.recentFiles).toEqual([]);
        });

        test('leaves the previous tab and buffer active when an external read fails', async () => {
            mockState.openTabs = [{
                id: 'inside.md',
                title: 'Inside',
                type: 'file',
                path: 'inside.md',
                dirty: false,
            }];
            mockState.activeTabId = 'inside.md';
            getEditorDocumentTabId.mockReturnValue('inside.md');
            window.go.desktop.App.ReadLaunchExternalFile.mockRejectedValueOnce(new Error('External file is unavailable'));

            openTab('external:launch-1', 'outside.md', 'file', {
                path: '/home/writer/outside.md',
                externalFileId: 'launch-1',
            });
            await testUtils.waitFor(0);

            expect(getState('activeTabId')).toBe('inside.md');
            expect(setEditorContent).not.toHaveBeenCalledWith(
                expect.anything(),
                'external:launch-1',
                expect.anything(),
            );
            expect(errorDialog).toHaveBeenCalledWith(
                'Couldn’t open external note',
                expect.objectContaining({ message: 'External file is unavailable' }),
                'The original external note could not be read.',
            );
        });

        test('does not let an older external read overtake a newer tab choice', async () => {
            const firstRead = deferred();
            const secondRead = deferred();
            mockState.openTabs = [{
                id: 'inside.md',
                title: 'Inside',
                type: 'file',
                path: 'inside.md',
                dirty: false,
            }];
            mockState.activeTabId = 'inside.md';
            getEditorDocumentTabId.mockReturnValue('inside.md');
            window.go.desktop.App.ReadLaunchExternalFile
                .mockImplementationOnce(() => firstRead.promise)
                .mockImplementationOnce(() => secondRead.promise);

            openTab('external:first', 'first.md', 'file', {
                path: '/home/writer/first.md',
                externalFileId: 'first',
            });
            openTab('external:second', 'second.md', 'file', {
                path: '/home/writer/second.md',
                externalFileId: 'second',
            });

            secondRead.resolve({ content: '# Second\n', mtime: 2 });
            await testUtils.waitFor(0);
            expect(getState('activeTabId')).toBe('external:second');

            firstRead.resolve({ content: '# First\n', mtime: 1 });
            await testUtils.waitFor(0);

            expect(getState('activeTabId')).toBe('external:second');
            expect(setEditorContent).toHaveBeenLastCalledWith('# Second\n', 'external:second', null);
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

        test('renders the three enabled-by-default Markdown navigation controls with accessible descriptions', () => {
            openTab('settings', 'Settings', 'settings');
            const panel = document.querySelector('.tab-panel[data-tab-id="settings"]');
            const controls = [
                ['sticky-headings-toggle', 'sticky-headings-description'],
                ['markdown-block-guides-toggle', 'markdown-block-guides-description'],
                ['document-outline-toggle', 'document-outline-description'],
            ];

            for (const [id, description] of controls) {
                const control = panel.querySelector(`#${id}`);
                expect(control).toBeInstanceOf(HTMLInputElement);
                expect(control.type).toBe('checkbox');
                expect(control.checked).toBe(true);
                expect(control.getAttribute('aria-label')).toBeTruthy();
                expect(control.getAttribute('aria-describedby')).toBe(description);
                expect(panel.querySelector(`#${description}`)).not.toBeNull();
            }
        });

        test('shows the packaged application version in an accessible Settings About card', async () => {
            openTab('settings', 'Settings', 'settings');
            await testUtils.waitFor(0);

            const panel = document.querySelector('.tab-panel[data-tab-id="settings"]');
            const version = panel.querySelector('#application-version');
            expect(version.closest('.application-about-card').textContent).toContain('About');
            expect(version.getAttribute('aria-label')).toBe('Application version');
            expect(version.getAttribute('aria-busy')).toBe('false');
            expect(version.dataset.state).toBe('ready');
            expect(version.textContent).toBe('1.7.0');
            expect(window.go.desktop.App.GetApplicationVersion).toHaveBeenCalledTimes(1);
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
            expect(panel.querySelector('#editor-breadcrumbs-toggle').getAttribute('aria-label'))
                .toBe('Show editor breadcrumbs');
            expect(panel.querySelector('#auto-commit-toggle')).not.toBeNull();
            expect(panel.querySelector('#auto-commit-toggle').checked).toBe(true);
            expect(panel.querySelector('#auto-commit-description').textContent).toMatch(/only the file that just saved/i);
        });

        test('presents Spellcheck scope as concise accessible guidance', () => {
            openTab('settings', 'Settings', 'settings');
            const panel = document.querySelector('.tab-panel[data-tab-id="settings"]');
            const language = panel.querySelector('#spellcheck-language');
            const guidance = panel.querySelector('#spellcheck-guidance');
            const rows = guidance.querySelectorAll('.settings-spellcheck-guidance-row');

            expect(language.getAttribute('aria-describedby')).toBe('spellcheck-guidance');
            expect(guidance.classList.contains('ui-notice')).toBe(true);
            expect(guidance.classList.contains('ui-notice--info')).toBe(true);
            expect(guidance.getAttribute('role')).toBe('note');
            expect(rows).toHaveLength(2);
            expect(rows[0].querySelector('strong').textContent).toBe('Vault default');
            expect(rows[0].textContent).toContain('None');
            expect(rows[1].querySelector('strong').textContent).toBe('Per note');
            expect(rows[1].querySelector('code').textContent).toBe('spellcheck: false');
        });

        test('does not let an older read overwrite a newer load of the same tab', async () => {
            const firstA = deferred();
            const latestA = deferred();
            window.go.desktop.App.ReadFile
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

            expect(setEditorContent).toHaveBeenLastCalledWith('Latest A content', 'a', { anchor: 0, head: 0 });
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
            window.go.desktop.App.SaveFile.mockImplementationOnce(() => saveB.promise);
            mockState.openTabs = [
                { id: 'a', title: 'A', type: 'file', path: 'a.md', dirty: true, _content: 'A draft', _editGeneration: 1 },
                { id: 'b', title: 'B', type: 'file', path: 'b.md', dirty: true, _content: 'B draft', _editGeneration: 1 },
            ];
            mockState.activeTabId = 'b';
            getEditorDocumentTabId.mockReturnValue('a');
            getEditorContent.mockReturnValue('A still visible');

            switchTab('a');
            await testUtils.waitFor(0);

            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledWith('b.md', 'B draft', 0);
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

        test('returns to previously edited file after closing settings', async () => {
            openTab('note-1', 'Note 1', 'file', { path: 'note-1.md' });
            openTab('note-2', 'Note 2', 'file', { path: 'note-2.md' });
            await switchTab('note-1');
            openTab('settings', 'Settings', 'settings');

            await closeTab('settings');

            expect(getState('activeTabId')).toBe('note-1');
        });

        test('preserves the active file cursor while Settings is opened and closed', async () => {
            openTab('note-1', 'Note 1', 'file', { path: 'note-1.md' });
            await testUtils.waitFor(0);
            setEditorContent.mockClear();
            const cursorState = { anchor: 17, head: 19 };
            saveCursorState.mockReturnValue(cursorState);

            openTab('settings', 'Settings', 'settings');
            expect(getState('openTabs').find(tab => tab.id === 'note-1').cursorState).toEqual(cursorState);

            await closeTab('settings');
            await testUtils.waitFor(0);

            expect(getState('activeTabId')).toBe('note-1');
            expect(setEditorContent).toHaveBeenCalledWith('', 'note-1', cursorState);
        });

        test('returns to previously edited file after closing kanban', async () => {
            openTab('note-1', 'Note 1', 'file', { path: 'note-1.md' });
            openTab('note-2', 'Note 2', 'file', { path: 'note-2.md' });
            await switchTab('note-1');
            openTab('kanban', 'Kanban', 'kanban', {});

            await closeTab('kanban');

            expect(getState('activeTabId')).toBe('note-1');
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

        test('keeps the workspace overview without a synthetic tab after closing the last tab', async () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });

            await closeTab('tab1');

            expect(getState('openTabs')).toEqual([]);
            expect(getState('activeTabId')).toBeNull();
            expect(document.querySelectorAll('#tab-strip .tab')).toHaveLength(0);
            expect(document.querySelector('.workspace-home-panel.active')).not.toBeNull();
        });

        test('routes legacy Home tab requests to the workspace overview', () => {
            expect(openTab('home', 'Welcome', 'home')).toBeNull();
            expect(getState('openTabs')).toEqual([]);
            expect(getState('activeTabId')).toBeNull();
            expect(document.querySelector('.workspace-home-panel.active')).not.toBeNull();
        });
    });

    describe('safe link replacement', () => {
        test('saves a dirty source tab before reusing it for a link destination', async () => {
            openTab('source.md', 'Source', 'file', { path: 'source.md', mtime: 1 });
            markTabDirty('source.md');
            window.go.desktop.App.SaveFile.mockResolvedValueOnce({ success: true, mtime: 2 });

            await replaceActiveFileTab('target.md', 'Target', 'file', { path: 'target.md', mtime: 3 });

            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledWith('source.md', '', 1);
            expect(getState('openTabs')).toEqual([
                expect.objectContaining({ id: 'target.md', path: 'target.md', type: 'file' }),
            ]);
            expect(getState('activeTabId')).toBe('target.md');
        });

        test('preserves a dirty source tab when saving before navigation fails', async () => {
            openTab('source.md', 'Source', 'file', { path: 'source.md', mtime: 1 });
            markTabDirty('source.md');
            window.go.desktop.App.SaveFile.mockRejectedValueOnce(new Error('disk full'));

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

        test('closes deleted Draw.io tabs and restores the workspace overview after the final editor tab disappears', () => {
            mockState.openTabs = [{ id: 'diagram.drawio.svg', title: 'Diagram', type: 'drawio', path: 'diagram.drawio.svg' }];
            mockState.activeTabId = 'diagram.drawio.svg';

            expect(closeTabsForDeletedPath('diagram.drawio.svg')).toBe(true);
            expect(getState('openTabs')).toEqual([]);
            expect(getState('activeTabId')).toBeNull();
            expect(document.querySelector('.workspace-home-panel.active')).not.toBeNull();
        });

        test('requires an explicitly saved Draw.io editor before moving it', async () => {
            mockState.openTabs = [{ id: 'diagram.drawio.svg', title: 'Diagram', type: 'drawio', path: 'diagram.drawio.svg', dirty: true }];
            mockState.activeTabId = 'diagram.drawio.svg';

            await expect(prepareTabsForPathMove('diagram.drawio.svg')).resolves.toEqual({
                success: false,
                error: 'Save "Diagram" before moving it',
            });
            expect(window.go.desktop.App.SaveFile).not.toHaveBeenCalled();
        });

        test('requires an explicitly saved Draw.io editor before copying it', async () => {
            mockState.openTabs = [{ id: 'diagrams/design.drawio.svg', title: 'Design', type: 'drawio', path: 'diagrams/design.drawio.svg', dirty: true }];
            mockState.activeTabId = 'diagrams/design.drawio.svg';

            await expect(prepareTabsForPathCopy('diagrams')).resolves.toEqual({
                success: false,
                error: 'Save "Design" before copying it',
            });
            expect(window.go.desktop.App.SaveFile).not.toHaveBeenCalled();
        });

        test('saves dirty source content before copying without saving unrelated dirty notes', async () => {
            mockState.openTabs = [
                { id: 'Projects/plan.md', title: 'Plan', type: 'file', path: 'Projects/plan.md', dirty: true, mtime: 10 },
                { id: 'outside.md', title: 'Outside', type: 'file', path: 'outside.md', dirty: true, mtime: 20, _content: 'unrelated dirty content' },
            ];
            mockState.activeTabId = 'Projects/plan.md';
            getEditorContent.mockReturnValueOnce('latest visible plan');

            await expect(prepareTabsForPathCopy('Projects')).resolves.toEqual({ success: true });

            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledTimes(1);
            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledWith(
                'Projects/plan.md', 'latest visible plan', 10
            );
            expect(mockState.openTabs[0].dirty).toBe(false);
            expect(mockState.openTabs[1].dirty).toBe(true);
        });

        test('saves dirty source content before deletion so the archive sees the visible editor version', async () => {
            mockState.openTabs = [
                { id: 'Projects/plan.md', title: 'Plan', type: 'file', path: 'Projects/plan.md', dirty: true, mtime: 10 },
                { id: 'outside.md', title: 'Outside', type: 'file', path: 'outside.md', dirty: true, mtime: 20, _content: 'unrelated dirty content' },
            ];
            mockState.activeTabId = 'Projects/plan.md';
            getEditorContent.mockReturnValueOnce('latest visible plan');

            await expect(prepareTabsForPathDelete('Projects')).resolves.toEqual({ success: true });

            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledTimes(1);
            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledWith(
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
            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledWith(
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
			expect(window.go.desktop.App.SaveFile).toHaveBeenCalledTimes(2);
			expect(window.go.desktop.App.SaveFile).toHaveBeenCalledWith('active.md', 'active latest', 10);
			expect(window.go.desktop.App.SaveFile).toHaveBeenCalledWith('notes/other.md', 'other latest', 20);
		});

		test('cancels a vault-wide rewrite if a note changes while its save is in flight', async () => {
			const save = deferred();
			const tab = { id: 'active.md', title: 'Active', type: 'file', path: 'active.md', dirty: true, mtime: 10 };
			mockState.openTabs = [tab];
			mockState.activeTabId = tab.id;
			getEditorContent.mockReturnValueOnce('snapshot');
			window.go.desktop.App.SaveFile.mockReturnValueOnce(save.promise);

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
            window.go.desktop.App.ReadFile.mockResolvedValueOnce({
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
        test('writes a MIME-launched file to its original path without creating vault history', async () => {
            const tab = {
                id: 'external:1',
                type: 'file',
                path: 'C:\\Notes\\outside.md',
                externalFileId: '1',
                title: 'outside.md',
                mtime: 10,
                dirty: true,
            };
            mockState.openTabs = [tab];
            mockState.activeTabId = tab.id;
            window.go.desktop.App.SaveLaunchExternalFile = jest.fn().mockResolvedValue({ success: true, mtime: 11 });

            setAutoCommitEnabled(true);
            await expect(saveFileSnapshot(tab, 'saved outside the vault')).resolves.toEqual(
                expect.objectContaining({ success: true, historyCommitSucceeded: false }),
            );

            expect(window.go.desktop.App.SaveLaunchExternalFile).toHaveBeenCalledWith('1', 'saved outside the vault', 10);
            expect(window.go.desktop.App.SaveFile).not.toHaveBeenCalled();
            expect(window.go.desktop.App.CommitCurrentFile).not.toHaveBeenCalled();
        });

        test('Auto-Commit records only the saved file and leaves unrelated files untouched', async () => {
            const tab = { id: 'note', type: 'file', path: 'note.md', title: 'Note', mtime: 10, dirty: true };
            mockState.openTabs = [tab];
            mockState.activeTabId = tab.id;
            window.go.desktop.App.SaveFile.mockResolvedValue({ success: true, mtime: 11 });

            setAutoCommitEnabled(true);
            await expect(saveFileSnapshot(tab, 'saved and committed')).resolves.toEqual(
                expect.objectContaining({ success: true, historyCommitSucceeded: true }),
            );
            expect(window.go.desktop.App.CommitCurrentFile).toHaveBeenCalledWith('note.md');

            window.go.desktop.App.CommitCurrentFile.mockClear();
            tab.dirty = true;
            setAutoCommitEnabled(false);
            await saveFileSnapshot(tab, 'saved only');
            expect(window.go.desktop.App.CommitCurrentFile).not.toHaveBeenCalled();
        });

        test('Auto-Commit keeps a successful save and reports a failed history commit', async () => {
            const tab = { id: 'note', type: 'file', path: 'note.md', title: 'Note', mtime: 10, dirty: true };
            mockState.openTabs = [tab];
            mockState.activeTabId = tab.id;
            window.go.desktop.App.SaveFile.mockResolvedValue({ success: true, mtime: 11 });
            window.go.desktop.App.CommitCurrentFile.mockRejectedValueOnce(new Error('git unavailable'));
            setAutoCommitEnabled(true);

            await expect(saveFileSnapshot(tab, 'saved despite Git failure')).resolves.toEqual(
                expect.objectContaining({ success: true, historyCommitSucceeded: false }),
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
            window.go.desktop.App.SaveFile
                .mockImplementationOnce(() => first)
                .mockImplementationOnce(() => second);

            const firstSave = saveFileSnapshot(tab, 'first version');
            const secondSave = saveFileSnapshot(tab, 'second version');
            await testUtils.waitFor(0);

            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledTimes(1);
            expect(window.go.desktop.App.SaveFile).toHaveBeenLastCalledWith('note.md', 'first version', 10);

            resolveFirst({ success: true, mtime: 11 });
            await firstSave;
            await testUtils.waitFor(0);

            expect(window.go.desktop.App.SaveFile).toHaveBeenCalledTimes(2);
            expect(window.go.desktop.App.SaveFile).toHaveBeenLastCalledWith('note.md', 'second version', 11);

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

        test('renders tabs as pointer-driven drag targets without native HTML dragging', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            renderTabBar();

            expect(document.querySelector('[data-tab-id="tab1"]').hasAttribute('draggable')).toBe(false);
        });

        test('prevents tab-title selection while tabs are manipulated', () => {
            initTabManager();
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });

            const selection = new Event('selectstart', { bubbles: true, cancelable: true });
            const dispatched = document.querySelector('[data-tab-id="tab1"] .tab-title')
                .dispatchEvent(selection);

            expect(dispatched).toBe(false);
            expect(selection.defaultPrevented).toBe(true);
        });

        test('should mark active tab', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            
            renderTabBar();
            
            const tabStrip = document.getElementById('tab-strip');
            const activeTab = tabStrip.querySelector('.tab.active');
            expect(activeTab.dataset.tabId).toBe('tab2');
            expect(activeTab.classList.contains('ui-document-tab')).toBe(true);
            expect(activeTab.classList.contains('ui-document-tab--active')).toBe(true);
            expect(activeTab.querySelector('.tab-close').getAttribute('aria-label')).toBe('Close Tab 2');
        });

        test('should show dirty indicator', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            markTabDirty('tab1');
            
            renderTabBar();
            
            const tabStrip = document.getElementById('tab-strip');
            const dirtyTab = tabStrip.querySelector('.tab.dirty');
            expect(dirtyTab).not.toBeNull();
            expect(dirtyTab.classList.contains('ui-document-tab--dirty')).toBe(true);
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
            expect(pinnedTab.classList.contains('ui-document-tab--pinned')).toBe(true);
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

        test('keeps newly opened and selected active tabs visible and only exposes All tabs while crowded', () => {
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });

            const tabStrip = document.getElementById('tab-strip');
            const tabBar = document.getElementById('tab-bar');
            const allTabsButton = document.getElementById('all-tabs-btn');
            Object.defineProperties(tabStrip, {
                clientWidth: { configurable: true, value: 200 },
                scrollWidth: { configurable: true, value: 420 },
            });
            const rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
                .mockImplementation(function getTabOverflowRect() {
                    if (this === tabStrip) return { left: 0, right: 200, width: 200 };
                    if (this.dataset?.tabId === 'tab1') {
                        return { left: -tabStrip.scrollLeft, right: 120 - tabStrip.scrollLeft, width: 120 };
                    }
                    if (this.dataset?.tabId === 'tab2') {
                        return { left: 300 - tabStrip.scrollLeft, right: 420 - tabStrip.scrollLeft, width: 120 };
                    }
                    return { left: 0, right: 0, width: 0 };
                });
            try {
                tabStrip.scrollLeft = 0;
                renderTabBar();
                expect(getState('activeTabId')).toBe('tab2');
                expect(tabStrip.scrollLeft).toBe(220);
                expect(allTabsButton.hidden).toBe(false);
                expect(tabBar.classList.contains('tabs-can-scroll-start')).toBe(true);
                expect(tabBar.classList.contains('tabs-can-scroll-end')).toBe(false);

                switchTab('tab1');
                expect(tabStrip.scrollLeft).toBe(0);
                expect(tabBar.classList.contains('tabs-can-scroll-start')).toBe(false);
                expect(tabBar.classList.contains('tabs-can-scroll-end')).toBe(true);

                Object.defineProperties(tabStrip, {
                    clientWidth: { configurable: true, value: 500 },
                    scrollWidth: { configurable: true, value: 240 },
                });
                renderTabBar();
                expect(allTabsButton.hidden).toBe(true);
                expect(tabBar.classList.contains('tabs-overflow')).toBe(false);
            } finally {
                rectSpy.mockRestore();
            }
        });

        test('reveals a restored active tab after pinned tabs are sorted to the leading edge', () => {
            mockState.openTabs = [
                { id: 'tab1', title: 'Tab 1', type: 'file', path: 'tab1.md', dirty: false },
                { id: 'tab2', title: 'Tab 2', type: 'file', path: 'tab2.md', dirty: false },
                { id: 'tab3', title: 'Tab 3', type: 'file', path: 'tab3.md', dirty: false },
            ];
            mockState.activeTabId = 'tab3';
            mockState.pinnedTabs = ['tab2', 'tab3'];

            const tabStrip = document.getElementById('tab-strip');
            Object.defineProperties(tabStrip, {
                clientWidth: { configurable: true, value: 200 },
                scrollWidth: { configurable: true, value: 420 },
            });
            const rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
                .mockImplementation(function getRestoredTabRect() {
                    if (this === tabStrip) return { left: 0, right: 200, width: 200 };
                    if (this.classList?.contains('tab')) {
                        const index = [...tabStrip.children].indexOf(this);
                        const left = index * 140 - tabStrip.scrollLeft;
                        return { left, right: left + 140, width: 140 };
                    }
                    return { left: 0, right: 0, width: 0 };
                });
            try {
                tabStrip.scrollLeft = 220;
                renderTabBar();

                expect([...tabStrip.children].map(tab => tab.dataset.tabId))
                    .toEqual(['tab2', 'tab3', 'tab1']);
                expect(tabStrip.scrollLeft).toBe(140);
                const active = tabStrip.querySelector('.tab.active').getBoundingClientRect();
                expect(active.left).toBe(0);
                expect(active.right).toBe(140);
            } finally {
                rectSpy.mockRestore();
            }
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

        test('reorders through pointer drag events', async () => {
            initTabManager();
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });
            openTab('tab3', 'Tab 3', 'file', { path: 'tab3.md' });

            const dispatchPointer = (element, type, clientX, { button = 0, buttons = 1 } = {}) => {
                const event = new Event(type, { bubbles: true, cancelable: true });
                Object.defineProperties(event, {
                    clientX: { value: clientX },
                    clientY: { value: 10 },
                    pointerId: { value: 7 },
                    isPrimary: { value: true },
                    button: { value: button },
                    buttons: { value: buttons },
                });
                element.dispatchEvent(event);
            };

            const source = document.querySelector('[data-tab-id="tab1"]');
            const target = document.querySelector('[data-tab-id="tab3"]');
            dispatchPointer(source, 'pointerdown', 1);
            dispatchPointer(target, 'pointermove', 20);
            expect(target.classList.contains('drop-after')).toBe(true);
            dispatchPointer(target, 'pointerup', 20, { buttons: 0 });
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(getState('openTabs').map(tab => tab.id)).toEqual(['tab2', 'tab3', 'tab1']);
            expect(document.querySelector('#tab-strip').classList.contains('is-dragging')).toBe(false);
        });

        test('cancels a pointer drag without changing tab order', () => {
            initTabManager();
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });

            const dispatchPointer = (element, type, clientX) => {
                const event = new Event(type, { bubbles: true, cancelable: true });
                Object.defineProperties(event, {
                    clientX: { value: clientX },
                    clientY: { value: 10 },
                    pointerId: { value: 8 },
                    isPrimary: { value: true },
                    button: { value: 0 },
                    buttons: { value: 1 },
                });
                element.dispatchEvent(event);
            };

            const source = document.querySelector('[data-tab-id="tab1"]');
            const target = document.querySelector('[data-tab-id="tab2"]');
            dispatchPointer(source, 'pointerdown', 1);
            dispatchPointer(target, 'pointermove', 20);
            dispatchPointer(target, 'pointercancel', 20);

            expect(getState('openTabs').map(tab => tab.id)).toEqual(['tab1', 'tab2']);
            expect(document.querySelector('.tab.dragging')).toBeNull();
            expect(document.querySelector('.tab.drop-after')).toBeNull();
        });
    });

    describe('All tabs overflow menu', () => {
        test('uses menu buttons and supports keyboard selection of a hidden tab', () => {
            const tabStrip = document.getElementById('tab-strip');
            Object.defineProperties(tabStrip, {
                clientWidth: { configurable: true, value: 120 },
                scrollWidth: { configurable: true, value: 360 },
            });
            initTabManager();
            openTab('tab1', 'Tab 1', 'file', { path: 'tab1.md' });
            openTab('tab2', 'Tab 2', 'file', { path: 'tab2.md' });

            const button = document.getElementById('all-tabs-btn');
            const dropdown = document.getElementById('all-tabs-dropdown');
            button.click();

            const items = [...dropdown.querySelectorAll('[role="menuitem"]')];
            expect(button.hidden).toBe(false);
            expect(button.getAttribute('aria-expanded')).toBe('true');
            expect(dropdown.getAttribute('aria-label')).toBe('All open tabs');
            expect(items).toHaveLength(2);
            expect(items.every(item => item instanceof HTMLButtonElement)).toBe(true);
            expect(document.activeElement.dataset.tabId).toBe('tab2');

            dropdown.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Home',
                bubbles: true,
                cancelable: true,
            }));
            expect(document.activeElement.dataset.tabId).toBe('tab1');
            document.activeElement.click();

            expect(getState('activeTabId')).toBe('tab1');
            expect(dropdown.classList.contains('hidden')).toBe(true);
            expect(button.getAttribute('aria-expanded')).toBe('false');
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
