import { reviewMissingLinkedNote, reviewSameDirectoryNoteName } from '../frontend/js/usecases/similarNoteReview.js';

describe('similar note-name review', () => {
    const tree = [{ name: 'InnerSource.md', path: 'notes/InnerSource.md', type: 'file' }];

    test('makes opening the existing note the primary safe action', async () => {
        const confirm = jest.fn().mockResolvedValue('confirm');
        const open = jest.fn().mockResolvedValue(undefined);

        await expect(reviewSameDirectoryNoteName({
            tree,
            parentDirectory: 'notes',
            proposedName: 'Inner Source.md',
            operation: 'create',
            confirm,
            open,
        })).resolves.toBe('opened');

        expect(confirm).toHaveBeenCalledWith(
            'Similar note name',
            expect.stringContaining('spacing, punctuation, or capitalization'),
            false,
            false,
            expect.objectContaining({ confirmLabel: 'Open existing', extraLabel: 'Create anyway' })
        );
        expect(open).toHaveBeenCalledWith('notes/InnerSource.md');
    });

    test('allows an explicit variant rename but cancellation performs no effect', async () => {
        const open = jest.fn();
        await expect(reviewSameDirectoryNoteName({
            tree,
            parentDirectory: 'notes',
            proposedName: 'Inner-Source.md',
            currentPath: 'notes/draft.md',
            operation: 'rename',
            confirm: jest.fn().mockResolvedValue('extra'),
            open,
        })).resolves.toBe('proceed');
        expect(open).not.toHaveBeenCalled();

        await expect(reviewSameDirectoryNoteName({
            tree,
            parentDirectory: 'notes',
            proposedName: 'Inner Source.md',
            confirm: jest.fn().mockResolvedValue(false),
            open,
        })).resolves.toBe('cancelled');
        expect(open).not.toHaveBeenCalled();
    });

    test('does not offer an overwrite path for an exact same-folder name', async () => {
        const confirm = jest.fn().mockResolvedValue(false);
        await reviewSameDirectoryNoteName({
            tree,
            parentDirectory: 'notes',
            proposedName: 'innersource.md',
            confirm,
            open: jest.fn(),
        });

        expect(confirm.mock.calls[0][4]).toEqual(expect.objectContaining({ confirmLabel: 'Open existing' }));
        expect(confirm.mock.calls[0][4]).not.toHaveProperty('extraLabel');
    });
});

describe('missing linked-note review', () => {
    const tree = [{ name: 'InnerSource.md', path: 'notes/InnerSource.md', type: 'file' }];

    test('rewrites the destination and opens a verified existing note', async () => {
        const effects = [];
        const existing = { path: 'notes/InnerSource.md', mtime: 12 };
        const confirm = jest.fn().mockResolvedValue('confirm');

        await expect(reviewMissingLinkedNote({
            tree,
            targetPath: 'notes/Inner Source.md',
            confirm,
            read: jest.fn(async path => { effects.push(`read:${path}`); return existing; }),
            replaceTarget: jest.fn(async path => { effects.push(`replace:${path}`); return true; }),
            open: jest.fn(async (path, file) => { effects.push(`open:${path}:${file.mtime}`); }),
        })).resolves.toBe('used-existing');

        expect(confirm).toHaveBeenCalledWith(
            'Similar linked note',
            expect.stringContaining('spacing, punctuation, or capitalization'),
            false,
            false,
            expect.objectContaining({ confirmLabel: 'Use existing note', extraLabel: 'Create anyway' })
        );
        expect(effects).toEqual([
            'read:notes/InnerSource.md',
            'replace:notes/InnerSource.md',
            'open:notes/InnerSource.md:12',
        ]);
    });

    test('creates only after the explicit alternative and cancellation has no effects', async () => {
        const read = jest.fn();
        const replaceTarget = jest.fn();
        const open = jest.fn();
        await expect(reviewMissingLinkedNote({
            tree,
            targetPath: 'notes/Inner-Source.md',
            confirm: jest.fn().mockResolvedValue('extra'),
            read,
            replaceTarget,
            open,
        })).resolves.toBe('create');
        await expect(reviewMissingLinkedNote({
            tree,
            targetPath: 'notes/Inner Source.md',
            confirm: jest.fn().mockResolvedValue(false),
            read,
            replaceTarget,
            open,
        })).resolves.toBe('cancelled');
        expect(read).not.toHaveBeenCalled();
        expect(replaceTarget).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
    });

    test('does not rewrite when the note disappeared or the clicked range became stale', async () => {
        const open = jest.fn();
        await expect(reviewMissingLinkedNote({
            tree,
            targetPath: 'notes/Inner Source.md',
            confirm: jest.fn().mockResolvedValue('confirm'),
            read: jest.fn().mockResolvedValue(null),
            replaceTarget: jest.fn(),
            open,
        })).resolves.toBe('unavailable');

        await expect(reviewMissingLinkedNote({
            tree,
            targetPath: 'notes/Inner Source.md',
            confirm: jest.fn().mockResolvedValue('confirm'),
            read: jest.fn().mockResolvedValue({ path: 'notes/InnerSource.md' }),
            replaceTarget: jest.fn().mockResolvedValue(false),
            open,
        })).resolves.toBe('stale');
        expect(open).not.toHaveBeenCalled();
    });

    test('leaves an unrelated or cross-folder missing link on the normal creation path', async () => {
        await expect(reviewMissingLinkedNote({
            tree,
            targetPath: 'archive/Inner Source.md',
            confirm: jest.fn(),
            read: jest.fn(),
            replaceTarget: jest.fn(),
            open: jest.fn(),
        })).resolves.toBe('no-match');
    });
});
