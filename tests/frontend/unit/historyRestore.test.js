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
        window.pywebview.api.get_commit_count.mockResolvedValue(2);
        window.pywebview.api.get_file_history.mockResolvedValue([
            { hash: 'latest123456', timestamp: 200, message: 'latest' },
            { hash: 'older1234567', timestamp: 100, message: 'older' },
        ]);
        window.pywebview.api.get_file_version.mockResolvedValue('historical version');
        window.pywebview.api.commit_current_file.mockResolvedValue(null);
        mockSaveFileSnapshot.mockResolvedValue({ success: true, mtime: 11 });
        initHistoryPanel();
    });

    afterEach(() => closeHistoryPanel());

    test('cancels non-destructively, then preserves current content in history before reverting', async () => {
        updateHistoryCount('note.md');
        await settle();
        document.getElementById('history-count').click();
        await settle();
        document.querySelectorAll('.history-item')[1].click();
        await settle();

        const restore = document.querySelector('.history-restore-button');
        expect(restore.textContent).toContain('Revert to this version');
        expect(mockSetReadOnly).toHaveBeenCalledWith(true);
        expect(mockSetEditorContent).toHaveBeenCalledWith('historical version');

        mockConfirmDialog.mockResolvedValueOnce(false);
        restore.click();
        await settle();
        expect(mockSaveFileSnapshot).not.toHaveBeenCalled();
        expect(window.pywebview.api.commit_current_file).not.toHaveBeenCalled();

        mockConfirmDialog.mockResolvedValueOnce('confirm');
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
        expect(window.pywebview.api.commit_current_file).toHaveBeenCalledWith('note.md');
        expect(mockSetReadOnly).toHaveBeenLastCalledWith(false);
        expect(mockSetEditorContent).toHaveBeenLastCalledWith('historical version');
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

        document.querySelector('.history-restore-button').click();
        await settle();

        expect(mockErrorDialog).toHaveBeenCalledWith(
            'Couldn’t revert this file',
            expect.any(Error),
            'The selected version was not applied. Your current file remains available.',
        );
        expect(window.pywebview.api.commit_current_file).not.toHaveBeenCalled();
        expect(mockSetReadOnly).not.toHaveBeenCalledWith(false);
        expect(document.querySelector('.history-restore-button').disabled).toBe(false);
    });
});
