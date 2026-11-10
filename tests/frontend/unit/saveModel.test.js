import {
    createSaveSnapshot,
    isDiskFullError,
    isLatestSave,
    saveContentSource,
    savedLatestEdit,
    saveFailureStatusMessage,
    saveResultDisposition,
    saveStatusMessage,
} from '../frontend/js/core/saveModel.js';

describe('save model', () => {
    test('captures immutable save and edit generations', () => {
        const tab = { path: 'note.md', _saveGeneration: 2, _editGeneration: 4 };
        const snapshot = createSaveSnapshot(tab, 'body', { failurePrompt: 'always' });

        expect(snapshot).toMatchObject({
            tabId: 'note.md',
            path: 'note.md',
            content: 'body',
            generation: 3,
            editGeneration: 4,
            expectedMtime: 0,
            failurePrompt: 'always',
        });
        tab._saveGeneration = 3;
        expect(isLatestSave(tab, snapshot)).toBe(true);
        expect(savedLatestEdit(tab, snapshot)).toBe(true);
        tab._editGeneration = 5;
        expect(savedLatestEdit(tab, snapshot)).toBe(false);
    });

    test('selects the user-visible result for stale and history-failed saves', () => {
        expect(saveStatusMessage({ latestEdit: true, successMessage: 'Saved (forced)' }))
            .toBe('Saved (forced)');
        expect(saveStatusMessage({ latestEdit: false }))
            .toBe('Saved older snapshot; newer changes remain');
        expect(saveStatusMessage({ historyCommitFailed: true }))
            .toBe('Saved; history commit failed');
    });

    test('includes the concrete failure cause in save status text', () => {
        expect(saveFailureStatusMessage(new Error('permission denied')))
            .toBe('Save failed — permission denied');
        expect(saveFailureStatusMessage({ error: 'disk is full' }))
            .toBe('Save failed — disk is full');
        expect(saveFailureStatusMessage(null))
            .toBe('Save failed — unknown error');
    });

    test('recognizes platform disk-capacity failures without misclassifying other save errors', () => {
        expect(isDiskFullError(new Error('write failed: ENOSPC'))).toBe(true);
        expect(isDiskFullError({ error: 'No space left on device' })).toBe(true);
        expect(isDiskFullError('The disk is full')).toBe(true);
        expect(isDiskFullError('permission denied')).toBe(false);
    });

    test('distinguishes an optimistic conflict from every other failed result', () => {
        expect(saveResultDisposition({ success: true })).toBe('saved');
        expect(saveResultDisposition({ success: false, error: 'File modified externally' })).toBe('conflict');
        expect(saveResultDisposition({ success: false, error: 'External file is read-only' })).toBe('failure');
        expect(saveResultDisposition(null)).toBe('failure');
    });

    test('keeps the edit generation an asynchronous export captured before it began', () => {
        const tab = { path: 'board.excalidraw.svg', _editGeneration: 6 };
        const snapshot = createSaveSnapshot(tab, '<svg/>', { editGeneration: 4 });
        expect(snapshot.editGeneration).toBe(4);
        expect(savedLatestEdit(tab, snapshot)).toBe(false);
    });
    test('answers a save only from an authoritative buffer, never with an empty file', () => {
        // The shared editor speaks for the tab that owns it, cached or not.
        expect(saveContentSource({ ownerId: 'a.md', tabId: 'a.md', activeTabId: 'a.md', hasCachedContent: true })).toBe('editor');
        expect(saveContentSource({ ownerId: 'a.md', tabId: 'a.md', activeTabId: 'b.md' })).toBe('editor');
        // Any other tab is answered from its own cached buffer…
        expect(saveContentSource({ ownerId: 'b.md', tabId: 'a.md', activeTabId: 'a.md', hasCachedContent: true })).toBe('cache');
        // …and has nothing to write without one: the editor shows another note
        // (a load still in flight, or an owner left behind by a rename).
        expect(saveContentSource({ ownerId: 'b.md', tabId: 'a.md', activeTabId: 'a.md' })).toBe('none');
        expect(saveContentSource({ ownerId: 'old/a.md', tabId: 'new/a.md', activeTabId: 'new/a.md' })).toBe('none');
        // Before the first mount the editor belongs to the active tab alone.
        expect(saveContentSource({ ownerId: null, tabId: 'a.md', activeTabId: 'a.md' })).toBe('editor');
        expect(saveContentSource({ ownerId: null, tabId: 'a.md', activeTabId: 'a.md', hasCachedContent: true })).toBe('cache');
        expect(saveContentSource({ ownerId: null, tabId: 'a.md', activeTabId: 'b.md' })).toBe('none');
        expect(saveContentSource({ ownerId: null, tabId: undefined, activeTabId: null })).toBe('none');
    });
});
