import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLineGutter } from '@codemirror/view';
import {
    relativeLineNumberLabel,
    relativeLineNumberSpacerLabel,
} from '../../../frontend/js/core/relativeLineNumberModel.js';
import { relativeLineNumbers } from '../../../frontend/js/relativeLineNumbers.js';
import * as numberModel from '../../../frontend/js/core/relativeLineNumberModel.js';

function visibleLineNumberLabels(view) {
    return Array.from(view.dom.querySelectorAll('.cm-lineNumbers .cm-gutterElement'))
        .filter(element => element.style.visibility !== 'hidden')
        .map(element => element.textContent);
}

describe('relative editor line numbers', () => {
    test('same-line cursor movement retains labels, while crossing lines and editing refresh them', () => {
        const view = new EditorView({ parent: document.body, state: EditorState.create({
            doc: Array(100).fill('Enough room for horizontal cursor motion.').join('\n'),
            extensions: [relativeLineNumbers()],
        }) });
        const labels = jest.spyOn(numberModel, 'relativeLineNumberLabel');
        try {
            const before = visibleLineNumberLabels(view);
            for (let i = 0; i < 20; i++) view.dispatch({ selection: { anchor: 2 + i % 10 } });
            expect(labels).not.toHaveBeenCalled();
            expect(visibleLineNumberLabels(view)).toEqual(before);
            view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
            expect(labels).toHaveBeenCalled();
            expect(visibleLineNumberLabels(view).slice(0, 4)).toEqual(['2', '1', '', '1']);
            labels.mockClear();
            view.dispatch({ changes: { from: 0, insert: 'New line\n' } });
            expect(labels).toHaveBeenCalled();
            expect(visibleLineNumberLabels(view).slice(0, 4)).toEqual(['3', '2', '1', '']);
        } finally { labels.mockRestore(); view.destroy(); }
    });

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
