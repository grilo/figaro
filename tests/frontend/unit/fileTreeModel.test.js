import {
    directoryPathsForReveal,
    fileTreeKeyboardPlan,
    isFileTreeEntryPinned,
    normalizeFileTreeStyles,
    sortFileTreeItems,
    toggleExpandedDirectory,
    toggleSelectedPath,
    visibleFileTreeRows,
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

    test('flattens only visible rows with stable parent and depth metadata', () => {
        const tree = [{
            path: 'Projects', type: 'directory', children: [
                { path: 'Projects/plan.md', type: 'file' },
                { path: 'Projects/Design', type: 'directory', children: [
                    { path: 'Projects/Design/spec.md', type: 'file' },
                ] },
            ],
        }, { path: 'Archive.md', type: 'file' }];

        expect(visibleFileTreeRows(tree, new Set(['Projects']))).toEqual([
            expect.objectContaining({ path: 'Projects', depth: 1, parentPath: null, expanded: true }),
            expect.objectContaining({ path: 'Projects/plan.md', depth: 2, parentPath: 'Projects' }),
            expect.objectContaining({ path: 'Projects/Design', depth: 2, parentPath: 'Projects', expanded: false }),
            expect.objectContaining({ path: 'Archive.md', depth: 1, parentPath: null }),
        ]);
    });

    test('plans standard roving tree focus, expansion, collapse, and activation', () => {
        const rows = visibleFileTreeRows([{
            path: 'Projects', type: 'directory', children: [
                { path: 'Projects/plan.md', type: 'file' },
                { path: 'Projects/spec.md', type: 'file' },
            ],
        }, { path: 'Archive.md', type: 'file' }], new Set(['Projects']));

        expect(fileTreeKeyboardPlan('ArrowDown', rows, 'Projects')).toEqual({ action: 'focus', path: 'Projects/plan.md' });
        expect(fileTreeKeyboardPlan('ArrowUp', rows, 'Projects/spec.md')).toEqual({ action: 'focus', path: 'Projects/plan.md' });
        expect(fileTreeKeyboardPlan('Home', rows, 'Archive.md')).toEqual({ action: 'focus', path: 'Projects' });
        expect(fileTreeKeyboardPlan('End', rows, 'Projects')).toEqual({ action: 'focus', path: 'Archive.md' });
        expect(fileTreeKeyboardPlan('ArrowRight', rows, 'Projects')).toEqual({ action: 'focus', path: 'Projects/plan.md' });
        expect(fileTreeKeyboardPlan('ArrowLeft', rows, 'Projects/plan.md')).toEqual({ action: 'focus', path: 'Projects' });
        expect(fileTreeKeyboardPlan('ArrowLeft', rows, 'Projects')).toEqual({ action: 'collapse', path: 'Projects' });
        expect(fileTreeKeyboardPlan('Enter', rows, 'Projects/plan.md')).toEqual({ action: 'activate', path: 'Projects/plan.md' });

        const collapsed = visibleFileTreeRows([{
            path: 'Projects', type: 'directory', children: [{ path: 'Projects/plan.md', type: 'file' }],
        }], new Set());
        expect(fileTreeKeyboardPlan('ArrowRight', collapsed, 'Projects')).toEqual({ action: 'expand', path: 'Projects' });
        expect(fileTreeKeyboardPlan('ArrowLeft', collapsed, 'Projects')).toEqual({ action: 'none' });
        expect(fileTreeKeyboardPlan('Tab', collapsed, 'Projects')).toBeNull();
    });
});
