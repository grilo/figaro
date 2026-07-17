/**
 * Math Plugin — renders $inline$ and $$block$$ math using KaTeX
 * Uses StateField (not ViewPlugin) to safely handle block decorations.
 */

import { StateField } from '@codemirror/state';
import { EditorView, WidgetType, Decoration } from '@codemirror/view';
import { markBlockWidget } from './blockWidget.js';

class MathWidget extends WidgetType {
    constructor(text, displayMode) {
        super();
        this.text = text;
        this.displayMode = displayMode;
    }
    eq(other) { return other.text === this.text && other.displayMode === this.displayMode; }
    toDOM() {
        const span = document.createElement('span');
        span.className = this.displayMode ? 'cm-math-block' : 'cm-math-inline';
        if (this.displayMode) markBlockWidget(span);
        try {
            if (window.katex) {
                window.katex.render(this.text, span, { displayMode: this.displayMode, throwOnError: false });
            } else {
                span.textContent = '$' + this.text + '$';
            }
        } catch (e) {
            span.textContent = '[Math Error]';
        }
        return span;
    }
}

function buildMathState(state) {
    const decorations = [];
    const ranges = [];
    const doc = state.doc;
    const cursor = state.selection.main.head;
    const text = doc.toString();

    // Block math: $$...$$
    const blockRe = /\$\$\s*([\s\S]*?)\s*\$\$/g;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        ranges.push({ from: start, to: end });
        if (cursor >= start && cursor <= end) continue;
        if (m[1].includes('\n') || m[0].includes('\n')) {
            // Multi-line block: use StateField-provided decoration (safe for line breaks)
            decorations.push(Decoration.replace({
                widget: new MathWidget(m[1], true),
                block: true
            }).range(start, end));
        } else {
            decorations.push(Decoration.replace({
                widget: new MathWidget(m[1], false)
            }).range(start, end));
        }
    }

    // Inline math: $...$ (single-line, not inside code blocks)
    // Only match simple inline math that doesn't span lines
    const lines = text.split('\n');
    let pos = 0;
    for (const line of lines) {
        const inlineRe = /\$([^$\n]+)\$/g;
        while ((m = inlineRe.exec(line)) !== null) {
            const start = pos + m.index;
            const end = start + m[0].length;
            ranges.push({ from: start, to: end });
            if (cursor >= start && cursor <= end) continue;
            decorations.push(Decoration.replace({
                widget: new MathWidget(m[1], false)
            }).range(start, end));
        }
        pos += line.length + 1;
    }

    return {
        decorations: Decoration.set(decorations, true),
        ranges,
    };
}

function selectionTouchesRanges(selection, ranges) {
    return selection?.ranges?.some(selectionRange => ranges.some(range =>
        selectionRange.from <= range.to && selectionRange.to >= range.from
    ));
}

function selectionMayContainMathDelimiter(state, selection) {
    return selection?.ranges?.some(range => {
        const start = state.doc.lineAt(range.from).text;
        const end = state.doc.lineAt(range.to).text;
        return start.includes('$') || end.includes('$');
    });
}

function changesNeedMathRescan(value, transaction) {
    let needsRescan = false;
    transaction.changes.iterChanges((fromA, toA, fromB, toB) => {
        if (needsRescan) return;
        const before = transaction.startState.doc.sliceString(fromA, toA);
        const after = transaction.state.doc.sliceString(fromB, toB);
        if (before.includes('$') || after.includes('$')) {
            needsRescan = true;
            return;
        }
        if (value.ranges.some(range => fromA <= range.to && toA >= range.from)) {
            needsRescan = true;
        }
    });
    return needsRescan;
}

function mapMathState(value, changes) {
    return {
        decorations: value.decorations.map(changes),
        ranges: value.ranges.map(range => ({
            from: changes.mapPos(range.from, -1),
            to: changes.mapPos(range.to, 1),
        })),
    };
}

export const mathField = StateField.define({
    create(state) {
        return buildMathState(state);
    },
    update(value, transaction) {
        if (transaction.docChanged) {
            if (changesNeedMathRescan(value, transaction)) return buildMathState(transaction.state);
            return mapMathState(value, transaction.changes);
        }
        if (!transaction.selection) return value;

        const selectionTouchesKnownMath = selectionTouchesRanges(transaction.startState.selection, value.ranges)
            || selectionTouchesRanges(transaction.state.selection, value.ranges);
        if (selectionTouchesKnownMath
            || selectionMayContainMathDelimiter(transaction.startState, transaction.startState.selection)
            || selectionMayContainMathDelimiter(transaction.state, transaction.state.selection)) {
            return buildMathState(transaction.state);
        }
        return value;
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations)
});
