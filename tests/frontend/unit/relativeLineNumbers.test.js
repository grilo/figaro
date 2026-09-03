import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLineGutter } from '@codemirror/view';
import {
    relativeLineNumberLabel,
    relativeLineNumberSpacerLabel,
} from '../../../frontend/js/core/relativeLineNumberModel.js';
import { relativeLineNumbers } from '../../../frontend/js/relativeLineNumbers.js';

function visibleLineNumberLabels(view) {
    return Array.from(view.dom.querySelectorAll('.cm-lineNumbers .cm-gutterElement'))
        .filter(element => element.style.visibility !== 'hidden')
        .map(element => element.textContent);
}

describe('relative editor line numbers', () => {
    test('labels logical lines by their distance from the cursor and reserves stable width', () => {
        expect([1, 2, 3, 4, 5].map(line => relativeLineNumberLabel(line, 3)))
            .toEqual(['2', '1', '', '1', '2']);
        expect(relativeLineNumberSpacerLabel(1)).toBe('9');
        expect(relativeLineNumberSpacerLabel(100)).toBe('99');
        expect(relativeLineNumberSpacerLabel(101)).toBe('999');
    });

    test('redraws rendered gutter rows around the primary cursor line', () => {
        const parent = document.createElement('div');
        document.body.append(parent);
        const state = EditorState.create({
            doc: 'Alpha\nBeta\nGamma\nDelta\nEpsilon',
            selection: { anchor: 11 },
            extensions: [relativeLineNumbers(), highlightActiveLineGutter()],
        });
        const view = new EditorView({ state, parent });

        expect(visibleLineNumberLabels(view)).toEqual(['2', '1', '', '1', '2']);
        expect(view.dom.querySelectorAll('.cm-lineNumbers .cm-activeLineGutter')).toHaveLength(1);
        expect(view.dom.querySelector('.cm-lineNumbers .cm-activeLineGutter').textContent).toBe('');

        view.dispatch({ selection: { anchor: view.state.doc.line(5).from } });

        expect(visibleLineNumberLabels(view)).toEqual(['4', '3', '2', '1', '']);
        expect(view.dom.querySelector('.cm-lineNumbers .cm-activeLineGutter').textContent).toBe('');
        view.destroy();
    });
});
