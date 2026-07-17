import { colorTheme } from '@uiw/codemirror-extensions-color';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';

const hexBodyPattern = /^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const candidatePattern = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})/gi;
const tokenCharacterPattern = /[a-z0-9_#-]/i;

export function isHexColorToken(value) {
    return typeof value === 'string'
        && value.startsWith('#')
        && hexBodyPattern.test(value.slice(1));
}

export function findHexColors(text, offset = 0) {
    const source = String(text || '');
    const matches = [];
    candidatePattern.lastIndex = 0;

    let match;
    while ((match = candidatePattern.exec(source)) !== null) {
        const previous = match.index > 0 ? source[match.index - 1] : '';
        const nextIndex = match.index + match[0].length;
        const next = nextIndex < source.length ? source[nextIndex] : '';
        if ((previous && tokenCharacterPattern.test(previous))
            || (next && tokenCharacterPattern.test(next))) continue;

        matches.push({
            from: offset + match.index,
            to: offset + nextIndex,
            value: match[0],
        });
    }
    return matches;
}

export function pickerColorForToken(token) {
    if (!isHexColorToken(token)) return '#000000';
    const body = token.slice(1);
    if (body.length === 3 || body.length === 4) {
        return `#${body.slice(0, 3).split('').map(character => character.repeat(2)).join('')}`.toLowerCase();
    }
    return `#${body.slice(0, 6)}`.toLowerCase();
}

export function replacementForPickedColor(token, pickedColor) {
    if (!isHexColorToken(token) || !/^#[0-9a-f]{6}$/i.test(String(pickedColor || ''))) return token;
    const body = token.slice(1);
    const rgb = pickedColor.toLowerCase();
    if (body.length === 4) return `${rgb}${body[3].repeat(2).toLowerCase()}`;
    if (body.length === 8) return `${rgb}${body.slice(6).toLowerCase()}`;
    return rgb;
}

class HexColorWidget extends WidgetType {
    constructor({ from, to, token, readOnly }) {
        super();
        this.from = from;
        this.to = to;
        this.token = token;
        this.readOnly = readOnly;
    }

    eq(other) {
        return other.from === this.from
            && other.to === this.to
            && other.token === this.token
            && other.readOnly === this.readOnly;
    }

    toDOM(view) {
        const wrapper = document.createElement('span');
        wrapper.className = 'cm-hex-color-widget';
        wrapper.dataset.color = this.token;
        wrapper.style.backgroundColor = this.token;
        wrapper.title = `Choose a replacement for ${this.token}`;

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.className = 'cm-hex-color-picker';
        picker.value = pickerColorForToken(this.token);
        picker.disabled = this.readOnly;
        picker.setAttribute('aria-label', `Choose color for ${this.token}`);
        picker.addEventListener('change', event => {
            if (view.state.readOnly) return;
            const replacement = replacementForPickedColor(this.token, event.currentTarget.value);
            if (replacement === this.token) return;
            view.dispatch({
                changes: { from: this.from, to: this.to, insert: replacement },
                userEvent: 'input',
            });
        });
        wrapper.appendChild(picker);
        return wrapper;
    }

    ignoreEvent() {
        return false;
    }
}

function colorDecorations(view) {
    const decorations = [];
    const readOnly = view.state.readOnly;
    for (const { from, to } of view.visibleRanges) {
        // Include enough context to validate token boundaries even when a
        // viewport starts or ends beside a color literal.
        const scanFrom = Math.max(0, from - 1);
        const scanTo = Math.min(view.state.doc.length, to + 10);
        const source = view.state.doc.sliceString(scanFrom, scanTo);
        for (const color of findHexColors(source, scanFrom)) {
            if (color.from < from || color.from >= to) continue;
            decorations.push(Decoration.widget({
                widget: new HexColorWidget({ ...color, token: color.value, readOnly }),
                side: -1,
            }).range(color.from));
        }
    }
    return Decoration.set(decorations, true);
}

const hexColorView = ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = colorDecorations(view);
    }

    update(update) {
        if (update.docChanged
            || update.viewportChanged
            || update.startState.readOnly !== update.state.readOnly) {
            this.decorations = colorDecorations(update.view);
        }
    }
}, { decorations: plugin => plugin.decorations });

export const hexColorExtension = [hexColorView, colorTheme];
