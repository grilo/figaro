import { GutterMarker, gutter } from '@codemirror/view';
import {
    relativeLineNumberLabel,
    relativeLineNumberSpacerLabel,
} from './core/relativeLineNumberModel.js';

class RelativeLineNumberMarker extends GutterMarker {
    constructor(label) {
        super();
        this.label = label;
    }

    eq(other) {
        return this.label === other.label;
    }

    toDOM() {
        return document.createTextNode(this.label);
    }
}

/**
 * Show distances from the primary cursor line while keeping that line blank.
 * CodeMirror calls lineMarker only for rendered rows, and selection changes
 * redraw that bounded viewport rather than scanning the complete document.
 */
export function relativeLineNumbers() {
    let cachedState = null;
    let cachedCursorLine = 1;
    const cursorLine = state => {
        if (cachedState !== state) {
            cachedState = state;
            cachedCursorLine = state.doc.lineAt(state.selection.main.head).number;
        }
        return cachedCursorLine;
    };
    const spacer = lineCount => new RelativeLineNumberMarker(
        relativeLineNumberSpacerLabel(lineCount),
    );

    return gutter({
        class: 'cm-lineNumbers',
        lineMarker(view, line) {
            const lineNumber = view.state.doc.lineAt(line.from).number;
            return new RelativeLineNumberMarker(
                relativeLineNumberLabel(lineNumber, cursorLine(view.state)),
            );
        },
        lineMarkerChange: update => update.selectionSet || update.docChanged,
        initialSpacer: view => spacer(view.state.doc.lines),
        updateSpacer(current, update) {
            const next = spacer(update.state.doc.lines);
            return current.eq(next) ? current : next;
        },
    });
}

export default relativeLineNumbers;
