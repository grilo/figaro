import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
    findHexColors,
    hexColorExtension,
    isHexColorToken,
    pickerColorForToken,
    replacementForPickedColor,
} from '../frontend/js/hexColorPlugin.js';

describe('strict hex-color picker extension', () => {
    let view;

    afterEach(() => {
        view?.destroy();
        view = null;
        document.body.innerHTML = '';
    });

    function createView(doc, extensions = []) {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        view = new EditorView({
            parent,
            state: EditorState.create({ doc, extensions: [hexColorExtension, ...extensions] }),
        });
        return view;
    }

    test('accepts only standalone CSS hex forms and gives ambiguous hashtags to colors', () => {
        const source = '#000 #abcd #A1b2C3 #0102037f #bad #urgent word#abc ##abc #abc-topic #12345 #1234567';
        expect(findHexColors(source).map(match => match.value)).toEqual([
            '#000', '#abcd', '#A1b2C3', '#0102037f', '#bad',
        ]);
        expect(isHexColorToken('#bad')).toBe(true);
        expect(isHexColorToken('#urgent')).toBe(false);
        expect(isHexColorToken('#12345')).toBe(false);
    });

    test('normalizes native picker values and preserves existing alpha channels', () => {
        expect(pickerColorForToken('#abc')).toBe('#aabbcc');
        expect(pickerColorForToken('#abcd')).toBe('#aabbcc');
        expect(pickerColorForToken('#A1B2C3D4')).toBe('#a1b2c3');
        expect(replacementForPickedColor('#abc', '#102030')).toBe('#102030');
        expect(replacementForPickedColor('#abcd', '#102030')).toBe('#102030dd');
        expect(replacementForPickedColor('#A1B2C3D4', '#102030')).toBe('#102030d4');
        expect(replacementForPickedColor('#urgent', '#102030')).toBe('#urgent');
    });

    test('renders accessible pickers, changes only the selected token, and cancels non-destructively', () => {
        const editor = createView('Primary #000000; overlay #abcd; tag #urgent');
        const pickers = editor.dom.querySelectorAll('.cm-hex-color-picker');
        expect(pickers).toHaveLength(2);
        expect(pickers[0].getAttribute('aria-label')).toBe('Choose color for #000000');
        expect(editor.state.doc.toString()).toBe('Primary #000000; overlay #abcd; tag #urgent');

        // Opening/focusing and leaving the native picker without a change is cancellation.
        pickers[0].focus();
        pickers[0].blur();
        expect(editor.state.doc.toString()).toBe('Primary #000000; overlay #abcd; tag #urgent');

        pickers[1].value = '#123456';
        pickers[1].dispatchEvent(new Event('change', { bubbles: true }));
        expect(editor.state.doc.toString()).toBe('Primary #000000; overlay #123456dd; tag #urgent');
        expect(editor.dom.querySelectorAll('.cm-hex-color-picker')).toHaveLength(2);
    });

    test('disables picker edits when an existing editor becomes read-only', () => {
        const readOnly = new Compartment();
        const editor = createView('Locked #123456', [readOnly.of([])]);
        editor.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(true)) });
        const picker = editor.dom.querySelector('.cm-hex-color-picker');
        expect(picker).not.toBeNull();
        expect(picker.disabled).toBe(true);
        picker.value = '#abcdef';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        expect(editor.state.doc.toString()).toBe('Locked #123456');
    });
});
