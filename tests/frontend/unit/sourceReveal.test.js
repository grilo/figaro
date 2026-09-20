function reveals(value) { return value.blocks.map((_, index) => value.visibleIndices.has(index)); }
import { Compartment, EditorSelection, EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { ensureSyntaxTree, codeFolding, foldEffect, unfoldEffect } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { codeBlockField, canMapMarkdownProseEdit, collapseOnSelectionFacet, mouseSelectingField, setMouseSelecting, shouldShowSource } from 'codemirror-live-markdown';
import { createMarkdownImageField } from '../../../frontend/js/markdownImagePlugin.js';
import { createMarkdownTableField } from '../../../frontend/js/liveMarkdownTablePlugin.js';
import { createDiagramField } from '../../../frontend/js/liveDiagramPlugin.js';
import { mathField } from '../../../frontend/js/mathPlugin.js';
import { editorDiagnostics } from '../../../frontend/js/editorDiagnostics.js';

const fixtures = [
    ['images', '![Alt](image.png)', () => createMarkdownImageField()],
    ['tables', '| A | B |\n| - | - |\n| x | y |', () => createMarkdownTableField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField, EditorSelection)[0]],
    ['diagrams', '```mermaid\nflowchart TD\n A --> B\n```', () => createDiagramField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField)],
    ['math', '$abcdef$', () => mathField],
];

function mount(source, field, extra = []) {
    let state = EditorState.create({ doc: source, extensions: [markdown({ base: markdownLanguage }), codeFolding(),
        ...extra, collapseOnSelectionFacet.of(true), mouseSelectingField, EditorState.allowMultipleSelections.of(true), field] });
    ensureSyntaxTree(state, state.doc.length, 10000);
    state = state.update({}).state;
    return state;
}

describe.each(fixtures)('%s indexed source reveal', (name, syntax, createField) => {
    test.each([10, 1000])('ordinary movement retains decoration identity with %i widgets', count => {
        const field = createField();
        const source = 'Prose before\n\n' + Array(count).fill(syntax + '\n\nordinary prose\n\n').join('');
        let state = mount(source, field);
        const initial = state.field(field);
        expect(initial.blocks).toHaveLength(count);
        // Count actual block/predicate access independently of diagnostic calls.
        const reads = initial.blocks.map(block => {
            const from = block.from, read = jest.fn(() => from);
            Object.defineProperty(block, 'from', { get: read, configurable: true });
            return read;
        });
        editorDiagnostics.start();
        try {
            editorDiagnostics.interaction('cursor', ['selection'], () => {
                for (let i = 0; i < 50; i++) state = state.update({ selection: { anchor: 1 + i % 5 } }).state;
            });
            expect(state.field(field)).toBe(initial);
            expect(state.field(field).decorations).toBe(initial.decorations);
            expect(reads.reduce((n, read) => n + read.mock.calls.length, 0)).toBe(0);
            expect(editorDiagnostics.snapshot()[0].counters['decorations.images'] || 0).toBe(0);
            const middle = Math.floor(count / 2), block = initial.blocks[middle];
            state = state.update({ selection: { anchor: block.from + 1 } }).state;
            expect(reveals(state.field(field))[middle]).toBe(true);
            const revealed = state.field(field);
            const stable = revealed;
            const anchor = block.from + 1;
            reads.forEach(read => read.mockClear());
            for (let i = 0; i < 50; i++) state = state.update({ selection: { anchor: anchor + i % 2 } }).state;
            expect(state.field(field)).toBe(stable);
            expect(reads.reduce((n, read) => n + read.mock.calls.length, 0)).toBeLessThanOrEqual(100);
            state = state.update({ selection: { anchor: 1 } }).state;
            expect(reveals(state.field(field)).every(visible => !visible)).toBe(true);
            expect(state.doc.toString()).toBe(source);
        } finally { editorDiagnostics.stop(); }
    });

    test('preserves boundaries, multi-selections, nonlocal jumps and indexes mapped edits', () => {
        const field = createField();
        const source = 'Before prose\n\n' + Array(3).fill(syntax + '\n\nMiddle prose\n\n').join('');
        let state = mount(source, field);
        const [first, second, third] = state.field(field).blocks;
        const ranges = [EditorSelection.range(first.from, first.to), EditorSelection.cursor(third.to)];
        state = state.update({ selection: EditorSelection.create(ranges, 1) }).state;
        expect(reveals(state.field(field))).toEqual(name === 'math' ? [false, false, true] : [true, false, true]);
        state = state.update({ selection: { anchor: third.to, head: first.from } }).state;
        expect(reveals(state.field(field))).toEqual(name === 'math' ? [true, false, false] : [true, true, true]);
        state = state.update({ selection: { anchor: second.from + 1 } }).state;
        expect(reveals(state.field(field))).toEqual([false, true, false]);
        state = state.update({ changes: { from: 0, insert: 'prefix ' }, selection: { anchor: 1 } }).state;
        const mapped = state.field(field).blocks[2];
        state = state.update({ selection: { anchor: mapped.from } }).state;
        expect(reveals(state.field(field))).toEqual([false, false, true]);
        expect(state.doc.toString()).toBe('prefix ' + source);
    });
});

test('image reuse invalidates folds, drag settlement and reveal configuration', () => {
    const field = createMarkdownImageField(), config = new Compartment();
    let state = mount('Before\n\n![Alt](one.png)\n\nAfter', field, [config.of(collapseOnSelectionFacet.of(true))]);
    const block = state.field(field).blocks[0];
    state = state.update({ effects: foldEffect.of({ from: block.from, to: block.to }) }).state;
    expect(state.field(field).decorations.size).toBe(0);
    state = state.update({ effects: unfoldEffect.of({ from: block.from, to: block.to }) }).state;
    expect(state.field(field).decorations.size).toBe(1);
    const rendered = state.field(field);
    state = state.update({ effects: setMouseSelecting.of(true), selection: { anchor: block.from + 1 } }).state;
    expect(state.field(field)).toBe(rendered);
    state = state.update({ effects: setMouseSelecting.of(false) }).state;
    expect(reveals(state.field(field))).toEqual([true]);
    state = state.update({ effects: config.reconfigure(collapseOnSelectionFacet.of(false)) }).state;
    expect(reveals(state.field(field))).toEqual([false]);
});

describe.each(fixtures)('%s local source transitions', (name, syntax, createField) => {
    test.each([10, 1000])('enter/exit touches only the selected block with %i widgets', count => {
        const field = createField();
        let state = mount('Before prose\n\n' + Array(count).fill(syntax + '\n\nMore prose\n\n').join(''), field);
        const original = state.field(field), target = original.blocks[0].from + 1;
        const last = { from: original.blocks.at(-1).from, to: original.blocks.at(-1).to };
        const decorationAtEnd = value => { let found; value.decorations.between(last.from, last.to, (_from, _to, decoration) => { found = decoration; }); return found; };
        const retained = decorationAtEnd(original);
        let reads = 0;
        for (const block of original.blocks) {
            const from = block.from;
            Object.defineProperty(block, 'from', { configurable: true, get() { reads++; return from; } });
        }
        for (let index = 0; index < 20; index++) {
            reads = 0;
            state = state.update({ selection: { anchor: index % 2 ? 1 : target } }).state;
            const current = state.field(field);
            expect(reads).toBeLessThanOrEqual(16);
            expect(current.visibleIndices.has(0)).toBe(index % 2 === 0);
            expect(current.revealIndex).toBe(original.revealIndex);
            expect(decorationAtEnd(current)).toBe(retained);
        }
        expect(original.visibleIndices.size).toBe(0);
    });
});

describe.each(fixtures.filter(([name]) => name === 'images' || name === 'tables'))('%s local prose edits', (name, syntax, createField) => {
    test.each([10, 1000])('retains source payloads across typing with %i blocks', count => {
        const field = createField();
        const source = 'Before ordinary prose.\n\n' + Array(count).fill(syntax + '\n\nMore prose\n\n').join('');
        let state = mount(source, field);
        const original = state.field(field).blocks;
        const documentReads = jest.spyOn(Object.getPrototypeOf(state.doc), 'toString');
        editorDiagnostics.start();
        try {
            editorDiagnostics.interaction('typing', ['document'], () => {
                for (let index = 0; index < 20; index++) {
                    state = state.update({ changes: index % 2 ? { from: 2, to: 3 } : { from: 2, insert: 'x' } }).state;
                }
            });
            expect(editorDiagnostics.snapshot()[0].counters[`parse.${name}`] || 0).toBe(0);
            expect(editorDiagnostics.snapshot()[0].counters['document.materialize'] || 0).toBe(0);
            expect(documentReads).not.toHaveBeenCalled();
            documentReads.mockRestore();
            expect(state.field(field).blocks.at(-1).source).toBe(original.at(-1).source);
            expect(state.doc.toString()).toBe(source);
            // Mapped decoration ownership still permits local source entry/exit.
            state = state.update({ selection: { anchor: state.field(field).blocks[0].from + 1 } }).state;
            expect(state.field(field).visibleIndices.has(0)).toBe(true);
            state = state.update({ selection: { anchor: 1 } }).state;
            expect(state.field(field).decorations.size).toBe(count);
            // Changing actual Markdown source takes the parser path.
            const start = state.field(field).blocks[0].from;
            state = state.update({ changes: { from: start, to: start + syntax.length, insert: 'plain' } }).state;
            expect(state.field(field).blocks).toHaveLength(count - 1);
        } finally { documentReads.mockRestore(); editorDiagnostics.stop(); }
    });
});


const mappedFixtures = [...fixtures.slice(0, 2), ['code', '```js\nlet value = 1;\n```', () => codeBlockField({})[0]]];
describe.each(mappedFixtures)('%s mapped decoration reuse', (_name, syntax, createField) => {
    test('typing after 1000 previews retains decorations, descriptors and the reveal index', () => {
        const field = createField();
        const source = 'Before prose\n\n' + Array(1000).fill(syntax + '\n\n').join('') + 'After prose.';
        let state = mount(source, field);
        const initial = state.field(field);
        state = state.update({ changes: { from: source.length - 2, insert: 'x' } }).state;
        const next = state.field(field);
        expect(next.blocks).toBe(initial.blocks);
        expect(next.revealIndex).toBe(initial.revealIndex);
        const left = initial.decorations.iter(), right = next.decorations.iter();
        while (left.value) { expect(right.value).toBe(left.value); left.next(); right.next(); }
        expect(right.value).toBeNull();
    });
    test('a mapped edit plus a nonlocal selection hides old source and reveals the new block', () => {
        const field = createField();
        let state = mount('Before prose\n\n' + Array(3).fill(syntax + '\n\n').join('') + 'After prose', field);
        const initial = state.field(field);
        state = state.update({ selection: { anchor: initial.blocks[0].from + 1 } }).state;
        state = state.update({ changes: { from: 2, insert: 'extra ' },
            selection: { anchor: initial.blocks[2].from + 7 } }).state;
        expect(reveals(state.field(field))).toEqual([false, false, true]);
        const third = state.field(field).blocks[2];
        expect(state.sliceDoc(third.from, third.to)).toBe(syntax);
        state = state.update({ selection: { anchor: 1 } }).state;
        expect(state.field(field).decorations.size).toBe(3);
    });
});

test.each([
    ['Plain **bold** prose.', 'prose', 'x', true],
    ['- List prose.', 'prose', 'x', true],
    ['> Quoted prose.', 'prose', 'x', true],
    ['Plain prose.', 'prose', '*', false],
    ['![Alt](image.png) prose.', 'prose', 'x', false],
    ['[ref]: path', 'path', 'x', false],
    ['```js\nlet x = 1;\n```', 'let', 'x', false],
    ['<div>\ntext\n</div>', 'text', 'x', false],
    ['Plain prose.', 'prose', '\n', false],
])('parsed prose guard handles %s', (source, target, insert, expected) => {
    const state = mount(source, codeBlockField({})[0]);
    const transaction = state.update({ changes: { from: source.indexOf(target), insert } });
    expect(canMapMarkdownProseEdit(transaction)).toBe(expected);
});


describe.each(mappedFixtures)('%s mapped edits during a drag', (_name, syntax, createField) => {
    test('refreshes source projection during a drag and restores previews when it settles', () => {
        const field = createField();
        let state = mount('Before prose\n\n' + syntax + '\n\nAfter prose', field);
        state = state.update({ effects: setMouseSelecting.of(true) }).state;
        state = state.update({ changes: { from: 2, insert: 'x' } }).state;
        const dragged = state.field(field);
        for (const cursor = dragged.decorations.iter(); cursor.value; cursor.next()) expect(cursor.value.spec.widget).toBeUndefined();
        state = state.update({ effects: setMouseSelecting.of(false) }).state;
        expect(state.field(field).decorations.iter().value.spec.widget).toBeTruthy();
        expect(state.sliceDoc(state.field(field).blocks[0].from, state.field(field).blocks[0].to)).toBe(syntax);
    });
});

const scopedFixtures = [...mappedFixtures, fixtures[2]];
describe.each(scopedFixtures)('%s scoped block updates', (_name, syntax, createField) => {
    test('heading text and soft Enter/Backspace retain unrelated preview decorations', () => {
        const field = createField();
        const source = '# Heading title\n\nOrdinary paragraph text.\n\n' + Array(100).fill(syntax + '\n\n').join('');
        let state = mount(source, field);
        const original = state.field(field).decorations.iter().value;
        const check = () => {
            const current = state.field(field);
            expect(current.decorations.iter().value).toBe(original);
            const fresh = mount(state.doc.toString(), field).field(field);
            expect(current.blocks.map(({ sourceIdentity, ...block }) => block)).toEqual(fresh.blocks);
        };
        state = state.update({ changes: { from: 5, insert: 'x' } }).state;
        check();
        const at = state.doc.toString().indexOf('paragraph') + 4;
        state = state.update({ changes: { from: at, insert: '\n' } }).state;
        check();
        state = state.update({ changes: { from: at, to: at + 1 } }).state;
        check();
    });
    test('unrelated configuration retains parsed blocks and mounted decorations', () => {
        const field = createField(), config = new Compartment();
        let state = mount('Before prose\n\n' + syntax + '\n\nAfter prose', field, [config.of(EditorState.tabSize.of(4))]);
        const initial = state.field(field);
        state = state.update({ effects: config.reconfigure(EditorState.tabSize.of(8)) }).state;
        expect(state.field(field)).toBe(initial);
    });
});

test.each([
    ['code', '```js\nlet value = 1;\n```', () => codeBlockField({})[0], 'value', 'x'],
    ['tables', '| A | B |\n| - | - |\n| one | two |', fixtures[1][2], 'one', 'x'],
    ['images', '![Alt](image.png)', fixtures[0][2], 'Alt', 'x'],
    ['diagrams', fixtures[2][1], fixtures[2][2], 'TD', 'x'],
])('%s payload edit replaces only its own preview', (_name, syntax, createField, target, insert) => {
    const field = createField();
    const source = 'Before prose\n\n' + Array(30).fill(syntax + '\n\n').join('');
    let state = mount(source, field);
    const original = state.field(field);
    const first = original.decorations.iter().value;
    const last = original.decorations.iter(original.blocks.at(-1).from).value;
    state = state.update({ changes: { from: source.indexOf(target), insert } }).state;
    const changed = state.field(field);
    expect(changed.decorations.iter().value).not.toBe(first);
    expect(changed.decorations.iter(changed.blocks.at(-1).from).value).toBe(last);
    const fresh = mount(state.doc.toString(), field).field(field);
    expect(changed.blocks.map(({ sourceIdentity, ...block }) => block)).toEqual(fresh.blocks);
});

test('prose inside the completed part of a large partial tree maps previews and later parser progress discovers the rest', () => {
    const field = codeBlockField({})[0];
    const source = 'Ordinary opening prose.\n\n' + Array(6000).fill('```js\nlet value = 1;\n```\n\nMore prose.\n\n').join('');
    let state = EditorState.create({ doc: source, extensions: [markdown({ base: markdownLanguage }), collapseOnSelectionFacet.of(true), mouseSelectingField, field] });
    ensureSyntaxTree(state, 10000, 10000);
    state = state.update({}).state;
    const initial = state.field(field);
    expect(initial.blocks.length).toBeGreaterThan(0);
    expect(initial.blocks.length).toBeLessThan(6000);
    const transaction = state.update({ changes: { from: 5, insert: 'x' } });
    expect(canMapMarkdownProseEdit(transaction)).toBe(true);
    state = transaction.state;
    expect(state.field(field).decorations.iter().value).toBe(initial.decorations.iter().value);
    ensureSyntaxTree(state, state.doc.length, 10000);
    state = state.update({}).state;
    expect(state.field(field).blocks).toHaveLength(6000);
});
