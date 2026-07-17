jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() },
}));

import {
    analyzeTabularText,
    markdownTableFromClipboard,
    markdownTableFromRows,
    markdownTableInsertion,
    parseHTMLTable,
    parseTabularText,
} from '../frontend/js/markdownTableConversion.js';
import {
    clipboardTablePayload,
    handleClipboardTablePaste,
} from '../frontend/js/clipboardTable.js';

function testView(text = 'Before selected after') {
    return {
        state: {
            doc: { toString: () => text },
            selection: { main: { from: 7, to: 15 } },
        },
        dispatch: jest.fn(),
    };
}

describe('Markdown table conversion', () => {
    test('detects TSV and serializes a header plus escaped portable Markdown cells', () => {
        const analysis = analyzeTabularText('Name\tNote\r\nAlpha\t"C:\\Temp | ready"');

        expect(analysis).toMatchObject({
            ok: true,
            delimiter: 'tab',
            rows: [['Name', 'Note'], ['Alpha', 'C:\\Temp | ready']],
            columns: 2,
        });
        expect(markdownTableFromRows(analysis.rows)).toBe([
            '| Name | Note |',
            '| --- | --- |',
            '| Alpha | C:\\\\Temp \\| ready |',
        ].join('\n'));
    });

    test('parses quoted CSV cells, escaped quotes, and line breaks', () => {
        const analysis = parseTabularText([
            'Name,Description',
            'Alpha,"First, second"',
            'Beta,"Line one',
            'Line two with ""quotes"""',
        ].join('\n'), 'comma');

        expect(analysis.ok).toBe(true);
        expect(analysis.rows[1]).toEqual(['Alpha', 'First, second']);
        expect(analysis.rows[2]).toEqual(['Beta', 'Line one\nLine two with "quotes"']);
        expect(markdownTableFromRows(analysis.rows)).toContain('Line one<br>Line two with "quotes"');
    });

    test('converts simple boundary-pipe text but preserves an existing GFM separator', () => {
        const simple = analyzeTabularText('| Name | Note |\n| Alpha | one \\| two |');
        expect(simple).toMatchObject({
            ok: true,
            delimiter: 'pipe',
            alreadyMarkdown: false,
            rows: [['Name', 'Note'], ['Alpha', 'one | two']],
        });

        const markdown = analyzeTabularText('| Name | Count |\n| :--- | ---: |\n| Alpha | 2 |');
        expect(markdown).toMatchObject({ ok: true, delimiter: 'pipe', alreadyMarkdown: true });
        expect(markdownTableFromClipboard({
            text: '| Name | Count |\n| :--- | ---: |\n| Alpha | 2 |',
        })).toMatchObject({
            alreadyMarkdown: true,
            markdown: '| Name | Count |\n| :--- | ---: |\n| Alpha | 2 |',
        });
    });

    test('can retain every input row by generating neutral headers', () => {
        expect(markdownTableFromRows([
            ['Alpha', '2'],
            ['Beta', '3'],
        ], { firstRowIsHeader: false })).toBe([
            '| Column 1 | Column 2 |',
            '| --- | --- |',
            '| Alpha | 2 |',
            '| Beta | 3 |',
        ].join('\n'));
    });

    test('adds blank block boundaries without changing surrounding text', () => {
        const insertion = markdownTableInsertion(
            'Before\nselected\nAfter',
            { from: 'Before\n'.length, to: 'Before\nselected'.length },
            '| A | B |\n| --- | --- |\n| 1 | 2 |'
        );

        expect(insertion.insert).toBe('\n| A | B |\n| --- | --- |\n| 1 | 2 |\n');
        expect(insertion.cursorOffset).toBe(1 + '| A | B |\n| --- | --- |\n| 1 | 2 |'.length);
    });

    test('rejects prose, single rows, inconsistent columns, and malformed quotes', () => {
        expect(analyzeTabularText('Ordinary prose, with punctuation.').ok).toBe(false);
        expect(parseTabularText('A\tB', 'tab').ok).toBe(false);
        expect(parseTabularText('A\tB\n1\t2\t3', 'tab')).toMatchObject({
            ok: false,
            error: expect.stringContaining('same number'),
        });
        expect(parseTabularText('A,B\n1,"unfinished', 'comma')).toMatchObject({
            ok: false,
            error: expect.stringContaining('closing quote'),
        });
    });

    test('extracts spreadsheet HTML, honors header cells, and refuses row spans', () => {
        const parsed = parseHTMLTable('<table><thead><tr><th>Name</th><th>Note</th></tr></thead><tbody><tr><td>Alpha</td><td>One<br>Two</td></tr></tbody></table>');
        expect(parsed).toMatchObject({
            ok: true,
            delimiter: 'html',
            firstRowIsHeader: true,
            rows: [['Name', 'Note'], ['Alpha', 'One\nTwo']],
        });
        expect(markdownTableFromClipboard({ html: '<table><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>' }).markdown)
            .toContain('| A | 1 |');
        expect(parseHTMLTable('<table><tr><td rowspan="2">A</td><td>1</td></tr><tr><td>2</td></tr></table>').ok)
            .toBe(false);
    });

    test('auto-pastes clear CSV while leaving ambiguous two-line comma prose alone', () => {
        expect(markdownTableFromClipboard({
            text: 'Name,Count\nAlpha,2',
            mimeType: 'text/plain',
        })).toBeNull();
        expect(markdownTableFromClipboard({
            text: 'Name,Count\nAlpha,2',
            mimeType: 'text/csv',
        })).toMatchObject({ delimiter: 'comma', markdown: expect.stringContaining('| Alpha | 2 |') });
        expect(markdownTableFromClipboard({
            text: 'Name,Count\nAlpha,2\nBeta,3',
            mimeType: 'text/plain',
        })).toMatchObject({ delimiter: 'comma' });
    });
});

describe('automatic clipboard table paste', () => {
    test('prefers HTML table clipboard data and claims a clear keyboard paste', () => {
        const clipboardData = {
            getData: type => ({
                'text/html': '<table><tr><th>Name</th><th>Count</th></tr><tr><td>Alpha</td><td>2</td></tr></table>',
                'text/plain': 'Name\tCount\nAlpha\t2',
            })[type] || '',
        };
        expect(clipboardTablePayload(clipboardData)).toMatchObject({ mimeType: 'text/html' });

        const view = testView();
        const preventDefault = jest.fn();
        expect(handleClipboardTablePaste({ clipboardData, preventDefault }, view)).toBe(true);
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({
            changes: {
                from: 7,
                to: 15,
                insert: '\n\n| Name | Count |\n| --- | --- |\n| Alpha | 2 |\n\n',
            },
            userEvent: 'input.paste',
        }));
    });

    test('does not claim ordinary text or mutate the editor', () => {
        const view = testView();
        const preventDefault = jest.fn();
        const clipboardData = { getData: type => type === 'text/plain' ? 'Just a normal sentence.' : '' };

        expect(handleClipboardTablePaste({ clipboardData, preventDefault }, view)).toBe(false);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(view.dispatch).not.toHaveBeenCalled();
    });
});
