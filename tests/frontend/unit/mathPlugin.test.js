import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { mathField } from '../frontend/js/mathPlugin.js';
import { mathPreviewBlocks } from '../frontend/js/core/mathPreviewModel.js';

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

    test.each([false, true])('prepared math retains its rendered nodes across source entry and mapped edits (display=%s)', display => {
        window.katex = { render: jest.fn((_source, target) => { target.innerHTML = '<span class="katex">formula</span>'; }) };
        const formula = display ? '$$\nx+y\n$$' : '$x+y$';
        const source = 'Before\n\n' + formula + '\n\nAfter';
        view = new EditorView({ state: EditorState.create({ doc: source, extensions: [mathField] }), parent: document.body });
        const original = view.dom.querySelector('.katex');
        for (let i = 0; i < 8; i++) {
            view.dispatch({ selection: { anchor: source.indexOf('x+y') } });
            expect(original.isConnected).toBe(false);
            view.dispatch({ selection: { anchor: 0 } });
            expect(view.dom.querySelector('.katex')).toBe(original);
        }
        view.dispatch({ changes: { from: 0, insert: 'Mapped ' } });
        view.dispatch({ selection: { anchor: source.indexOf('x+y') + 7 } });
        view.dispatch({ selection: { anchor: 0 } });
        expect(view.dom.querySelector('.katex')).toBe(original);
        expect(window.katex.render).toHaveBeenCalledTimes(1);
        view.dispatch({ selection: { anchor: source.indexOf('x+y') + 7 } });
        window.katex = { render: jest.fn((_source, target) => { target.innerHTML = '<span class="katex">new engine</span>'; }) };
        view.dispatch({ selection: { anchor: 0 } });
        expect(view.dom.querySelector('.katex')).not.toBe(original);
        expect(window.katex.render).toHaveBeenCalledTimes(1);
        const at = view.state.doc.toString().indexOf('x+y');
        view.dispatch({ selection: { anchor: at }, changes: { from: at, to: at + 3, insert: 'z+y' } });
        view.dispatch({ selection: { anchor: 0 } });
        expect(window.katex.render.mock.calls.at(-1)[0]).toBe('z+y');
    });

    test('failed or unavailable math rendering stays retryable after source return', () => {
        const source = 'Before\n\n$x+y$\n\nAfter';
        window.katex = { render: jest.fn((_source, target) => { target.innerHTML = '<span class="katex-error">invalid</span>'; }) };
        view = new EditorView({ state: EditorState.create({ doc: source, extensions: [mathField] }), parent: document.body });
        view.dispatch({ selection: { anchor: source.indexOf('x+y') } });
        view.dispatch({ selection: { anchor: 0 } });
        expect(window.katex.render).toHaveBeenCalledTimes(2);
        expect(view.state.doc.toString()).toBe(source);
    });

    test('parses the existing inline and display vocabulary without rendering dependencies', () => {
        expect(mathPreviewBlocks('Text $x$\n$$\ny+z\n$$')).toEqual([
            { from: 9, to: 18, text: 'y+z', source: '$$\ny+z\n$$', displayMode: true },
            { from: 5, to: 8, text: 'x', source: '$x$', displayMode: false },
        ]);
    });

    test('source motion and entry/exit reuse parsed math without flattening the document', () => {
        let state = EditorState.create({ doc: 'Before\n$abcdefgh$\nAfter', extensions: [mathField] });
        const blocks = state.field(mathField).blocks;
        const read = jest.spyOn(state.doc, 'toString');
        state = state.update({ selection: { anchor: 9 } }).state;
        const revealed = state.field(mathField);
        for (let i = 0; i < 30; i++) state = state.update({ selection: { anchor: 9 + i % 2 } }).state;
        expect(state.field(mathField)).toBe(revealed);
        state = state.update({ selection: { anchor: 0 } }).state;
        expect(state.field(mathField).blocks).toBe(blocks);
        expect(decorationCount(state.field(mathField), state.doc)).toBe(1);
        expect(read).not.toHaveBeenCalled();
        read.mockRestore();
        state = state.update({ changes: { from: 9, to: 10, insert: 'Z' } }).state;
        expect(state.field(mathField).blocks).not.toBe(blocks);
        expect(state.field(mathField).blocks[0].text).toContain('Z');
    });

    test('maps math through outside edits and reparses a newly joined inline expression', () => {
        let state = EditorState.create({ doc: 'Before\n$x$\n$a\nb$', extensions: [mathField] });
        state = state.update({ changes: { from: 0, insert: 'Prefix ' }, selection: { anchor: 15 } }).state;
        expect(state.field(mathField).blocks[0].from).toBe(14);
        expect(state.field(mathField).visibleIndices.has(0)).toBe(true);
        const newline = state.doc.toString().lastIndexOf('\n');
        state = state.update({ changes: { from: newline, to: newline + 1 } }).state;
        expect(state.field(mathField).blocks.map(block => block.text)).toEqual(['x', 'ab']);
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
