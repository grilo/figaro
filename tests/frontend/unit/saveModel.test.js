import {
    createSaveSnapshot,
    isLatestSave,
    savedLatestEdit,
    saveStatusMessage,
} from '../frontend/js/core/saveModel.js';

describe('save model', () => {
    test('captures immutable save and edit generations', () => {
        const tab = { path: 'note.md', _saveGeneration: 2, _editGeneration: 4 };
        const snapshot = createSaveSnapshot(tab, 'body');

        expect(snapshot).toMatchObject({
            path: 'note.md',
            content: 'body',
            generation: 3,
            editGeneration: 4,
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
});
