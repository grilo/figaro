import { undo } from '@codemirror/commands';

import {
    createEditorView,
    getEditorContent,
    initEditor,
    setEditorContent,
} from '../frontend/js/editor.js';

function press(view, key, options = {}) {
    const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        ...options,
    });
    view.contentDOM.dispatchEvent(event);
    return event;
}

describe('Markdown formatting keymap', () => {
    let view;

    beforeAll(async () => {
        await initEditor();
    });

    beforeEach(() => {
        view = createEditorView();
    });

    afterEach(() => {
        view.destroy();
    });

    test.each([
        ['b', {}, '**word**'],
        ['i', {}, '*word*'],
        ['k', {}, '[word]()'],
        ['x', { shiftKey: true }, '~~word~~'],
        ['`', {}, '`word`'],
    ])('applies Ctrl/Cmd+%s as one undoable Markdown edit', async (key, options, expected) => {
        setEditorContent('word');
        await new Promise(resolve => setTimeout(resolve, 0));
        view.dispatch({ selection: { anchor: 0, head: 4 } });

        const event = press(view, key, options);

        expect(event.defaultPrevented).toBe(true);
        expect(getEditorContent()).toBe(expected);
        expect(undo(view)).toBe(true);
        expect(getEditorContent()).toBe('word');
    });

    test('keeps vertical cursor motion and selections stable around formatted lines', async () => {
        setEditorContent('first\nmiddle\nlast');
        await new Promise(resolve => setTimeout(resolve, 0));
        const middleFrom = getEditorContent().indexOf('middle');
        view.dispatch({ selection: { anchor: middleFrom, head: middleFrom + 6 } });
        press(view, 'b');

        const formatted = getEditorContent();
        const firstLine = view.state.doc.line(1);
        view.dispatch({ selection: { anchor: firstLine.from } });
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowDown', bubbles: true, cancelable: true,
        }));
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2);
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowDown', bubbles: true, cancelable: true,
        }));
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3);
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowUp', bubbles: true, cancelable: true,
        }));
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2);
        view.dispatch({ selection: { anchor: formatted.indexOf('middle'), head: formatted.indexOf('middle') + 6 } });

        expect(view.state.sliceDoc(
            view.state.selection.main.from,
            view.state.selection.main.to,
        )).toBe('middle');
    });
});
