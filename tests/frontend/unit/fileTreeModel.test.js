import {
    normalizeFileTreeStyles,
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
});
