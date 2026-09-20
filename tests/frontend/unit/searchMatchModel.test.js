import { activeSearchMatchIndex, searchMatchAnnouncement } from '../../../frontend/js/core/searchMatchModel.js';

describe('in-note Find result announcements', () => {
    test.each([
        [{}, ''],
        [{ query: '[', valid: false }, 'Invalid search pattern'],
        [{ query: 'missing', total: 0 }, 'No matches'],
        [{ query: 'one', total: 1 }, '1 match'],
        [{ query: 'one', total: 1, activeIndex: 0 }, '1 of 1 match'],
        [{ query: 'many', total: 3, activeIndex: 1 }, '2 of 3 matches'],
    ])('formats %j as %s', (input, expected) => {
        expect(searchMatchAnnouncement(input)).toBe(expected);
    });
});

test('locates the exact selected result with logarithmic range reads', () => {
    for (const count of [10, 1000, 10000]) {
        let reads = 0;
        const matches = Array.from({ length: count }, (_, index) => ({
            get from() { reads++; return index * 10; }, to: index * 10 + 4,
        }));
        expect(activeSearchMatchIndex(matches, { from: (count - 1) * 10, to: (count - 1) * 10 + 4 })).toBe(count - 1);
        expect(reads).toBeLessThanOrEqual(Math.ceil(Math.log2(count)) + 2);
        expect(activeSearchMatchIndex(matches, { from: 1, to: 2 })).toBe(-1);
        expect(activeSearchMatchIndex(matches, { from: 0, to: 0 })).toBe(-1);
    }
    expect(activeSearchMatchIndex([], { from: 0, to: 0 })).toBe(-1);
});
