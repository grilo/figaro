import { EditorState } from '@codemirror/state';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { orderedListRenumberChanges } from '../frontend/js/core/orderedListRenumberModel.js';
import { orderedListRenumberExtension } from '../frontend/js/orderedListRenumber.js';

function deleteLine(source, lineNumber) {
    const state = EditorState.create({
        doc: source,
        extensions: [markdownLanguage, orderedListRenumberExtension],
    });
    const line = state.doc.line(lineNumber);
    const to = line.to < state.doc.length ? line.to + 1 : line.to;
    return state.update({
        changes: { from: line.from, to },
        selection: { anchor: line.from },
        userEvent: 'delete.selection',
    }).state;
}

describe('ordered Markdown list renumbering', () => {
    test('plans number-only replacements from the retained starting number', () => {
        expect(orderedListRenumberChanges([
            { number: 4, from: 0, to: 1 },
            { number: 6, from: 9, to: 10 },
            { number: 7, from: 18, to: 19 },
        ], 4)).toEqual([
            { from: 9, to: 10, insert: '5' },
            { from: 18, to: 19, insert: '6' },
        ]);
    });

    test('renumbers following siblings when a middle item is deleted', () => {
        const next = deleteLine('1. First\n2. Remove\n3. Third\n4. Fourth', 2);

        expect(next.doc.toString()).toBe('1. First\n2. Third\n3. Fourth');
        expect(next.selection.main.head).toBe(next.doc.line(2).from);
    });

    test('preserves a custom starting number and renumbers nested lists independently', () => {
        expect(deleteLine('4) First\n5) Remove\n6) Third', 1).doc.toString())
            .toBe('4) Remove\n5) Third');

        const nested = [
            '1. Parent',
            '   1. Child',
            '   2. Remove',
            '   3. Sibling',
            '2. Next parent',
        ].join('\n');
        expect(deleteLine(nested, 3).doc.toString()).toBe([
            '1. Parent',
            '   1. Child',
            '   2. Sibling',
            '2. Next parent',
        ].join('\n'));
    });

    test('does not normalize custom numbering when only item text is deleted', () => {
        const source = '1. First\n9. Deliberately nine';
        const state = EditorState.create({
            doc: source,
            extensions: [markdownLanguage, orderedListRenumberExtension],
        });
        const from = source.indexOf('First');
        const next = state.update({
            changes: { from, to: from + 1 },
            userEvent: 'delete.backward',
        }).state;

        expect(next.doc.toString()).toBe('1. irst\n9. Deliberately nine');
    });
});
