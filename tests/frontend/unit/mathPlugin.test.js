import { EditorState } from '@codemirror/state';
import { mathField } from '../frontend/js/mathPlugin.js';

function decorationCount(value, doc) {
    let count = 0;
    value.decorations.between(0, doc.length, () => { count++; });
    return count;
}

describe('math preview state', () => {
    test('keeps its decoration state while the cursor moves on ordinary lines and exposes math source on entry', () => {
        const source = 'Intro paragraph\n\n$E = mc^2$\n\nClosing paragraph';
        let state = EditorState.create({ doc: source, extensions: [mathField] });
        const initial = state.field(mathField);

        expect(decorationCount(initial, state.doc)).toBe(1);

        state = state.update({ selection: { anchor: state.doc.line(5).from } }).state;
        expect(state.field(mathField)).toBe(initial);
        expect(decorationCount(state.field(mathField), state.doc)).toBe(1);

        state = state.update({ selection: { anchor: source.indexOf('E =') } }).state;
        expect(state.field(mathField)).not.toBe(initial);
        expect(decorationCount(state.field(mathField), state.doc)).toBe(0);

        state = state.update({ selection: { anchor: state.doc.line(1).from } }).state;
        expect(decorationCount(state.field(mathField), state.doc)).toBe(1);
    });
});
