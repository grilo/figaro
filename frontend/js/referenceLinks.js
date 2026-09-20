import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { mouseSelectingField, shouldShowSource, canMapMarkdownInlineEdit } from 'codemirror-live-markdown';
import {
    markdownReferenceDefinitions, markdownReferenceLinesMayChange,
    markdownReferenceLink, resolveMarkdownReferenceLink,
} from './core/noteLinks.js';
import { sourceRevealIndex, updateSourceReveal, mapSourceReveal } from './sourceReveal.js';
import { countEditorWork } from './editorDiagnostics.js';

function safeReferenceHref(target) {
    const value = String(target || '').trim();
    if (!value || /^(?:javascript|vbscript|data):/i.test(value)) return '';
    try { return encodeURI(value); } catch (_) { return ''; }
}

class ReferenceLinkWidget extends WidgetType {
    constructor(link) { super(); this.link = link; }
    eq(other) { return other.link.label === this.link.label && other.link.target === this.link.target; }
    toDOM() {
        const anchor = document.createElement('a');
        anchor.className = 'cm-link-widget cm-reference-link-widget';
        anchor.textContent = this.link.label;
        anchor.title = this.link.target;
        const href = safeReferenceHref(this.link.target);
        if (href) anchor.setAttribute('href', href);
        return anchor;
    }
    ignoreEvent() { return false; }
}

function referenceDecoration(_state, block, visible) {
    const spec = { sourceBlock: block.sourceIdentity || block };
    return [(visible ? Decoration.mark({ ...spec,
        class: 'cm-reference-link-source',
        attributes: { 'data-reference-label': block.link.label, 'data-reference-target': block.link.target },
    }) : Decoration.replace({ ...spec, widget: new ReferenceLinkWidget(block.link) })).range(block.from, block.to)];
}

function projectReferences(state, { blocks, unresolved, revealIndex = sourceRevealIndex(blocks) }) {
    countEditorWork('decorations.references');
    const visibleIndices = new Set(), dragging = state.field(mouseSelectingField, false);
    const decorations = [...unresolved];
    blocks.forEach((block, index) => {
        const visible = dragging || shouldShowSource(state, block.from, block.to);
        if (visible) visibleIndices.add(index);
        decorations.push(...referenceDecoration(state, block, visible));
    });
    return { blocks, unresolved, revealIndex, visibleIndices, decorations: Decoration.set(decorations, true) };
}

/** Reference parsing follows source changes; cursor updates patch cached reveal ranges. */
export function referenceLinkPlugin() {
    return ViewPlugin.fromClass(class {
        constructor(view) { this.value = this.read(view); }
        get decorations() { return this.value.decorations; }

        read(view) {
            const state = view.state;
            if (this.document !== state.doc) {
                this.definitions = markdownReferenceDefinitions(state.doc.toString());
                this.document = state.doc;
            }
            const blocks = [], unresolved = [], seen = new Set();
            for (const range of view.visibleRanges) syntaxTree(state).iterate({
                from: range.from, to: range.to,
                enter: node => {
                    countEditorWork('syntax.nodes.references');
                    if (node.name !== 'Link') return;
                    const key = `${node.from}:${node.to}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    countEditorWork('source.slices.references');
                    const source = state.doc.sliceString(node.from, node.to);
                    if (!markdownReferenceLink(source)) return;
                    const link = resolveMarkdownReferenceLink(source, this.definitions);
                    if (link) blocks.push({ from: node.from, to: node.to, link });
                    else unresolved.push(Decoration.mark({ class: 'cm-unresolved-reference' }).range(node.from, node.to));
                },
            });
            return projectReferences(state, { blocks, unresolved });
        }

        update(update) {
            if (update.docChanged && this.document === update.startState.doc) {
                let invalidate = false;
                update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
                    const lines = (doc, from, to) => doc.sliceString(doc.lineAt(from).from, doc.lineAt(to).to);
                    invalidate ||= markdownReferenceLinesMayChange(lines(update.startState.doc, fromA, toA), lines(update.state.doc, fromB, toB));
                });
                if (!invalidate) this.document = update.state.doc;
            }
            let touched = false;
            if (update.docChanged) update.changes.iterChangedRanges((from, to) => {
                touched ||= [...this.value.blocks, ...this.value.unresolved].some(block => from <= block.to && to >= block.from);
            });
            const mapped = update.docChanged && !update.viewportMoved && !touched && this.document === update.state.doc
                && !update.transactions.some(transaction => transaction.reconfigured) && canMapMarkdownInlineEdit(update);
            if (mapped) {
                this.value = mapSourceReveal(this.value, update);
                this.value.unresolved = this.value.unresolved.map(range => range.value.range(
                    update.changes.mapPos(range.from), update.changes.mapPos(range.to)));
            } else if (update.docChanged || update.viewportChanged
                || syntaxTree(update.startState) !== syntaxTree(update.state)
                || update.transactions.some(transaction => transaction.reconfigured)) {
                this.value = this.read(update.view);
                return;
            }
            const dragging = update.state.field(mouseSelectingField, false);
            const wasDragging = update.startState.field(mouseSelectingField, false);
            if (dragging !== wasDragging) this.value = projectReferences(update.state, this.value);
            else if ((update.selectionSet || mapped) && !dragging) {
                this.value = updateSourceReveal(this.value, update, shouldShowSource, referenceDecoration);
            }
        }
    }, { decorations: value => value.decorations });
}
