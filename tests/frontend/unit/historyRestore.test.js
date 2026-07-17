import { testUtils } from './test_setup.js';

var mockState = {
    openTabs: [{ id: 'note.md', type: 'file', path: 'note.md', title: 'Note', mtime: 10, dirty: true }],
    activeTabId: 'note.md',
};

jest.mock('../frontend/js/state.js', () => ({
    getState: jest.fn(key => mockState[key]),
}));

const mockEditorView = { dom: document.createElement('div') };
const mockSetEditorContent = jest.fn();
const mockSetReadOnly = jest.fn();
jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn(() => mockEditorView),
    getEditorContent: jest.fn(() => 'unsaved current version'),
    setEditorContent: mockSetEditorContent,
    setReadOnly: mockSetReadOnly,
}));

const mockSaveFileSnapshot = jest.fn().mockResolvedValue({ success: true, mtime: 11 });
jest.mock('../frontend/js/tabManager.js', () => ({
    saveFileSnapshot: mockSaveFileSnapshot,
}));

jest.mock('../frontend/js/dialogs.js', () => ({
    confirmDialog: jest.fn(),
    errorDialog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() },
}));

import { initHistoryPanel, updateHistoryCount, closeHistoryPanel } from '../frontend/js/historyPanel.js';
import { confirmDialog as mockConfirmDialog, errorDialog as mockErrorDialog } from '../frontend/js/dialogs.js';

async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('history restore workflow', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        mockState.openTabs = [{ id: 'note.md', type: 'file', path: 'note.md', title: 'Note', mtime: 10, dirty: true }];
        mockState.activeTabId = 'note.md';
        window.go.main.App.GetCommitCount.mockResolvedValue(2);
        window.go.main.App.GetFileHistory.mockResolvedValue([
            { hash: 'latest123456', timestamp: 200, message: 'latest' },
            { hash: 'older1234567', timestamp: 100, message: 'older' },
        ]);
        window.go.main.App.GetFileVersion.mockResolvedValue('historical version');
        window.go.main.App.CommitCurrentFile.mockResolvedValue(null);
        mockSaveFileSnapshot.mockResolvedValue({ success: true, mtime: 11 });
        initHistoryPanel();
    });

    afterEach(() => closeHistoryPanel());

    test('commits the restored snapshot and refreshes History after a non-destructive revert', async () => {
        let entries = [
            { hash: 'latest123456', timestamp: 200, message: 'latest' },
            { hash: 'older1234567', timestamp: 100, message: 'older' },
        ];
        window.go.main.App.GetFileHistory.mockImplementation(async () => entries);
        updateHistoryCount('note.md');
        await settle();
        document.getElementById('history-count').click();
        await settle();
        document.querySelectorAll('.history-item')[1].click();
        await settle();

        const restore = document.querySelector('.history-revert-button');
        expect(restore.textContent).toContain('Revert to this version');
        expect(document.querySelector('.history-banner .history-restore-button')).toBeNull();
        expect(mockSetReadOnly).toHaveBeenCalledWith(true);
        expect(mockSetEditorContent).toHaveBeenCalledWith('historical version');

        mockConfirmDialog.mockResolvedValueOnce(false);
        restore.click();
        await settle();
        expect(mockSaveFileSnapshot).not.toHaveBeenCalled();
        expect(window.go.main.App.CommitCurrentFile).not.toHaveBeenCalled();

        mockConfirmDialog.mockResolvedValueOnce('confirm');
        entries = [
            { hash: 'restored123456', timestamp: 300, message: 'restored' },
            ...entries,
        ];
        restore.click();
        await settle();

        expect(mockConfirmDialog).toHaveBeenLastCalledWith(
            'Revert to this version?',
            expect.stringMatching(/current version will be saved in Git history/i),
            false,
            false,
            expect.objectContaining({ confirmLabel: 'Revert file' })
        );
        expect(mockSaveFileSnapshot.mock.calls.map(([, content]) => content)).toEqual([
            'unsaved current version',
            'historical version',
        ]);
        expect(window.go.main.App.CommitCurrentFile.mock.calls).toEqual([['note.md'], ['note.md']]);
        expect(mockSetReadOnly).toHaveBeenLastCalledWith(false);
        expect(mockSetEditorContent).toHaveBeenLastCalledWith('historical version');
        expect(document.querySelectorAll('.history-item')).toHaveLength(3);
        expect(document.querySelector('.history-current-notice').textContent).toMatch(/restored .*latest committed/i);
        expect(document.querySelector('.history-item-latest').textContent).toContain('Latest committed');
        expect(mockErrorDialog).not.toHaveBeenCalled();
    });

    test('keeps history mode open and reports an error when the current version cannot be preserved', async () => {
        updateHistoryCount('note.md');
        await settle();
        document.getElementById('history-count').click();
        await settle();
        document.querySelectorAll('.history-item')[1].click();
        await settle();
        mockConfirmDialog.mockResolvedValueOnce('confirm');
        mockSaveFileSnapshot.mockResolvedValueOnce({ success: false, error: 'vault is read-only' });

        document.querySelector('.history-revert-button').click();
        await settle();

        expect(mockErrorDialog).toHaveBeenCalledWith(
            'Couldn’t revert this file',
            expect.any(Error),
            'The selected version was not applied. Your current file remains available.',
        );
        expect(window.go.main.App.CommitCurrentFile).not.toHaveBeenCalled();
        expect(mockSetReadOnly).not.toHaveBeenCalledWith(false);
        expect(document.querySelector('.history-revert-button').disabled).toBe(false);
    });
});
