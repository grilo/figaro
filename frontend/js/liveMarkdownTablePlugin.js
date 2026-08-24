/**
 * Source-preserving live GFM table previews.
 *
 * CodeMirror's Markdown language parser owns the syntax awareness. This field
 * only replaces an otherwise unfocused table range with a read-only semantic
 * table; selecting the range restores the original Markdown for editing.
 */
import { ensureSyntaxTree, foldedRanges, syntaxTree } from '@codemirror/language';
import { renderMarkdownTable } from './markdownTableRenderer.js';
import { wrapBlockWidget } from './blockWidget.js';
import { markSourceFootprint } from './sourceFootprint.js';
import { tablePreviewOwnsInteraction } from './core/tablePreviewInteractionModel.js';

function tableSourceLines(state, from, to) {
    return state.doc.lineAt(to).number - state.doc.lineAt(from).number + 1;
}

/**
 * Keep scrolling gestures and the native scrollbar owned by the rendered
 * preview. Pointer events on actual table content still fall through to
 * CodeMirror so a deliberate cell click reveals the Markdown source.
 */
export function tablePreviewOwnsEvent(event) {
    const target = event?.target;
    const root = target?.closest?.('.cm-block-widget--table');
    const surface = root?.querySelector?.('.cm-live-table');
    if (!root || !surface) return false;
    const rect = surface.getBoundingClientRect?.();
    return tablePreviewOwnsInteraction({
        type: String(event.type || ''),
        pointerType: event.pointerType,
        targetKind: target === root ? 'root' : target === surface ? 'surface' : 'content',
        clientX: event.clientX,
        clientY: event.clientY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        rect,
        clientWidth: surface.clientWidth,
        clientHeight: surface.clientHeight,
        scrollWidth: surface.scrollWidth,
        scrollHeight: surface.scrollHeight,
    });
}

function protectTablePreviewScrolling(root) {
    const stopScrollEventAtWidget = event => {
        if (!tablePreviewOwnsEvent(event)) return;
        event.stopPropagation();
        if (event.type === 'selectstart') event.preventDefault();
    };
    for (const type of ['pointerdown', 'mousedown', 'click', 'wheel', 'touchstart', 'touchmove', 'selectstart']) {
        root.addEventListener(type, stopScrollEventAtWidget);
    }
}

/** Return top-level GFM table ranges from CodeMirror's Markdown syntax tree. */
export function scanMarkdownTables(state) {
    const tree = ensureSyntaxTree(state, state.doc.length) || syntaxTree(state);
    const tables = [];
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
        if (node.name !== 'Table') continue;
        tables.push({
            from: node.from,
            to: node.to,
            source: state.sliceDoc(node.from, node.to),
            sourceLines: tableSourceLines(state, node.from, node.to),
        });
    }
    return tables;
}

function createMarkdownTableWidget(WidgetType) {
    return class MarkdownTableWidget extends WidgetType {
        constructor(source, sourceLines) {
            super();
            this.source = source;
            this.sourceLines = sourceLines;
        }

        eq(other) {
            return other instanceof MarkdownTableWidget
                && other.source === this.source
                && other.sourceLines === this.sourceLines;
        }

        toDOM(view) {
            const ownerDocument = view?.dom?.ownerDocument || globalThis.document;
            const surface = ownerDocument.createElement('div');
            surface.className = 'cm-live-table';
            surface.setAttribute('aria-label', 'Rendered Markdown table');

            const wrapper = wrapBlockWidget(surface, 'cm-block-widget--table');
            protectTablePreviewScrolling(wrapper);
            markSourceFootprint(wrapper, {
                kind: 'table',
                lineCount: this.sourceLines,
                lineHeight: view?.defaultLineHeight,
                sourceText: this.source,
            });

            try {
                const table = renderMarkdownTable(this.source, ownerDocument);
                if (table) {
                    surface.append(table);
                } else {
                    surface.textContent = this.source;
                    wrapper.dataset.sourceFootprintState = 'underflow';
                }
            } catch (_) {
                // A renderer failure must never hide authored Markdown.
                surface.textContent = this.source;
                wrapper.dataset.sourceFootprintState = 'underflow';
            }
            return wrapper;
        }

        // Cell content remains an edit affordance, while the scroll surface
        // and its native scrollbars must not move the editor selection.
        ignoreEvent(event) {
            return tablePreviewOwnsEvent(event);
        }
    };
}

function sourceRangeIsFolded(state, block) {
    const foldFrom = state.doc.lineAt(block.from).to;
    let found = false;
    foldedRanges(state).between(foldFrom, block.to, (from, to) => {
        if (from === foldFrom && to === block.to) found = true;
    });
    return found;
}

function selectionTouchesRanges(selection, ranges) {
    return selection?.ranges?.some(selectionRange => ranges.some(range => (
        selectionRange.from <= range.to && selectionRange.to >= range.from
    )));
}

/** Build the live-preview state field for source-preserving Markdown tables. */
export function createMarkdownTableField(
    StateField,
    EditorView,
    Decoration,
    WidgetType,
    shouldShowSource,
    mouseSelectingField,
) {
    const MarkdownTableWidget = createMarkdownTableWidget(WidgetType);

    const buildState = state => {
        const decorations = [];
        const ranges = [];
        const isDragging = state.field(mouseSelectingField, false);
        const blocks = scanMarkdownTables(state);

        for (const block of blocks) {
            ranges.push({ from: block.from, to: block.to });
            if (isDragging
                || shouldShowSource(state, block.from, block.to)
                || sourceRangeIsFolded(state, block)) continue;
            decorations.push(Decoration.replace({
                widget: new MarkdownTableWidget(block.source, block.sourceLines),
                block: true,
            }).range(block.from, block.to));
        }

        return {
            decorations: decorations.length
                ? Decoration.set(decorations, true)
                : Decoration.none,
            ranges,
        };
    };

    return StateField.define({
        create: buildState,
        update(value, transaction) {
            if (transaction.docChanged || transaction.reconfigured) {
                return buildState(transaction.state);
            }

            const isDragging = transaction.state.field(mouseSelectingField, false);
            const wasDragging = transaction.startState.field(mouseSelectingField, false);
            if (wasDragging && !isDragging) return buildState(transaction.state);
            if (isDragging) return value;
            if (foldedRanges(transaction.startState) !== foldedRanges(transaction.state)) {
                return buildState(transaction.state);
            }
            if (transaction.selection && (
                selectionTouchesRanges(transaction.startState.selection, value.ranges)
                || selectionTouchesRanges(transaction.state.selection, value.ranges)
            )) return buildState(transaction.state);
            return value;
        },
        provide: field => EditorView.decorations.from(field, value => value.decorations),
    });
}
