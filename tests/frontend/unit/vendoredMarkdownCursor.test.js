function reveals(value) { return value.blocks.map((_, index) => value.visibleIndices.has(index)); }
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree, codeFolding, foldEffect, unfoldEffect } from '@codemirror/language';
import { livePreviewPlugin, markdownStylePlugin, markdownWorkFacet, codeBlockField,
    collapseOnSelectionFacet, mouseSelectingField, setMouseSelecting } from 'codemirror-live-markdown';

function stateFor(source, extensions = []) {
    let state = EditorState.create({ doc: source, extensions: [markdownLanguage,
        ...extensions, collapseOnSelectionFacet.of(true), mouseSelectingField,
        EditorState.allowMultipleSelections.of(true), codeFolding()] });
    ensureSyntaxTree(state, state.doc.length, 10000);
    return state.update({}).state;
}
function marks(plugin) {
    const values = [];
    plugin.decorations.between(0, 1e9, (from, to, value) => values.push({ from, to, class: value.spec.class }));
    return values;
}
function classesAt(plugin, position) {
    return marks(plugin).filter(mark => mark.from <= position && mark.to >= position).map(mark => mark.class).join(' ');
}

test.each([10, 1000])('formatting retains decorations without tree walks across 20 prose moves with %i blocks', count => {
    const source = 'Ordinary paragraph here.\n\n' + Array.from({ length: count }, (_, i) => `## Heading ${i}\n\n**Bold** and *emphasis*.\n\n`).join('');
    const view = new EditorView({ state: stateFor(source, [livePreviewPlugin, markdownStylePlugin]), parent: document.body });
    const marker = view.plugin(livePreviewPlugin), style = view.plugin(markdownStylePlugin);
    const before = marker.decorations, styleBefore = style.decorations;
    const tree = jest.spyOn(syntaxTree(view.state), 'iterate');
    const read = jest.spyOn(view.state.doc, 'sliceString');
    try {
        for (let i = 0; i < 20; i++) view.dispatch({ selection: { anchor: 1 + i % 10 } });
        expect(tree).not.toHaveBeenCalled();
        expect(read).not.toHaveBeenCalled();
        expect(marker.decorations).toBe(before);
        expect(style.decorations).toBe(styleBefore);
    } finally { tree.mockRestore(); read.mockRestore(); view.destroy(); }
});

test('formatting preserves marker boundaries, multi-selection, collapse settings and drag settlement', () => {
    const source = 'Intro\n\n## Heading\n\nText **bold** and `code`.\n\n> Quote';
    const config = new Compartment();
    const view = new EditorView({ state: stateFor(source, [config.of(collapseOnSelectionFacet.of(true)), livePreviewPlugin]), parent: document.body });
    const plugin = view.plugin(livePreviewPlugin);
    const heading = source.indexOf('##'), bold = source.indexOf('**'), quote = source.indexOf('>');
    try {
        view.dispatch({ selection: { anchor: heading + 5 } });
        expect(classesAt(plugin, heading)).toContain('cm-formatting-block-visible');
        const retained = plugin.decorations;
        view.dispatch({ selection: { anchor: heading + 6 } });
        expect(plugin.decorations).toBe(retained);
        view.dispatch({ selection: { anchor: bold + 1 } });
        expect(classesAt(plugin, bold)).toContain('cm-formatting-inline-visible');
        view.dispatch({ selection: { anchor: bold + 3 } });
        expect(classesAt(plugin, bold)).not.toContain('cm-formatting-inline-visible');
        view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(bold), EditorSelection.cursor(quote + 3)]) });
        expect(classesAt(plugin, bold)).toContain('cm-formatting-inline-visible');
        expect(classesAt(plugin, quote)).toContain('cm-formatting-block-visible');
        view.dispatch({ effects: config.reconfigure(collapseOnSelectionFacet.of(false)) });
        expect(classesAt(plugin, bold)).not.toContain('cm-formatting-inline-visible');
        expect(classesAt(plugin, quote)).toContain('cm-formatting-block-visible');
        view.dispatch({ effects: setMouseSelecting.of(true), selection: { anchor: 1 } });
        view.dispatch({ effects: setMouseSelecting.of(false) });
        expect(classesAt(plugin, quote)).not.toContain('cm-formatting-block-visible');
        expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
});

test('formatting and styles traverse only visible syntax, including disjoint ranges in one paragraph', () => {
    const prefix = 'Intro **one** and *two* here.\n\n';
    const source = prefix + Array.from({ length: 1000 }, (_, i) => `## Heading ${i}\n\nText.\n\n`).join('');
    const state = stateFor(source);
    const view = { state, visibleRanges: [{ from: 0, to: 13 }, { from: 17, to: prefix.length }] };
    const tree = syntaxTree(state), iterate = tree.iterate.bind(tree);
    let visited = 0;
    const spy = jest.spyOn(tree, 'iterate').mockImplementation(options => {
        expect(options.from).toBeGreaterThanOrEqual(0);
        expect(options.to).toBeLessThanOrEqual(prefix.length);
        return iterate({ ...options, enter: node => { visited++; return options.enter(node); } });
    });
    try {
        const marker = livePreviewPlugin.create(view), style = markdownStylePlugin.create(view);
        expect(visited).toBeLessThan(100);
        expect(marks(marker).some(mark => mark.from === prefix.indexOf('**'))).toBe(true);
        expect(marks(marker).some(mark => mark.from === prefix.indexOf('*two'))).toBe(true);
        expect(marks(style).some(mark => mark.class === 'cm-strong')).toBe(true);
        expect(marks(style).some(mark => mark.class === 'cm-emphasis')).toBe(true);
        expect(marks(style).some(mark => mark.class === 'cm-heading-line')).toBe(false);
    } finally { spy.mockRestore(); }
});

test.each([10, 1000])('code descriptors and decorations survive ordinary/source movement among %i fences', count => {
    const source = 'Ordinary paragraph here.\n\n' + Array(count).fill('```js\nlet value = 1;\n```\n\n').join('');
    const [field, click] = codeBlockField({ lineNumbers: true });
    let state = stateFor(source, [field, click]);
    const value = state.field(field);
    expect(value.blocks).toHaveLength(count);
    const tree = jest.spyOn(syntaxTree(state), 'iterate');
    const read = jest.spyOn(state.doc, 'sliceString');
    try {
        for (let i = 0; i < 20; i++) state = state.update({ selection: { anchor: 1 + i % 10 } }).state;
        expect(state.field(field)).toBe(value);
        expect(tree).not.toHaveBeenCalled();
        expect(read).not.toHaveBeenCalled();
        const block = value.blocks[Math.floor(count / 2)];
        state = state.update({ selection: { anchor: block.codeFrom + 1 } }).state;
        const revealed = state.field(field);
        expect(reveals(revealed).filter(Boolean)).toHaveLength(1);
        for (let i = 0; i < 20; i++) state = state.update({ selection: { anchor: block.codeFrom + 1 + i % 3 } }).state;
        expect(state.field(field)).toBe(revealed);
        state = state.update({ selection: { anchor: 1 } }).state;
        expect(state.field(field).blocks).toBe(value.blocks);
        expect(reveals(state.field(field)).some(Boolean)).toBe(false);
        expect(tree).not.toHaveBeenCalled();
        expect(read).not.toHaveBeenCalled();
    } finally { tree.mockRestore(); read.mockRestore(); }
});

test('code reveals inclusive/backwards/multiple selections and refreshes folds, configuration, edits and undo', () => {
    const source = 'Before\n\n```js\nconst one = 1;\n```\n\nBetween\n\n```text\ntwo\n```\n\nAfter';
    const config = new Compartment(), [field, click] = codeBlockField({ lineNumbers: true });
    const view = new EditorView({ state: stateFor(source, [config.of(collapseOnSelectionFacet.of(true)), history(), field, click]), parent: document.body });
    try {
        const initial = view.state.field(field), [first, last] = initial.blocks;
        view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(first.from), EditorSelection.cursor(last.to)]) });
        expect(reveals(view.state.field(field))).toEqual([true, true]);
        view.dispatch({ selection: { anchor: last.to, head: first.from } });
        expect(reveals(view.state.field(field))).toEqual([true, true]);
        view.dispatch({ selection: { anchor: 0 } });
        const fold = { from: view.state.doc.lineAt(first.from).to, to: first.to };
        view.dispatch({ effects: foldEffect.of(fold) });
        expect(view.state.field(field).blocks).toBe(initial.blocks);
        view.dispatch({ effects: unfoldEffect.of(fold) });
        expect(view.state.field(field).decorations.size).toBe(2);
        view.dispatch({ effects: setMouseSelecting.of(true), selection: { anchor: first.codeFrom + 1 } });
        expect(reveals(view.state.field(field))).toEqual([false, false]);
        view.dispatch({ effects: setMouseSelecting.of(false) });
        expect(reveals(view.state.field(field))).toEqual([true, false]);
        view.dispatch({ effects: config.reconfigure(collapseOnSelectionFacet.of(false)) });
        expect(reveals(view.state.field(field))).toEqual([false, false]);
        view.dispatch({ changes: { from: first.codeFrom, insert: '/* edited */' } });
        expect(view.state.field(field).blocks[0].code).toContain('/* edited */');
        expect(undo(view)).toBe(true); expect(view.state.doc.toString()).toBe(source);
        expect(redo(view)).toBe(true); expect(view.state.field(field).blocks[0].code).toContain('/* edited */');
    } finally { view.destroy(); }
});

test('parser progress discovers later code descriptors without a source edit and diagnostics remain injected', () => {
    const source = Array(1000).fill('```js\nconst example = 1;\n```\n\n').join('');
    const [field] = codeBlockField({});
    const count = jest.fn();
    let state = EditorState.create({ doc: source, extensions: [markdownLanguage, field, markdownWorkFacet.of(count)] });
    expect(state.field(field).blocks.length).toBeLessThan(1000);
    ensureSyntaxTree(state, state.doc.length, 10000);
    state = state.update({}).state;
    expect(state.field(field).blocks).toHaveLength(1000);
    expect(count).toHaveBeenCalledWith('parse.code', 1);
    expect(count.mock.calls.some(([name, amount]) => name === 'syntax.nodes.code' && amount > 1000)).toBe(true);
});

test.each([10, 1000])('plain typing maps %i cached code blocks and source entry patches only its own decorations', count => {
    const source = 'Ordinary prose here.\n\n' + Array(count).fill('```js\nconst x = 1;\n```\n\n').join('');
    let counters = {};
    const extensions = codeBlockField({ lineNumbers: true }), field = extensions[0];
    let state = stateFor(source, [...extensions, markdownWorkFacet.of((name, amount = 1) => counters[name] = (counters[name] || 0) + amount)]);
    const original = state.field(field);
    counters = {};
    const slices = jest.spyOn(Object.getPrototypeOf(state.doc), 'sliceString');
    try {
        for (let index = 0; index < 20; index++) {
            state = state.update({ changes: index % 2 ? { from: 2, to: 3 } : { from: 2, insert: 'x' } }).state;
            expect(state.field(field).blocks[0].code).toBe(original.blocks[0].code);
        }
        // Lezer reads single boundary characters to reuse unchanged fragments.
        // Code payload extraction would read more than that outside the edited paragraph.
        expect(slices.mock.calls.some(([from, to]) => from >= source.indexOf('```') && to - from > 1)).toBe(false);
    } finally { slices.mockRestore(); }
    expect(counters['parse.code'] || 0).toBe(0);
    expect(counters['source.slices.code'] || 0).toBe(0);
    expect(state.doc.toString()).toBe(source);
    const before = state.field(field), target = before.blocks[0].from + 1;
    const last = before.blocks.at(-1);
    const retained = [];
    before.decorations.between(last.from, last.to, (_from, _to, decoration) => retained.push(decoration));
    let reads = 0;
    before.blocks.forEach(block => {
        const from = block.from;
        Object.defineProperty(block, 'from', { configurable: true, get() { reads++; return from; } });
    });
    counters = {};
    for (let index = 0; index < 20; index++) {
        reads = 0;
        state = state.update({ selection: { anchor: index % 2 ? 1 : target } }).state;
        expect(reads).toBeLessThanOrEqual(16);
    }
    expect(counters['decorations.code'] || 0).toBe(0);
    expect(counters['decorations.sourceBlocks.code']).toBe(20);
    const final = [];
    state.field(field).decorations.between(last.from, last.to, (_from, _to, decoration) => final.push(decoration));
    expect(final[0]).toBe(retained[0]);
});


test.each(['Ordinary **bold** prose here.', 'Ordinary author’s prose here.',
    '- Ordinary list prose here.', '> Ordinary quoted prose here.', '> - Nested **bold** prose here.'])
('ordinary typing in %s reuses distant fence projections', prefix => {
    let counts = {};
    const [field] = codeBlockField({});
    const source = prefix + '\n\n' + Array(1000).fill('```js\nlet value = 1;\n```\n\n').join('');
    let state = EditorState.create({ doc: source, extensions: [markdownLanguage,
        mouseSelectingField, collapseOnSelectionFacet.of(true), field,
        markdownWorkFacet.of((name, amount = 1) => counts[name] = (counts[name] || 0) + amount)] });
    ensureSyntaxTree(state, source.length, 10000); state = state.update({}).state;
    const initial = state.field(field), decoration = initial.decorations.iter().value;
    counts = {};
    const position = prefix.indexOf('prose') + 2;
    for (let index = 0; index < 20; index++) state = state.update({ changes: index % 2
        ? { from: position, to: position + 1 } : { from: position, insert: 'x' } }).state;
    expect(state.doc.toString()).toBe(source);
    expect(counts['parse.code'] || 0).toBe(0);
    expect(counts['source.slices.code'] || 0).toBe(0);
    expect(counts['decorations.code'] || 0).toBe(0);
    expect(state.field(field).decorations.iter().value).toBe(decoration);
});
