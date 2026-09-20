import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { history, undo, redo } from '@codemirror/commands';
import { collapseOnSelectionFacet, linkPlugin, mouseSelectingField, setMouseSelecting } from 'codemirror-live-markdown';
import { referenceLinkPlugin } from '../../../frontend/js/referenceLinks.js';

function create(source, reference = false) {
    const extension = reference ? referenceLinkPlugin() : linkPlugin({});
    const config = new Compartment();
    let state = EditorState.create({ doc: source, extensions: [markdownLanguage, mouseSelectingField, extension,
        config.of(collapseOnSelectionFacet.of(true)), EditorState.allowMultipleSelections.of(true), history()] });
    ensureSyntaxTree(state, source.length, 10000); state = state.update({}).state;
    const view = new EditorView({ state, parent: document.body });
    Object.defineProperty(view, 'visibleRanges', { configurable: true, get: () => [{ from: 0, to: view.state.doc.length }] });
    view.dispatch({ effects: config.reconfigure(collapseOnSelectionFacet.of(true)) });
    return { view, plugin: view.plugin(extension), config };
}

test.each([['ordinary', false, 10], ['ordinary', false, 1000], ['reference', true, 10], ['reference', true, 1000]])(
    '%s links retain descriptors and decorations inside one source link among %i entries', (_name, reference, count) => {
        const source = 'Ordinary prose.\n\n' + Array(count).fill(reference ? '[Example label][ref]\n\n' : '[Example label](https://example.test)\n\n').join('')
            + (reference ? '[ref]: https://example.test' : '');
        const { view, plugin } = create(source, reference);
        const from = source.indexOf('Example'); view.dispatch({ selection: { anchor: from } });
        const before = plugin.value, tree = jest.spyOn(syntaxTree(view.state), 'iterate'), slices = jest.spyOn(view.state.doc, 'sliceString');
        try {
            expect(before.blocks).toHaveLength(count);
            for (let i = 0; i < 20; i++) view.dispatch({ selection: { anchor: from + 1 + i % 3 } });
            expect(plugin.value).toBe(before); expect(plugin.decorations).toBe(before.decorations);
            expect(tree).not.toHaveBeenCalled(); expect(slices).not.toHaveBeenCalled();
            const last = before.blocks.at(-1), second = before.blocks[1];
            let unchanged; before.decorations.between(second.from, second.to, (_a, _b, value) => { if (value.spec.sourceBlock === second) unchanged = value; });
            view.dispatch({ selection: { anchor: last.from + 2 } });
            expect([...plugin.value.visibleIndices]).toEqual([count - 1]);
            let retained; plugin.decorations.between(second.from, second.to, (_a, _b, value) => { if (value.spec.sourceBlock === second) retained = value; });
            expect(retained).toBe(unchanged);
            view.dispatch({ selection: { anchor: 2 } });
            expect(plugin.value.visibleIndices.size).toBe(0);
            for (let i = 0; i < 20; i++) view.dispatch({ selection: { anchor: 2 + i % 3 } });
            expect(tree).not.toHaveBeenCalled(); expect(slices).not.toHaveBeenCalled();
        } finally { tree.mockRestore(); slices.mockRestore(); view.destroy(); }
    });

test.each([false, true])('link reveal retains inclusive edges, multi/backward selections, drag settlement and reconfiguration (reference=%s)', reference => {
    const source = 'Intro\n\n' + (reference ? '[One][r] and [Two][r]\n\n[r]: Target.md' : '[One](one.md) and [[Two|Two label]]');
    const { view, plugin, config } = create(source, reference);
    try {
        const [first, second] = plugin.value.blocks;
        for (const anchor of [first.from, first.to]) {
            view.dispatch({ selection: { anchor } }); expect([...plugin.value.visibleIndices]).toEqual([0]);
        }
        view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(first.from), EditorSelection.cursor(second.to)]) });
        expect(plugin.value.visibleIndices.size).toBe(2);
        view.dispatch({ selection: { anchor: second.to, head: first.from } });
        expect(plugin.value.visibleIndices.size).toBe(2);
        const frozen = plugin.decorations;
        view.dispatch({ effects: setMouseSelecting.of(true), selection: { anchor: 1 } });
        if (!reference) expect(plugin.decorations).toBe(frozen);
        view.dispatch({ selection: { anchor: second.from + 1 } });
        view.dispatch({ effects: setMouseSelecting.of(false) });
        expect([...plugin.value.visibleIndices]).toEqual([1]);
        view.dispatch({ effects: config.reconfigure(collapseOnSelectionFacet.of(false)) });
        expect(plugin.value.visibleIndices.size).toBe(0);
        expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
});

test('ordinary link payload edits refresh title and destination, retain code exclusions and survive Undo', () => {
    const source = 'Intro\n\n[Label](Target.md "Old title")\n\n`[Inline](ignored.md)`\n\n```\n[[Hidden]]\n```';
    const { view, plugin } = create(source);
    try {
        expect(plugin.value.blocks).toHaveLength(1);
        expect(view.dom.querySelector('a.cm-link-widget').title).toBe('Old title');
        const from = source.indexOf('Old title');
        view.dispatch({ changes: { from, to: from + 9, insert: 'New title' } });
        expect(view.dom.querySelector('a.cm-link-widget').title).toBe('New title');
        expect(undo(view)).toBe(true); expect(view.dom.querySelector('a.cm-link-widget').title).toBe('Old title');
        expect(redo(view)).toBe(true); expect(view.dom.querySelector('a.cm-link-widget').title).toBe('New title');
        view.dispatch({ effects: setMouseSelecting.of(true), changes: { from: 0, insert: 'Before ' } });
        expect(plugin.value.blocks[0].from).toBe(source.indexOf('[') + 7);
        view.dispatch({ effects: setMouseSelecting.of(false) });
        expect(view.dom.querySelector('a.cm-link-widget').getAttribute('href')).toBe('Target.md');
    } finally { view.destroy(); }
});

test('reference edits refresh definitions and unresolved labels, including edits during a drag', () => {
    const source = 'Intro\n\n[One][r] and [Missing][absent]\n\n[r]: Original.md';
    const { view, plugin } = create(source, true);
    try {
        expect(plugin.value.blocks).toHaveLength(1);
        expect(view.dom.querySelector('.cm-unresolved-reference').textContent).toBe('[Missing][absent]');
        const from = source.indexOf('Original.md');
        view.dispatch({ changes: { from, to: source.length, insert: 'Updated.md\n[absent]: Found.md' } });
        expect(plugin.value.blocks).toHaveLength(2);
        expect([...view.dom.querySelectorAll('a.cm-reference-link-widget')].map(node => node.getAttribute('href'))).toEqual(['Updated.md', 'Found.md']);
        view.dispatch({ effects: setMouseSelecting.of(true), changes: { from: 0, insert: 'Before ' } });
        expect(plugin.value.visibleIndices.size).toBe(2);
        view.dispatch({ effects: setMouseSelecting.of(false) });
        expect(plugin.value.visibleIndices.size).toBe(0);
        expect(view.dom.querySelector('a.cm-reference-link-widget').getAttribute('href')).toBe('Updated.md');
    } finally { view.destroy(); }
});
