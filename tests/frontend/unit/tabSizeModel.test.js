import {
    defaultTabSize,
    expandedTabText,
    maximumTabSize,
    minimumTabSize,
    normalizeTabSize,
    steppedTabSize,
    tabSizeIndentUnit,
} from '../frontend/js/core/tabSizeModel.js';

describe('tab-size policy', () => {
    test('defaults to four whole spaces and clamps the supported 2–8 range', () => {
        expect(defaultTabSize).toBe(4);
        expect(minimumTabSize).toBe(2);
        expect(maximumTabSize).toBe(8);
        expect(normalizeTabSize(undefined)).toBe(4);
        expect(normalizeTabSize('6')).toBe(6);
        expect(normalizeTabSize(1)).toBe(2);
        expect(normalizeTabSize(9)).toBe(8);
        expect(normalizeTabSize(3.6)).toBe(4);
        expect(normalizeTabSize('', 7)).toBe(7);
    });

    test('steps at the boundaries and produces the matching spaces-only indent unit', () => {
        expect(steppedTabSize(4, -1)).toBe(3);
        expect(steppedTabSize(4, 1)).toBe(5);
        expect(steppedTabSize(2, -1)).toBe(2);
        expect(steppedTabSize(8, 1)).toBe(8);
        expect(tabSizeIndentUnit(6)).toBe('      ');
    });

    test('expands literal tabs at the configured column stops', () => {
        expect(expandedTabText('\tA', 4)).toEqual({ text: '    A', columns: 5 });
        expect(expandedTabText('ab\tA', 4)).toEqual({ text: 'ab  A', columns: 5 });
        expect(expandedTabText('ab\tA', 8)).toEqual({ text: 'ab      A', columns: 9 });
    });
});
