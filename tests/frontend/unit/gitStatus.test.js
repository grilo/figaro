import { testUtils } from './test_setup.js';

var mockState = {
    openTabs: [{ id: 'note.md', type: 'file', path: 'note.md', title: 'Note', dirty: false }],
    activeTabId: 'note.md',
};

jest.mock('../frontend/js/state.js', () => ({
    getState: jest.fn(key => mockState[key]),
}));

const mockGetEditorContent = jest.fn(() => 'pending text');
jest.mock('../frontend/js/editor.js', () => ({
    getEditorContent: mockGetEditorContent,
    getEditorView: jest.fn(() => null),
    setEditorContent: jest.fn(),
    setReadOnly: jest.fn(),
}));

const mockSaveFileSnapshot = jest.fn();
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

import { commitCurrentFileChanges, initHistoryPanel, updateGitStatus } from '../frontend/js/historyPanel.js';
import { errorDialog } from '../frontend/js/dialogs.js';
import { statusBar } from '../frontend/js/statusBar.js';

describe('quiet local-history action', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        mockState.openTabs = [{ id: 'note.md', type: 'file', path: 'note.md', title: 'Note', dirty: false }];
        mockState.activeTabId = 'note.md';
        window.go.main.App.FileHasUncommittedChanges.mockResolvedValue(true);
        window.go.main.App.CommitCurrentFile.mockResolvedValue(null);
        mockSaveFileSnapshot.mockImplementation(async tab => {
            tab.dirty = false;
            return { success: true, mtime: 12 };
        });
    });

    test('only exposes a plain-language action for an active file with unrecorded changes', async () => {
        await expect(updateGitStatus('note.md')).resolves.toBe(true);

        const control = document.getElementById('git-status');
        expect(window.go.main.App.FileHasUncommittedChanges).toHaveBeenCalledWith('note.md');
        expect(control.textContent).toBe('Save to history');
        expect(control.classList).toContain('is-uncommitted');
        expect(control.disabled).toBe(false);

        await updateGitStatus('');
        expect(control.hidden).toBe(true);
        expect(document.getElementById('git-status-separator').hidden).toBe(true);
    });

    test('saves a dirty buffer before recording it, then hides the clean state', async () => {
        mockState.openTabs[0].dirty = true;
        await updateGitStatus('note.md');
        window.go.main.App.FileHasUncommittedChanges.mockResolvedValue(false);

        await expect(commitCurrentFileChanges()).resolves.toBe(true);

        expect(mockSaveFileSnapshot).toHaveBeenCalledWith(mockState.openTabs[0], 'pending text');
        expect(window.go.main.App.CommitCurrentFile).toHaveBeenCalledWith('note.md');
        expect(statusBar.set).toHaveBeenCalledWith('Saved file to local history');
        expect(document.getElementById('git-status').textContent).toBe('Save to history');
        expect(document.getElementById('git-status').disabled).toBe(true);
        expect(document.getElementById('git-status').hidden).toBe(true);
    });

    test('reuses the successful single-file Auto-Commit after saving instead of committing twice', async () => {
        mockState.openTabs[0].dirty = true;
        mockSaveFileSnapshot.mockImplementation(async tab => {
            tab.dirty = false;
            return { success: true, mtime: 12, historyCommitSucceeded: true };
        });
        await updateGitStatus('note.md');
        window.go.main.App.FileHasUncommittedChanges.mockResolvedValue(false);

        await expect(commitCurrentFileChanges()).resolves.toBe(true);

        expect(mockSaveFileSnapshot).toHaveBeenCalledWith(mockState.openTabs[0], 'pending text');
        expect(window.go.main.App.CommitCurrentFile).not.toHaveBeenCalled();
        expect(statusBar.set).toHaveBeenCalledWith('Saved file to local history');
    });

    test('reappears as a history action when the active file becomes dirty after recording', async () => {
        initHistoryPanel();
        window.go.main.App.FileHasUncommittedChanges.mockResolvedValue(false);
        await updateGitStatus('note.md');

        document.dispatchEvent(new CustomEvent('active-file-dirty', { detail: { path: 'note.md' } }));

        const control = document.getElementById('git-status');
        expect(control.textContent).toBe('Save to history');
        expect(control.disabled).toBe(false);
        expect(control.classList).toContain('is-uncommitted');
    });

    test('keeps the warning and reports a non-destructive commit failure', async () => {
        await updateGitStatus('note.md');
        window.go.main.App.CommitCurrentFile.mockRejectedValueOnce(new Error('another file is staged'));

        await expect(commitCurrentFileChanges()).resolves.toBe(false);

        expect(errorDialog).toHaveBeenCalledWith(
            'Couldn’t commit this file',
            expect.objectContaining({ message: 'another file is staged' }),
            expect.stringMatching(/not removed or overwritten/i),
        );
        expect(document.getElementById('git-status').textContent).toBe('Save to history');
        expect(document.getElementById('git-status').disabled).toBe(false);
    });
});
