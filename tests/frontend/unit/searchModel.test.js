import {
    compactSearchResultLocation,
    nextSearchSelection,
    normalizeSearchResult,
    searchHighlightRanges,
    searchResultWindow,
    searchResultLocation,
    updateSearchFilter,
} from '../frontend/js/core/searchModel.js';

describe('search model', () => {
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

    test('keeps a bounded result window around scrolling and keyboard anchors', () => {
        expect(searchResultWindow(10_000, { anchorIndex: 0, windowSize: 96 }))
            .toEqual({ start: 0, end: 96 });
        expect(searchResultWindow(10_000, { selectedIndex: 5_000, windowSize: 96 }))
            .toEqual({ start: 4_952, end: 5_048 });
        expect(searchResultWindow(10_000, { anchorIndex: 9_999, windowSize: 96 }))
            .toEqual({ start: 9_904, end: 10_000 });
        expect(searchResultWindow(0)).toEqual({ start: 0, end: 0 });
    });

    test('derives a distinguishing parent location for search results', () => {
        expect(searchResultLocation('Clients/Acme/Meeting.md')).toBe('Clients/Acme');
        expect(searchResultLocation('Meeting.md')).toBe('Vault root');
        expect(searchResultLocation('Clients\\Beacon\\Meeting.md')).toBe('Clients/Beacon');
    });

    test('preserves the distinguishing tail of very deep search-result paths', () => {
        expect(compactSearchResultLocation(
            'Clients/International/Western-Europe/Enterprise/Acme/2026/Planning/Meeting.md'
        )).toBe('Clients/…/Acme/2026/Planning');
        expect(compactSearchResultLocation('Clients/Acme/Meeting.md')).toBe('Clients/Acme');
        expect(compactSearchResultLocation('Meeting.md')).toBe('Vault root');
    });

    test('maps accent-insensitive and corrected terms back to source highlight offsets', () => {
        expect(searchHighlightRanges('Café deployment plan', 'cafe plan'))
            .toEqual([{ from: 0, to: 4 }, { from: 16, to: 20 }]);
        expect(searchHighlightRanges('Deployment guide', 'deploymnet', ['deployment']))
            .toEqual([{ from: 0, to: 10 }]);
        expect(searchHighlightRanges('release Release', 'Release', ['release'], true))
            .toEqual([{ from: 8, to: 15 }]);
    });

    test('normalizes native relevance metadata without changing result order', () => {
        expect(normalizeSearchResult({
            path: 'Café.md',
            score: 7.25,
            title_match: true,
            matched_terms: ['cafe'],
            match_count: 3,
        })).toEqual(expect.objectContaining({
            path: 'Café.md',
            score: 7.25,
            titleMatch: true,
            matchedTerms: ['cafe'],
            matchCount: 3,
        }));
    });
});
