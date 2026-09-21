import { sourceRevealIndex, updateSourceReveal, patchSourceReveal } from './sourceReveal.js';
import { canMapMarkdownProseEdit, markdownProjectionEdit, collapseOnSelectionFacet } from 'codemirror-live-markdown';
import { countEditorWork } from './editorDiagnostics.js';
/**
 * Source-preserving live GFM table previews.
 *
 * CodeMirror's Markdown language parser owns the syntax awareness. This field
 * only replaces an otherwise unfocused table range with a read-only semantic
 * table; selecting the range restores the original Markdown for editing.
 */
import { foldedRanges, syntaxTree } from '@codemirror/language';
import { renderMarkdownTable } from './markdownTableRenderer.js';
import { createDOMPreviewCache } from './domPreviewCache.js';
import { wrapBlockWidget } from './blockWidget.js';
import { markSourceFootprint } from './sourceFootprint.js';
import { tablePreviewOwnsInteraction } from './core/tablePreviewInteractionModel.js';
import { markdownTableCellCursorOffset } from './core/markdownTableEditing.js';
import { markdownTableMetadataEnd } from './core/markdownTableEditorModel.js';

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

/** Resolve the mounted decoration, including after edits before a retained widget. */
export function renderedTableSourceRange(view, root) {
    if (!root || typeof root._figaroTableSource !== 'string') return null;
    try {
        const from = view.posAtDOM(root, 0);
        return Number.isInteger(from) ? { from, to: from + root._figaroTableSource.length } : null;
    } catch { return null; }
}

/** Map primary clicks and drags that start in a rendered cell back to source. */
export function renderedTableCellMouseSelection(view, event, EditorSelection) {
    if (event?.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
    const cell = event.target?.closest?.('th[data-figaro-source-row], td[data-figaro-source-row]');
    const root = cell?.closest?.('.cm-block-widget--table');
    const range = renderedTableSourceRange(view, root);
    if (!cell || !range) return null;
    const { from, to } = range;

    const source = view.state.sliceDoc(from, to);
    const offset = markdownTableCellCursorOffset(
        source,
        Number(cell.dataset.figaroSourceRow),
        Number(cell.dataset.figaroSourceColumn),
    );
    if (!Number.isInteger(offset)) return null;

    let anchor = from + offset;
    const originX = Number(event.clientX) || 0;
    const originY = Number(event.clientY) || 0;
    return {
        get(currentEvent) {
            let head = anchor;
            const moved = currentEvent !== event && (
                Math.abs((Number(currentEvent?.clientX) || 0) - originX) > 2
                || Math.abs((Number(currentEvent?.clientY) || 0) - originY) > 2
            );
            if (moved) {
                const position = view.posAtCoords({
                    x: Number(currentEvent.clientX) || 0,
                    y: Number(currentEvent.clientY) || 0,
                });
                if (Number.isInteger(position)) head = position;
            }
            return EditorSelection.single(anchor, head);
        },
        update(update) {
            if (update.docChanged) anchor = update.changes.mapPos(anchor);
        },
    };
}

/** Return top-level GFM table ranges from CodeMirror's Markdown syntax tree. */
export function scanMarkdownTables(state, regions = null) {
    countEditorWork('parse.tables');
    const tables = [];
    for (const region of regions || [{ nextFrom: 0, nextTo: state.doc.length }]) {
        syntaxTree(state).iterate({ from: region.nextFrom, to: region.nextTo, enter(node) {
            if (node.to <= region.nextFrom || node.from >= region.nextTo) return false;
            if (node.name === 'Document') return;
            if (node.name !== 'Table' || node.node.parent?.name !== 'Document') return false;
            let to = node.to;
            while (to < state.doc.length) {
                const nextLine = state.doc.lineAt(to + 1);
                const suffix = state.sliceDoc(to, nextLine.to);
                if (markdownTableMetadataEnd(suffix, 0) !== suffix.length) break;
                to = nextLine.to;
            }
            tables.push({ from: node.from, to, source: state.sliceDoc(node.from, to),
                sourceLines: tableSourceLines(state, node.from, to) });
            return false;
        } });
    }
    return tables;
}

function createMarkdownTableWidget(WidgetType, previews) {
    return class MarkdownTableWidget extends WidgetType {
        constructor(source, sourceLines, from, to, sourceIdentity) {
            super();
            this.source = source;
            this.sourceLines = sourceLines;
            this.from = from;
            this.to = to;
            this.sourceIdentity = sourceIdentity;
        }

        eq(other) {
            return other instanceof MarkdownTableWidget
                && other.source === this.source
                && other.sourceLines === this.sourceLines
                && other.from === this.from
                && other.to === this.to;
        }

        updateDOM(wrapper) {
            if (wrapper._figaroTableSource !== this.source) return false;
            if (wrapper._figaroTablePreview) wrapper._figaroTablePreview.key = this.sourceIdentity;
            return true;
        }

        toDOM(view) {
            const ownerDocument = view?.dom?.ownerDocument || globalThis.document;
            const surface = ownerDocument.createElement('div');
            surface.className = 'cm-live-table';
            surface.setAttribute('aria-label', 'Rendered Markdown table');

            const wrapper = wrapBlockWidget(surface, 'cm-block-widget--table');
            wrapper._figaroTableSource = this.source;
            protectTablePreviewScrolling(wrapper);
            markSourceFootprint(wrapper, {
                kind: 'table',
                lineCount: this.sourceLines,
                lineHeight: view?.defaultLineHeight,
                sourceText: this.source,
            });

            try {
                const session = previews.forView(view);
                const renderer = globalThis.katex?.renderToString || null;
                const prepared = session?.take(this.sourceIdentity, this.source, renderer);
                const table = prepared?.node || renderMarkdownTable(this.source, ownerDocument);
                if (table) {
                    surface.append(table);
                    countEditorWork(prepared ? 'dom.tablePreviewRestored' : 'render.tablePreview');
                    // Embedded resource loads and renderer failures must stay retryable.
                    if (!table.querySelector('img, .katex-error')) wrapper._figaroTablePreview = {
                        session, key: this.sourceIdentity,
                        entry: prepared || previews.prepare(table, this.source, renderer),
                    };
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

        destroy(wrapper) {
            const preview = wrapper?._figaroTablePreview;
            preview?.session?.retain(preview.key, preview.entry);
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



/** Build the live-preview state field for source-preserving Markdown tables. */
export function createMarkdownTableField(
    StateField,
    EditorView,
    Decoration,
    WidgetType,
    shouldShowSource,
    mouseSelectingField,
    EditorSelection,
) {
    const previews = createDOMPreviewCache();
    const MarkdownTableWidget = createMarkdownTableWidget(WidgetType, previews);

    const projectBlock = (state, block, visible) => {
        if (state.field(mouseSelectingField, false) || visible || sourceRangeIsFolded(state, block)) return [];
        return [Decoration.replace({
            widget: new MarkdownTableWidget(block.source, block.sourceLines, block.from, block.to, block.sourceIdentity || block),
            block: true, sourceBlock: block.sourceIdentity || block,
        }).range(block.from, block.to)];
    };
    const buildState = (state, blocks = scanMarkdownTables(state)) => {
        const visibleIndices = new Set();
        const decorations = blocks.flatMap((block, index) => {
            const visible = Boolean(shouldShowSource(state, block.from, block.to));
            if (visible) visibleIndices.add(index);
            return projectBlock(state, block, visible);
        });
        return {
            decorations: Decoration.set(decorations, true),
            ranges: blocks.map(({ from, to }) => ({ from, to })),
            blocks, visibleIndices, revealIndex: sourceRevealIndex(blocks),
        };
    };

    const field = StateField.define({
        create: buildState,
        update(value, transaction) {
            if (transaction.docChanged || syntaxTree(transaction.startState) !== syntaxTree(transaction.state)) {
                const regions = canMapMarkdownProseEdit(transaction) ? [] : markdownProjectionEdit(transaction);
                if (!regions || regions.some(region => region.name !== 'Table' && value.blocks.some(block =>
                    block.from < region.to && block.to > region.from))) return buildState(transaction.state);
                const tableRegions = regions.filter(region => region.name === 'Table');
                value = patchSourceReveal(value, transaction, tableRegions,
                    tableRegions.length ? scanMarkdownTables(transaction.state, tableRegions) : [], shouldShowSource, projectBlock);
                value.ranges = value.blocks.map(({ from, to }) => ({ from, to }));
                if (transaction.effects.length || transaction.state.field(mouseSelectingField, false)
                    || transaction.startState.field(mouseSelectingField, false)) return buildState(transaction.state, value.blocks);
                return updateSourceReveal(value, transaction, shouldShowSource, projectBlock);
            }
            if (transaction.startState.facet(collapseOnSelectionFacet) !== transaction.state.facet(collapseOnSelectionFacet)) return buildState(transaction.state, value.blocks);

            const isDragging = transaction.state.field(mouseSelectingField, false);
            const wasDragging = transaction.startState.field(mouseSelectingField, false);
            if (wasDragging && !isDragging) return buildState(transaction.state, value.blocks);
            if (isDragging) return value;
            if (foldedRanges(transaction.startState) !== foldedRanges(transaction.state)) {
                return buildState(transaction.state, value.blocks);
            }
            return transaction.selection
                ? updateSourceReveal(value, transaction, shouldShowSource, projectBlock)
                : value;
        },
        provide: field => [previews.extension, EditorView.decorations.from(field, value => value.decorations)],
    });
    const cellSelection = EditorView.mouseSelectionStyle.of((view, event) => (
        renderedTableCellMouseSelection(view, event, EditorSelection)
    ));
    return [field, cellSelection];
}
