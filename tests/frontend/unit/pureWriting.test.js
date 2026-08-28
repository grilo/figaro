import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cursorLineDown, cursorLineUp } from '@codemirror/commands';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { createPureWritingExtension, refreshPureWriting } from '../frontend/js/pureWriting.js';

describe('Pure writing CodeMirror presentation', () => {
    let view;
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
        view = new EditorView({
            parent: document.getElementById('editor'),
            state: EditorState.create({
                doc: 'First paragraph stays in context.\n\nSecond phrase. Another phrase here.\n\nThird paragraph.',
                selection: { anchor: 43 },
                extensions: [
                    markdownLanguage,
                    EditorView.lineWrapping,
                    createPureWritingExtension({
                        isPureActive: () => pureActive,
                        isMarkdown: () => true,
                        typewriterEnabled: () => typewriterEnabled,
                        focusScope: () => focusScope,
                        adaptiveTypographyEnabled: () => false,
                        pointerSelecting: () => pointerSelecting,
                        searchOpen: () => searchOpen,
                    }),
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
});
