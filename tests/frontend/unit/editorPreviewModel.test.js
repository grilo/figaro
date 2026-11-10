import { editorPreviewClosePlan } from '../../../frontend/js/core/editorPreviewModel.js';

describe('revision preview close plan', () => {
    test('returns the displaced text with its selection and undo history', () => {
        expect(editorPreviewClosePlan({
            ownsEditor: true, showsPreview: true, liveContent: 'unsaved live text',
        })).toEqual({ replaceWith: 'unsaved live text', restoreSelection: true, history: 'restore' });
    });

    test('mounts a restored revision as new text with a fresh history', () => {
        expect(editorPreviewClosePlan({
            ownsEditor: true, showsPreview: true, liveContent: 'live', restoredContent: 'old revision',
        })).toEqual({ replaceWith: 'old revision', restoreSelection: false, history: 'fresh' });
        // Restoring text identical to the live buffer is the ordinary close.
        expect(editorPreviewClosePlan({
            ownsEditor: true, showsPreview: true, liveContent: 'same', restoredContent: 'same',
        }).history).toBe('restore');
    });

    test('never overwrites newer text mounted for the same tab during the preview', () => {
        expect(editorPreviewClosePlan({
            ownsEditor: true, showsPreview: false, liveContent: 'live',
        })).toEqual({ replaceWith: null, restoreSelection: false, history: 'fresh' });
    });

    test('leaves another tab\'s document and undo history untouched', () => {
        expect(editorPreviewClosePlan({
            ownsEditor: false, showsPreview: false, liveContent: 'live', restoredContent: 'old revision',
        })).toEqual({ replaceWith: null, restoreSelection: false, history: 'keep' });
        // A stale preview document can never be attributed to the new owner.
        expect(editorPreviewClosePlan({
            ownsEditor: false, showsPreview: true, liveContent: 'live',
        }).replaceWith).toBeNull();
    });
});
