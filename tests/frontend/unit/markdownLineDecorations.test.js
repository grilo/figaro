import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { createMarkdownLineDecorations } from '../../../frontend/js/markdownLineDecorations.js';
import { markdownIndentationMetrics } from '../../../frontend/js/markdownIndentation.js';

let canvas, measure, fonts;
beforeEach(() => {
    fonts = [];
    measure = jest.fn(function(text) { fonts.push(this.font); return { width: text.length * 8 }; });
    canvas = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ font: '', measureText: measure });
});
afterEach(() => canvas.mockRestore());

function create(source) {
    const extensions = createMarkdownLineDecorations(), config = new Compartment();
    let state = EditorState.create({ doc: source, extensions: [markdownLanguage, extensions, config.of([]), EditorState.allowMultipleSelections.of(true)] });
    ensureSyntaxTree(state, source.length, 10000); state = state.update({}).state;
    const view = new EditorView({ state, parent: document.body });
    Object.defineProperty(view, 'visibleRanges', { configurable: true, get: () => [{ from: 0, to: view.state.doc.length }] });
    view.dispatch({ effects: config.reconfigure([]) });
    return { view, list: view.plugin(extensions[0]), extras: view.plugin(extensions[1]), config };
}

test.each([10, 1000])('cursor-only movement preserves %i list/quote projections without syntax or metric work', count => {
    const prefix = 'Ordinary first line.\nOrdinary second line.\n\n';
    const source = prefix + Array(count).fill('- Item\n> Quote\n\n').join('');
    const { view, list, extras } = create(source);
    const tree = jest.spyOn(syntaxTree(view.state), 'iterate'), slices = jest.spyOn(view.state.doc, 'sliceString');
    const listBefore = list.decorations, extrasBefore = extras.decorations;
    const bullet = view.dom.querySelector('.cm-bullet'); canvas.mockClear(); measure.mockClear();
    try {
        for (let i = 0; i < 20; i++) view.dispatch({ selection: { anchor: i % 2 ? 3 : source.indexOf('second') } });
        expect(list.value.blocks).toHaveLength(count); expect(extras.value.blocks).toHaveLength(count);
        expect(list.decorations).toBe(listBefore); expect(extras.decorations).toBe(extrasBefore);
        expect(view.dom.querySelector('.cm-bullet')).toBe(bullet);
        expect(tree).not.toHaveBeenCalled(); expect(slices).not.toHaveBeenCalled();
        expect(canvas).not.toHaveBeenCalled(); expect(measure).not.toHaveBeenCalled();
        // Crossing into a list and a quote updates only their cached variants.
        view.dispatch({ selection: { anchor: prefix.length + 3 } });
        expect(list.value.visibleIndices.size).toBe(1);
        const activeList = list.decorations;
        view.dispatch({ selection: { anchor: prefix.length + 4 } });
        expect(list.decorations).toBe(activeList);
        view.dispatch({ selection: { anchor: prefix.length + 10 } });
        expect(list.value.visibleIndices.size).toBe(0); expect(extras.value.visibleIndices.size).toBe(1);
        expect(tree).not.toHaveBeenCalled(); expect(slices).not.toHaveBeenCalled(); expect(measure).not.toHaveBeenCalled();
    } finally { tree.mockRestore(); slices.mockRestore(); view.destroy(); }
});

test('multiple and backward selections reveal whole logical lines and preserve unaffected decoration values', () => {
    const source = 'Intro\n\n- One\n- Two\n- Three\n\n> Quote\n\n---\n\n==Static== [^1]';
    const { view, list, extras } = create(source);
    const third = list.value.blocks[2], untouched = third.passive[0].value;
    const first = source.indexOf('One'), second = source.indexOf('Two'), quote = source.indexOf('Quote'), rule = source.indexOf('---');
    try {
        view.dispatch({ selection: EditorSelection.create([EditorSelection.range(second + 2, first), EditorSelection.cursor(quote)]) });
        expect([...list.value.visibleIndices].sort()).toEqual([0, 1]);
        expect(extras.value.visibleIndices.size).toBe(1);
        let retained; list.decorations.between(third.from, third.to, (_from, _to, value) => { if (value.spec.sourceBlock === third && value.spec.attributes) retained = value; });
        expect(retained).toBe(untouched);
        view.dispatch({ selection: { anchor: rule + 1 } });
        expect(view.dom.querySelector('.cm-hr-active')).not.toBeNull();
        expect(list.value.visibleIndices.size).toBe(0);
        view.dispatch({ selection: { anchor: 0 } });
        expect(view.dom.querySelector('.cm-hr-passive')).not.toBeNull();
        expect(view.dom.querySelector('.cm-highlight')?.textContent).toBe('==Static==');
        expect(view.dom.querySelector('.cm-footnote')?.textContent).toBe('[^1]');
    } finally { view.destroy(); }
});

test('source edits remap task actions, while tab/font changes refresh cached indentation', () => {
    const { view, list, config } = create('Intro\n\n- [ ] Task\n\n> Quote');
    try {
        expect(fonts.some(font => font.startsWith('italic '))).toBe(true);
        expect(view.dom.querySelector('.cm-task-checkbox')?.getAttribute('aria-label')).toContain('Task');
        view.dispatch({ changes: { from: 0, insert: 'Shifted ' } });
        const task = view.dom.querySelector('.cm-task-checkbox');
        expect(view.posAtDOM(task)).toBe(view.state.doc.toString().indexOf('[ ]'));
        task.closest('.cm-task-checkbox-hitbox').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        expect(view.state.doc.toString()).toContain('- [x] Task');
        const previous = list.value;
        view.dispatch({ effects: config.reconfigure(EditorState.tabSize.of(8)) });
        expect(list.value).not.toBe(previous);
        const metrics = markdownIndentationMetrics(view);
        view.contentDOM.style.fontSize = '22px';
        const nextMetrics = markdownIndentationMetrics(view); expect(nextMetrics).not.toBe(metrics);
        const blocks = list.lines;
        list.update({ geometryChanged: true, docChanged: false, viewportChanged: false, selectionSet: false,
            startState: view.state, state: view.state, transactions: [], view });
        expect(list.lines).toBe(blocks); expect(list.metrics).toBe(nextMetrics);
    } finally { view.destroy(); }
});


test('prose edits map cached list, task, quote and static ranges without rebuilding or reading styles', () => {
    const source = 'Ordinary paragraph.\n\n- Bullet\n- [ ] Task\n\n> Quote\n\n==Marked==';
    const { view, list, extras } = create(source);
    const listProject = jest.spyOn(list, 'project'), extraProject = jest.spyOn(extras, 'project');
    const style = jest.spyOn(window, 'getComputedStyle');
    const bullet = list.value.blocks[0].passive[1].value;
    try {
        for (let i = 0; i < 10; i++) view.dispatch({ changes: { from: 5, insert: 'x' }, selection: { anchor: 6 } });
        expect(listProject).not.toHaveBeenCalled(); expect(extraProject).not.toHaveBeenCalled();
        expect(style).not.toHaveBeenCalled();
        expect(list.value.blocks[0].passive[1].value).toBe(bullet);
        const current = view.state.doc.toString();
        view.dispatch({ selection: { anchor: current.indexOf('Bullet') + 1 } });
        expect(list.value.visibleIndices.size).toBe(1);
        view.dispatch({ selection: { anchor: current.indexOf('Quote') + 1 } });
        expect(list.value.visibleIndices.size).toBe(0); expect(extras.value.visibleIndices.size).toBe(1);
        view.dispatch({ selection: { anchor: 0 } });
        view.dom.querySelector('.cm-task-checkbox-hitbox').click();
        expect(view.state.doc.toString()).toBe(current.replace('[ ]', '[x]'));
        // Structural edits retain the conservative parser/projection path.
        listProject.mockClear();
        view.dispatch({ changes: { from: 5, insert: '\n- New item\n' } });
        expect(listProject).toHaveBeenCalled();
    } finally { style.mockRestore(); view.destroy(); }
});
