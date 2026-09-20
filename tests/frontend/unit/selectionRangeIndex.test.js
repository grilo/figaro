import { createSelectionRangeIndex, selectedRangeIndices } from '../../../frontend/js/core/selectionRangeIndex.js';

test('indexed overlap matches inclusive linear selection semantics for nested, unordered and duplicate ranges', () => {
    const ranges = Array.from({ length: 200 }, (_, i) => ({ from: i * 37 % 300, to: i * 37 % 300 + i % 51 }));
    ranges.push({ from: 0, to: 400 }, { from: 12, to: 12 }, { from: 12, to: 12 });
    const index = createSelectionRangeIndex(ranges);
    for (let i = 0; i < 400; i += 3) {
        const selections = [{ from: i, to: i + i % 19 }, { from: 12, to: 12 }];
        const expected = ranges.flatMap((range, n) => selections.some(s => s.from <= range.to && s.to >= range.from) ? [n] : []);
        expect([...selectedRangeIndices(index, selections).indices].sort((a, b) => a - b)).toEqual(expected);
    }
    expect(selectedRangeIndices(null, [{ from: 0, to: 0 }])).toEqual({ indices: new Set(), visited: 0 });
});

test.each([10, 1000, 10000])('a local cursor query visits a logarithmic path among %i source ranges', count => {
    const ranges = Array.from({ length: count }, (_, i) => ({ from: i * 10, to: i * 10 + 5 }));
    const index = createSelectionRangeIndex(ranges);
    const n = Math.floor(count / 2), position = n * 10;
    const query = selectedRangeIndices(index, [{ from: position, to: position }]);
    expect([...query.indices]).toEqual([n]);
    expect(query.visited).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(count)) + 1);
    expect(selectedRangeIndices(index, [{ from: position + 6, to: position + 7 }]).indices.size).toBe(0);
});
