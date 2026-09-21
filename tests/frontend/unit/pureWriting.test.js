import { EditorState, Transaction } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { cursorLineDown, cursorLineUp } from '@codemirror/commands';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { createPureWritingExtension, refreshPureWriting } from '../frontend/js/pureWriting.js';

describe('Pure writing CodeMirror presentation', () => {
    let view;
    let pureExtension;
    let pureActive;
    let typewriterEnabled;
    let focusScope;
    let searchOpen;
    let pointerSelecting;

    beforeEach(() => {
        document.body.innerHTML = '<div id="app" class="pure-editing-chrome"><div id="editor"></div></div>';
        pureActive = true;
        typewriterEnabled = true;
        focusScope = 'paragraph';
        searchOpen = false;
        pointerSelecting = false;
        pureExtension = createPureWritingExtension({
            isPureActive: () => pureActive,
            isMarkdown: () => true,
            typewriterEnabled: () => typewriterEnabled,
            focusScope: () => focusScope,
            adaptiveTypographyEnabled: () => false,
            pointerSelecting: () => pointerSelecting,
            searchOpen: () => searchOpen,
        });
        view = new EditorView({
            parent: document.getElementById('editor'),
            state: EditorState.create({
                doc: 'First paragraph stays in context.\n\nSecond phrase. Another phrase here.\n\nThird paragraph.',
                selection: { anchor: 43 },
                extensions: [
                    markdownLanguage,
                    EditorView.lineWrapping,
                    pureExtension,
                ],
            }),
        });
    });

    afterEach(() => view?.destroy());

    test('dims surrounding paragraphs while preserving normal cursor movement', () => {
        refreshPureWriting(view);
        expect(view.dom.classList.contains('cm-pure-writing')).toBe(true);
        expect(view.dom.classList.contains('cm-pure-typewriter')).toBe(true);
        expect(view.dom.querySelectorAll('.cm-pure-focus-dimmed').length).toBeGreaterThan(0);

        const original = view.state.selection.main.head;
        expect(cursorLineDown(view)).toBe(true);
        const afterDown = view.state.selection.main.head;
        expect(afterDown).toBeGreaterThan(original);
        expect(cursorLineUp(view)).toBe(true);
        expect(view.state.selection.main.head).toBeLessThan(afterDown);
    });

    test('uses a sentence-like phrase range and suspends dimming for selection and Find', () => {
        focusScope = 'phrase';
        refreshPureWriting(view);
        expect(view.dom.querySelectorAll('.cm-pure-focus-dimmed').length).toBeGreaterThan(0);

        view.dispatch({ selection: { anchor: 35, head: 68 }, userEvent: 'select' });
        expect(view.dom.querySelector('.cm-pure-focus-dimmed')).toBeNull();

        view.dispatch({ selection: { anchor: 43 } });
        searchOpen = true;
        refreshPureWriting(view);
        expect(view.dom.querySelector('.cm-pure-focus-dimmed')).toBeNull();
    });

    test('keeps normal mode unchanged and restores Pure presentation reactively', () => {
        pureActive = false;
        refreshPureWriting(view);
        expect(view.dom.classList.contains('cm-pure-writing')).toBe(false);
        expect(view.dom.classList.contains('cm-pure-typewriter')).toBe(false);
        expect(view.dom.querySelector('.cm-pure-focus-dimmed')).toBeNull();

        pureActive = true;
        typewriterEnabled = false;
        view.dispatch({
            changes: { from: view.state.doc.length, insert: '!' },
            annotations: Transaction.userEvent.of('input.type'),
        });
        expect(view.dom.classList.contains('cm-pure-writing')).toBe(true);
        expect(view.dom.classList.contains('cm-pure-typewriter')).toBe(false);
    });
    test('cursor motion reuses focus and avoids whole-document conversion and presentation writes', () => {
        focusScope = 'phrase';
        refreshPureWriting(view);
        const plugin = view.plugin(pureExtension);
        const decorations = plugin.decorations;
        const phrases = plugin.focusCache.phrases;
        const stringRead = jest.spyOn(view.state.doc, 'toString');
        const styleWrite = jest.spyOn(view.dom.style, 'setProperty');
        try {
            for (const head of [44, 45, 46, 47, 46, 45, 44]) view.dispatch({ selection: { anchor: head } });
            expect(plugin.decorations).toBe(decorations);
            expect(plugin.focusCache.phrases).toBe(phrases);
            expect(stringRead).not.toHaveBeenCalled();
            expect(styleWrite.mock.calls.filter(([name]) => name.startsWith('--pure-'))).toEqual([]);
            view.dispatch({ selection: { anchor: 60 } });
            expect(plugin.focusCache.phrases).toBe(phrases);
            expect(plugin.decorations).not.toBe(decorations);
            expect(plugin.focusRange.from).toBeGreaterThan(43);
        } finally {
            stringRead.mockRestore(); styleWrite.mockRestore();
        }
        view.dispatch({ changes: { from: 40, insert: 'new ' } });
        expect(plugin.focusCache.phrases).not.toBe(phrases);
    });

    test('typing avoids presentation writes while explicit appearance refresh still applies', () => {
        const write = jest.spyOn(view.dom.style, 'setProperty');
        try {
            for (let index = 0; index < 10; index++) view.dispatch({ changes: { from: 43, insert: 'x' }, userEvent: 'input.type' });
            expect(write).not.toHaveBeenCalled();
            refreshPureWriting(view);
            expect(write).toHaveBeenCalled();
        } finally { write.mockRestore(); }
    });

    test('Pure cursor motion queries cached phrases without reading every sentence', () => {
        focusScope = 'phrase';
        const source = Array(1000).fill('One ordinary sentence. ').join('');
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source }, selection: { anchor: 2 } });
        refreshPureWriting(view);
        const plugin = view.plugin(pureExtension), phrases = plugin.focusCache.phrases;
        expect(phrases.ranges.length).toBe(1000);
        let reads = 0;
        for (const range of phrases.ranges) for (const key of ['from', 'to']) {
            const value = range[key];
            Object.defineProperty(range, key, { get() { reads++; return value; } });
        }
        for (let index = 0; index < 20; index++) view.dispatch({ selection: { anchor: 2 + index % 5 } });
        expect(plugin.focusCache.phrases).toBe(phrases);
        expect(reads).toBeLessThan(500);
        expect(plugin.focusRange).toEqual({ from: 0, to: 23 });
    });

    test('focus follows nested list structure and removes dimming during pointer selection', () => {
        const source = '- Parent text\n  - Child text\n\nOutside';
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source }, selection: { anchor: 4 } });
        const plugin = view.plugin(pureExtension);
        const parent = plugin.focusRange;
        view.dispatch({ selection: { anchor: source.indexOf('Child') + 2 } });
        expect(plugin.focusRange.from).toBeGreaterThan(parent.from);
        pointerSelecting = true;
        refreshPureWriting(view);
        expect(plugin.decorations).toBe(Decoration.none);
        pointerSelecting = false;
        refreshPureWriting(view);
        expect(plugin.focusRange).not.toBeNull();
    });

    test('caret-start styling still follows navigation and resize refreshes typewriter padding', () => {
        view.dispatch({ selection: { anchor: 1 } });
        expect(view.dom.classList.contains('cm-pure-caret-at-start')).toBe(true);
        view.dispatch({ selection: { anchor: 43 } });
        expect(view.dom.classList.contains('cm-pure-caret-at-start')).toBe(false);
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, value: 800 });
        refreshPureWriting(view);
        expect(parseFloat(view.dom.style.getPropertyValue('--pure-typewriter-top-space'))).toBeGreaterThan(300);
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, value: 400 });
        view.plugin(pureExtension).syncGeometry();
        expect(parseFloat(view.dom.style.getPropertyValue('--pure-typewriter-top-space'))).toBeLessThan(170);
    });

    test('focus and background updates preserve Pure layout classes', () => {
        view.dispatch({ selection: { anchor: 1 } });
        refreshPureWriting(view);
        const expectPresentation = () => {
            expect(view.dom.classList.contains('cm-pure-writing')).toBe(true);
            expect(view.dom.classList.contains('cm-pure-typewriter')).toBe(true);
            expect(view.dom.classList.contains('cm-pure-caret-at-start')).toBe(true);
        };
        expectPresentation();
        view.focus();
        view.update([]);
        expectPresentation();
        view.contentDOM.blur();
        view.update([]);
        expectPresentation();
        view.dispatch({ changes: { from: view.state.doc.length, insert: '\nBackground text' } });
        expectPresentation();
    });

});
