import {
    directoryPathsForReveal,
    isFileTreeEntryPinned,
    normalizeFileTreeStyles,
    sortFileTreeItems,
    toggleExpandedDirectory,
    toggleSelectedPath,
} from '../frontend/js/core/fileTreeModel.js';

describe('file tree model', () => {
    test('normalizes appearance data without retaining unbounded recent icons', () => {
        const styles = normalizeFileTreeStyles({
            version: '2',
            entries: { Notes: { icon: 'folder' } },
            recent_icons: Array.from({ length: 12 }, (_, index) => String(index)),
        });
        expect(styles).toEqual({
            version: 2,
            entries: { Notes: { icon: 'folder' } },
            recent_icons: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        });
    });

    test('returns new directory and multi-selection collections', () => {
        const expanded = new Set(['Notes']);
        expect([...toggleExpandedDirectory(expanded, 'Notes')]).toEqual([]);
        expect([...expanded]).toEqual(['Notes']);
        expect(toggleSelectedPath(['a.md'], 'b.md')).toEqual(['a.md', 'b.md']);
        expect(toggleSelectedPath(['a.md', 'b.md'], 'a.md')).toEqual(['b.md']);
    });

    test('plans every ancestor needed to reveal a nested folder', () => {
        expect(directoryPathsForReveal('Projects/Active/Design')).toEqual([
            'Projects',
            'Projects/Active',
            'Projects/Active/Design',
        ]);
        expect(directoryPathsForReveal('')).toEqual([]);
    });

    test('pins Inbox by default while preserving an explicit unpin', () => {
        const inbox = { path: 'Inbox', type: 'directory' };
        expect(isFileTreeEntryPinned(inbox, {})).toBe(true);
        expect(isFileTreeEntryPinned(inbox, { Inbox: { pinned: false } })).toBe(false);
        expect(isFileTreeEntryPinned({ path: 'Notes', type: 'directory' }, {})).toBe(false);
    });

    test('stably puts pinned siblings first without reordering either group', () => {
        const items = [
            { path: 'Archive', type: 'directory' },
            { path: 'Inbox', type: 'directory' },
            { path: 'draft.md', type: 'file' },
            { path: 'reference.md', type: 'file' },
        ];
        expect(sortFileTreeItems(items, {
            'draft.md': { pinned: true },
            Inbox: { pinned: false },
        }).map(item => item.path)).toEqual([
            'draft.md',
            'Archive',
            'Inbox',
            'reference.md',
        ]);
        expect(items.map(item => item.path)).toEqual(['Archive', 'Inbox', 'draft.md', 'reference.md']);
    });
});
