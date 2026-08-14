import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { mathField } from '../frontend/js/mathPlugin.js';

function decorationCount(value, doc) {
    let count = 0;
    value.decorations.between(0, doc.length, () => { count++; });
    return count;
}

describe('math preview state', () => {
    let view;

    afterEach(() => {
        view?.destroy();
        view = null;
        delete window.katex;
    });

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

    test('stabilizes display math while leaving inline math outside the footprint policy', () => {
        window.katex = { render: (_source, target) => { target.innerHTML = '<span class="katex">formula</span>'; } };
        const source = ['Before', '$$', 'x + y', '$$', 'Inline $z$ stays inline', 'After'].join('\n');
        view = new EditorView({
            state: EditorState.create({
                doc: source,
                selection: { anchor: source.length },
                extensions: [mathField],
            }),
            parent: document.body,
        });

        const block = view.dom.querySelector('.cm-math-block');
        expect(block).not.toBeNull();
        expect(block.classList.contains('cm-source-footprint--graphic')).toBe(true);
        expect(block.dataset.sourceFootprint).toBe('math');
        expect(block.dataset.sourceLines).toBe('3');
        expect(block.style.getPropertyValue('--cm-source-footprint-height'))
            .toBe(`${view.defaultLineHeight * 3}px`);
        expect(view.dom.querySelector('.cm-math-inline')?.classList.contains('cm-source-footprint')).toBe(false);
    });
});
