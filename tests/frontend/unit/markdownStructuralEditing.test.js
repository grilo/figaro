import { emptyBlockquoteExitPlan } from '../frontend/js/core/markdownStructuralEditing.js';

describe('Markdown structural editing', () => {
    test('exits an empty outer blockquote in one step', () => {
        expect(emptyBlockquoteExitPlan({
            lineText: '> ',
            lineFrom: 18,
            selectionFrom: 20,
        })).toEqual({
            changes: { from: 18, to: 20, insert: '' },
            selection: { anchor: 18 },
        });
    });

    test('removes one nested quote level while preserving outer indentation', () => {
        expect(emptyBlockquoteExitPlan({
            lineText: '  > > ',
            lineFrom: 7,
            selectionFrom: 13,
        })).toEqual({
            changes: { from: 7, to: 13, insert: '  > ' },
            selection: { anchor: 11 },
        });
    });

    test.each([
        { lineText: '> quoted', lineFrom: 0, selectionFrom: 8 },
        { lineText: '> ', lineFrom: 0, selectionFrom: 1 },
        { lineText: '> ', lineFrom: 0, selectionFrom: 0, selectionTo: 2 },
        { lineText: '    > ', lineFrom: 0, selectionFrom: 6 },
    ])('leaves non-empty, mid-line, ranged, and code-indented input to CodeMirror', input => {
        expect(emptyBlockquoteExitPlan(input)).toBeNull();
    });
});
