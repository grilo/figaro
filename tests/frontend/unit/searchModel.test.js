import {
    findTitleMatches,
    mergeSearchResults,
    nextSearchSelection,
    updateSearchFilter,
} from '../frontend/js/core/searchModel.js';

describe('search model', () => {
    test('merges title and compact content matches with title-first ordering', () => {
        const titles = findTitleMatches([
            {
                type: 'directory',
                path: 'Projects',
                children: [
                    { type: 'file', path: 'Projects/Alpha.md', name: 'Alpha.md', mtime: 2 },
                    { type: 'file', path: 'Projects/Alpha.txt', name: 'Alpha.txt', mtime: 3 },
                ],
            },
        ], 'alpha', false);
        const results = mergeSearchResults([
            {
                path: 'Journal.md',
                name: 'Journal.md',
                match_count: 9,
                matches: [{ line: 2, text: 'Alpha plan' }],
                mtime: 20,
            },
        ], titles, [], false);

        expect(results.map(result => result.path)).toEqual([
            'Projects/Alpha.md',
            'Journal.md',
        ]);
        expect(results[1].matchCount).toBe(9);
    });

    test('filters recent results in recent-file order', () => {
        const results = mergeSearchResults([
            { path: 'A.md', matches: [], mtime: 2 },
            { path: 'B.md', matches: [], mtime: 1 },
        ], [], [{ path: 'B.md' }, { path: 'A.md' }], true);
        expect(results.map(result => result.path)).toEqual(['B.md', 'A.md']);
    });

    test('updates supported filters and wraps keyboard selection', () => {
        expect(updateSearchFilter({}, 'titleOnly', true).titleOnly).toBe(true);
        expect(updateSearchFilter({}, 'unknown', true)).toEqual({
            titleOnly: false,
            recentOnly: false,
            caseSensitive: false,
        });
        expect(nextSearchSelection(-1, 2, -1)).toBe(1);
        expect(nextSearchSelection(1, 2, 1)).toBe(0);
    });
});
