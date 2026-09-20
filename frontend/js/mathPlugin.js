import { sourceRevealIndex, updateSourceReveal, mapSourceReveal } from './sourceReveal.js';
import { selectedRangeIndices } from './core/selectionRangeIndex.js';
import { countEditorWork, readEditorDocument } from './editorDiagnostics.js';
/**
 * Math Plugin — renders $inline$ and $$block$$ math using KaTeX
 * Uses StateField (not ViewPlugin) to safely handle block decorations.
 */

import { StateField } from '@codemirror/state';
import { EditorView, WidgetType, Decoration } from '@codemirror/view';
import { markBlockWidget } from './blockWidget.js';
import { mathPreviewBlocks } from './core/mathPreviewModel.js';
import { sourceLineCount } from './core/sourceFootprintModel.js';
import { fitGraphicToSourceFootprint, markSourceFootprint } from './sourceFootprint.js';

class MathWidget extends WidgetType {
    constructor(text, displayMode, sourceLines = 1, sourceText = '') {
        super();
        this.text = text;
        this.displayMode = displayMode;
        this.sourceLines = sourceLines;
        this.sourceText = sourceText;
        this.stopGraphicFit = null;
    }
    eq(other) {
        return other.text === this.text
            && other.displayMode === this.displayMode
            && other.sourceLines === this.sourceLines
            && other.sourceText === this.sourceText;
    }
    toDOM(view) {
        const span = document.createElement(this.displayMode ? 'div' : 'span');
        span.className = this.displayMode ? 'cm-math-block' : 'cm-math-inline';
        const renderTarget = this.displayMode ? document.createElement('div') : span;
        if (this.displayMode) {
            markBlockWidget(span);
            markSourceFootprint(span, {
                kind: 'math',
                lineCount: this.sourceLines,
                lineHeight: view?.defaultLineHeight,
                sourceText: this.sourceText,
            });
            renderTarget.className = 'cm-source-footprint-graphic';
            span.appendChild(renderTarget);
        }
        try {
            if (window.katex) {
                window.katex.render(this.text, renderTarget, { displayMode: this.displayMode, throwOnError: false });
            } else {
                renderTarget.textContent = '$' + this.text + '$';
            }
        } catch (e) {
            renderTarget.textContent = '[Math Error]';
        }
        if (this.displayMode) {
            this.stopGraphicFit?.();
            this.stopGraphicFit = fitGraphicToSourceFootprint(span, span, renderTarget);
        }
        return span;
    }

    destroy() {
        this.stopGraphicFit?.();
    }
}

function mathSourceVisible(state, block) {
    const cursor = state.selection.main.head;
    return cursor >= block.from && cursor <= block.to;
}

function mathBlockDecorations(state, block, visible) {
    if (visible) return [];
    return [Decoration.replace({
        widget: new MathWidget(block.text, block.displayMode,
            block.displayMode ? sourceLineCount(state.doc, block.from, block.to) : 1,
            block.displayMode ? block.source : ''),
        block: block.displayMode, sourceBlock: block.sourceIdentity || block,
    }).range(block.from, block.to)];
}

function buildMathState(state, blocks) {
    if (!blocks) {
        countEditorWork('parse.math');
        blocks = mathPreviewBlocks(readEditorDocument(state.doc, 'math'));
    }
    const visibleIndices = new Set();
    const decorations = blocks.flatMap((block, index) => {
        const visible = mathSourceVisible(state, block);
        if (visible) visibleIndices.add(index);
        return mathBlockDecorations(state, block, visible);
    });
    return {
        decorations: Decoration.set(decorations, true),
        ranges: blocks.map(({ from, to }) => ({ from, to })),
        blocks, visibleIndices, revealIndex: sourceRevealIndex(blocks),
    };
}

function changesNeedMathRescan(value, transaction) {
    let needsRescan = false;
    transaction.changes.iterChanges((fromA, toA, fromB, toB) => {
        if (needsRescan) return;
        const before = transaction.startState.doc.sliceString(fromA, toA);
        const after = transaction.state.doc.sliceString(fromB, toB);
        if (/[$\n]/u.test(before) || /[$\n]/u.test(after)) {
            needsRescan = true;
            return;
        }
        if (selectedRangeIndices(value.revealIndex, [{ from: fromA, to: toA }]).indices.size) {
            needsRescan = true;
        }
    });
    return needsRescan;
}

function mapMathState(value, transaction) {
    let afterMath = true;
    transaction.changes.iterChangedRanges(from => {
        if (from <= (value.revealIndex?.maxTo ?? -1)) afterMath = false;
    });
    if (afterMath) return value;
    const mapped = mapSourceReveal(value, transaction);
    return { ...mapped, ranges: mapped.blocks === value.blocks ? value.ranges
        : mapped.blocks.map(({ from, to }) => ({ from, to })) };
}

export const mathField = StateField.define({
    create(state) {
        return buildMathState(state);
    },
    update(value, transaction) {
        if (transaction.docChanged) {
            if (changesNeedMathRescan(value, transaction)) return buildMathState(transaction.state);
            const mapped = mapMathState(value, transaction);
            return updateSourceReveal(mapped, transaction,
                (state, from, to) => mathSourceVisible(state, { from, to }), mathBlockDecorations,
                state => [{ from: state.selection.main.head, to: state.selection.main.head }]);
        }
        if (!transaction.selection) return value;

        const headRange = state => [{ from: state.selection.main.head, to: state.selection.main.head }];
        return updateSourceReveal(value, transaction,
            (state, from, to) => mathSourceVisible(state, { from, to }), mathBlockDecorations, headRange);
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations)
});
