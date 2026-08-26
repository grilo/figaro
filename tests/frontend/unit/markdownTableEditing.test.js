import {
    markdownTableCellCursorOffset,
    parseMarkdownTable,
    parseMarkdownTableRow,
} from '../frontend/js/core/markdownTableEditing.js';

const source = [
    '| Name | Count |',
    '| :--- | ---: |',
    '| Alpha | 2 |',
    '| Beta | 10 |',
].join('\n');

describe('source-safe Markdown table editing', () => {
    test('parses exact row whitespace and escaped pipes without normalizing source', () => {
        const row = parseMarkdownTableRow('  | Alpha \\| A | 2 |  ');
        expect(row.prefix).toBe('  |');
        expect(row.suffix).toBe('|  ');
        expect(row.cells.map(cell => cell.raw)).toEqual([' Alpha \\| A ', ' 2 ']);
        expect(parseMarkdownTable(source)).toMatchObject({ valid: true, columns: 2 });
    });

    test('maps rendered cells to the first authored content without normalizing source', () => {
        expect(markdownTableCellCursorOffset(source, 0, 1)).toBe(source.indexOf('Count'));
        expect(markdownTableCellCursorOffset(source, 2, 0)).toBe(source.indexOf('Alpha'));

        const escaped = source.replace('Alpha', '**Alpha \\| A**');
        expect(markdownTableCellCursorOffset(escaped, 2, 0)).toBe(escaped.indexOf('**Alpha'));
        expect(markdownTableCellCursorOffset(source, 20, 0)).toBeNull();
        expect(markdownTableCellCursorOffset('| A |\nnot a table', 0, 0)).toBeNull();
    });

    test('rejects non-rectangular and separator-less source', () => {
        expect(parseMarkdownTable('| A | B |\n| --- |\n| 1 | 2 |').valid).toBe(false);
        expect(parseMarkdownTable('| A |\nnot a separator').valid).toBe(false);
    });
});
