import { searchMatchAnnouncement } from '../../../frontend/js/core/searchMatchModel.js';

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
