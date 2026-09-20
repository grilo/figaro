import { Compartment, EditorState, StateField, StateEffect } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { livePreviewPlugin, markdownStylePlugin, linkPlugin, mouseSelectingField, collapseOnSelectionFacet, shouldShowSource } from 'codemirror-live-markdown';
import { createMarkdownLineDecorations } from '../../../frontend/js/markdownLineDecorations.js';
import { referenceLinkPlugin } from '../../../frontend/js/referenceLinks.js';
import { createFrontmatterField } from '../../../frontend/js/frontmatterPlugin.js';
import { parseFrontmatter } from '../../../frontend/js/frontmatter.js';
import { inlineWritingState, writingInlineExtension, updateInlineWriting } from '../../../frontend/js/writingInline.js';
import { createDiagramField } from '../../../frontend/js/liveDiagramPlugin.js';
import { mathField } from '../../../frontend/js/mathPlugin.js';
import { editorDiagnostics } from '../../../frontend/js/editorDiagnostics.js';

let canvas;
beforeEach(() => { canvas = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ font: '', measureText: text => ({ width: text.length * 8 }) }); });
afterEach(() => { canvas.mockRestore(); editorDiagnostics.stop(); });
function mount(source, extensions, anchor = 0) {
    const config = new Compartment();
    let state = EditorState.create({ doc: source, selection: { anchor }, extensions: [markdownLanguage, mouseSelectingField,
        collapseOnSelectionFacet.of(true), extensions, config.of([])] });
    ensureSyntaxTree(state, source.length, 10000); state = state.update({}).state;
    const view = new EditorView({ state, parent: document.body });
    Object.defineProperty(view, 'visibleRanges', { get: () => [{ from: 0, to: view.state.doc.length }], configurable: true });
    view.dispatch({ effects: config.reconfigure([]) });
    return view;
}
function projection(view, plugin) {
    const result = [];
    view.plugin(plugin).decorations.between(0, view.state.doc.length, (from, to, value) => {
        const { class: className, attributes, widget } = value.spec;
        result.push({ from, to, className, attributes, widget: widget?.toDOM(view).outerHTML });
    });
    return result;
}

test.each(['prose', 'list', 'quote', 'format', 'link', 'reference', 'static'])('incremental %s edits agree with a fresh parse through insertion, deletion and source reveal', kind => {
    const source = 'Opening prose.\n\n- Bullet **bold** [link](note.md) [ref][r]\n- Other\n\n> Quote words\n\n==Marked==\n\n[r]: ref.md';
    const plugins = [livePreviewPlugin, markdownStylePlugin, linkPlugin({}), referenceLinkPlugin(), ...createMarkdownLineDecorations()];
    const view = mount(source, plugins);
    const target = { prose: 'Opening', list: 'Bullet', quote: 'Quote', format: 'bold', link: 'link', reference: 'ref]', static: 'Marked' }[kind];
    try {
        for (const insert of ['xyz', '', 'more', '', '*']) {
            const from = source.indexOf(target) + 2;
            view.dispatch({ changes: { from, to: from + (insert ? 0 : 1), insert }, selection: { anchor: from + insert.length } });
            for (const anchor of [view.state.selection.main.head, 0, view.state.doc.toString().indexOf('Quote') + 1]) {
                view.dispatch({ selection: { anchor: Math.max(0, anchor) } });
                const fresh = mount(view.state.doc.toString(), plugins, view.state.selection.main.head);
                try { for (const plugin of plugins) expect(projection(view, plugin)).toEqual(projection(fresh, plugin)); }
                finally { fresh.destroy(); }
            }
        }
    } finally { view.destroy(); }
});

test.each(['', '---\ntitle: Draft\n---\n\n', '---\ntitle: Draft\n\n'])('Properties keeps body edits local and reparses delimiter transitions (%j)', prefix => {
    const field = createFrontmatterField(StateField, StateEffect, EditorView, Decoration, WidgetType, null);
    let state = EditorState.create({ doc: prefix + 'Body words.\n\n' + 'Other.\n\n'.repeat(1000), extensions: field });
    const original = state.field(field);
    for (let index = 0; index < 10; index++) {
        const read = jest.spyOn(state.doc, 'line');
        state = state.update({ changes: { from: prefix.length + 5, insert: 'x' } }).state;
        expect(read.mock.calls.length).toBeLessThan(8);
        expect(state.field(field)).toBe(original);
        read.mockRestore();
    }
    for (const changes of [
        { from: state.doc.length, insert: '\n---' },
        { from: 0, to: 0, insert: '\uFEFF---\n' },
        { from: 0, to: 1, insert: '' },
        { from: 2, to: 3, insert: '\n' },
        { from: 0, to: 4, insert: '---\n' },
    ]) {
        state = state.update({ changes }).state;
        expect(state.field(field).frontmatter).toEqual(parseFrontmatter(state.doc.toString()));
    }
});

test.each([10, 1000])('writing retention queries edited ranges without enumerating %i findings', count => {
    const source = 'Opening prose.\n\n' + 'We utilize words.\n\n'.repeat(count);
    const findings = Array.from({ length: count }, (_, index) => ({ id: String(index), from: 19 + index * 19, to: 26 + index * 19, actual: 'utilize', kind: 'vocabulary', fixes: [] }));
    const view = mount(source, writingInlineExtension);
    const current = { id: 'note', revision: 1, configuration: 'plain', source };
    updateInlineWriting(view, { current, analyzed: current, inlineFindings: findings }, { apply() {} });
    const before = view.state.field(inlineWritingState), getter = jest.spyOn(before, 'findings', 'get');
    editorDiagnostics.start();
    try {
        for (let index = 0; index < 10; index++) editorDiagnostics.interaction('typing', [], () => view.dispatch({ changes: { from: 5, insert: 'x' } }));
        expect(getter).not.toHaveBeenCalled();
        expect(editorDiagnostics.snapshot().reduce((sum, record) => sum + (record.counters['writing.inlineInvalidation'] || 0), 0)).toBeLessThan(30);
        const after = view.state.field(inlineWritingState);
        expect(after.actions).toEqual({}); expect(after.stale).toBe(true);
        expect(after.findings).toHaveLength(count);
        expect(after.findings.at(-1).from).toBe(findings.at(-1).from + 10);
        expect(before.findings.at(-1).from).toBe(findings.at(-1).from);
        const pos = after.findings[0].from;
        view.dispatch({ changes: { from: pos + 1, insert: 'x' } });
        expect(view.state.field(inlineWritingState).findings).toHaveLength(count - 1);
    } finally { getter.mockRestore(); view.destroy(); }
});

test.each(['diagram', 'math'])('%s maps 1,000 replacements and refreshes a nonlocal source jump without rebuilding all widgets', kind => {
    const field = kind === 'math' ? mathField
        : createDiagramField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField);
    const snippet = kind === 'math' ? '$abcdef$' : '```mermaid\nflowchart LR\nA-->B\n```';
    let state = EditorState.create({ doc: 'Opening prose.\n\n' + (snippet + '\n\n').repeat(1000),
        extensions: [markdownLanguage, mouseSelectingField, collapseOnSelectionFacet.of(true), field] });
    ensureSyntaxTree(state, state.doc.length, 10000); state = state.update({}).state;
    const replace = jest.spyOn(Decoration, 'replace');
    try {
        for (let index = 0; index < 10; index++) state = state.update({ changes: { from: 5, insert: 'x' }, selection: { anchor: 6 } }).state;
        expect(replace).not.toHaveBeenCalled();
        const last = state.field(field).blocks.at(-1);
        state = state.update({ changes: { from: 5, insert: 'x' }, selection: { anchor: last.from + 3 } }).state;
        expect([...state.field(field).visibleIndices]).toEqual([999]);
        state = state.update({ selection: { anchor: 0 } }).state;
        expect(state.field(field).visibleIndices.size).toBe(0);
        expect(replace.mock.calls.length).toBeLessThan(3);
    } finally { replace.mockRestore(); }
});
