import {
    isVerticalTableMergeMarker,
    planVerticalTableMerges,
} from '../frontend/js/core/printableTableModel.js';

describe('printable Markdown table merge planning', () => {
    test('plans consecutive data-row carets as one vertical rowspan', () => {
        const rows = [
            ['Group', 'Item'],
            ['Alpha', 'One'],
            ['^', 'Two'],
            ['^', 'Three'],
            ['Beta', 'Four'],
        ];
        const sourceRows = rows.map(row => [...row]);
        const result = planVerticalTableMerges(rows);

        expect(result.merges).toEqual([{ row: 1, col: 0, rowSpan: 3 }]);
        expect(result.covered).toEqual([
            { row: 2, col: 0, anchorRow: 1, anchorCol: 0 },
            { row: 3, col: 0, anchorRow: 1, anchorCol: 0 },
        ]);
        expect(rows).toEqual(sourceRows);
    });

    test('leaves a caret without a preceding data cell non-destructive', () => {
        const result = planVerticalTableMerges([
            ['Group', 'Item'],
            ['^', 'One'],
            ['^', 'Two'],
            ['Alpha', 'Two'],
        ]);

        expect(result.merges).toEqual([]);
        expect(result.covered).toEqual([]);
    });

    test('does not treat formatted caret content or header carets as merge markers', () => {
        expect(isVerticalTableMergeMarker(' ^ ')).toBe(true);
        expect(isVerticalTableMergeMarker('caret')).toBe(false);
        expect(planVerticalTableMerges([
            ['^'],
            ['^'],
        ])).toEqual({ merges: [], covered: [] });
    });
});
