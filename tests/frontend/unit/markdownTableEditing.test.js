import {
    escapeMarkdownTablePipes,
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
    test('escapes every unescaped pipe in a cell, including each pipe of a run', () => {
        expect(escapeMarkdownTablePipes('a | b')).toBe('a \\| b');
        expect(escapeMarkdownTablePipes('a || b')).toBe('a \\|\\| b');
        expect(escapeMarkdownTablePipes('|x|')).toBe('\\|x\\|');
        // An already escaped pipe stays as written; an escaped backslash does not escape the pipe.
        expect(escapeMarkdownTablePipes('a \\| b')).toBe('a \\| b');
        expect(escapeMarkdownTablePipes('a \\\\| b')).toBe('a \\\\\\| b');
        expect(escapeMarkdownTablePipes('plain')).toBe('plain');
        // The escaped cell always parses back as one cell.
        for (const cell of ['a || b', '|x|', 'a \\\\| b']) {
            expect(parseMarkdownTableRow(`| ${escapeMarkdownTablePipes(cell)} | 2 |`).cells).toHaveLength(2);
        }
    });

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
