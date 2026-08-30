import {
    createSaveSnapshot,
    isLatestSave,
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
            path: 'note.md',
            content: 'body',
            generation: 3,
            editGeneration: 4,
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

    test('distinguishes an optimistic conflict from every other failed result', () => {
        expect(saveResultDisposition({ success: true })).toBe('saved');
        expect(saveResultDisposition({ success: false, error: 'File modified externally' })).toBe('conflict');
        expect(saveResultDisposition({ success: false, error: 'External file is read-only' })).toBe('failure');
        expect(saveResultDisposition(null)).toBe('failure');
    });
});
