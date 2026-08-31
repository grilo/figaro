import {
    renameReferenceChoice,
    renameReferenceReviewPlan,
} from '../../../frontend/js/core/pathRenameReferenceModel.js';

describe('referenced-file rename review', () => {
    test('asks once for unique Markdown sources and names all three outcomes', () => {
        expect(renameReferenceReviewPlan([], { oldName: 'old.md', newName: 'new.md' })).toBeNull();
        expect(renameReferenceReviewPlan([
            'notes/b.md', 'notes/a.md', 'notes/b.md',
        ], { oldName: 'old.md', newName: 'new.md' })).toEqual({
            references: ['notes/a.md', 'notes/b.md'],
            title: 'Update Markdown references?',
            message: '2 Markdown notes reference “old.md”. Update all of them to “new.md”? Keeping the old references may leave broken links or images.',
            options: {
                confirmLabel: 'Update references',
                extraLabel: 'Keep references unchanged',
                cancelLabel: 'Cancel rename',
                dismissOnBackdrop: false,
            },
        });
    });

    test('distinguishes update, keep, and cancellation decisions', () => {
        expect(renameReferenceChoice('confirm')).toEqual({ proceed: true, updateLinks: true });
        expect(renameReferenceChoice('extra')).toEqual({ proceed: true, updateLinks: false });
        expect(renameReferenceChoice(false)).toEqual({ proceed: false, updateLinks: false });
    });
});
