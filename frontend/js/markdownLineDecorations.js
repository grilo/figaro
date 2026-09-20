import { canMapMarkdownInlineEdit } from 'codemirror-live-markdown';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { markdownExtraLinePlan, markdownListIndentPlan, markdownListNodePlan } from './core/markdownLineModel.js';
import { taskCheckboxLabel, taskCheckboxReplacement } from './core/taskCheckboxModel.js';
import { markdownIndentationMetrics, markdownListHangingIndentAttributes, markdownBlockquoteHangingIndentAttributes } from './markdownIndentation.js';
import { sourceRevealIndex, updateSourceReveal } from './sourceReveal.js';
import { countEditorWork } from './editorDiagnostics.js';

class BulletWidget extends WidgetType {
    constructor(label) { super(); this.label = label; }
    eq(other) { return other.label === this.label; }
    toDOM() {
        const span = document.createElement('span'); span.className = 'cm-bullet'; span.textContent = this.label; return span;
    }
}

class TaskCheckboxWidget extends WidgetType {
    constructor(checked, view, from, label) { super(); Object.assign(this, { checked, view, from, label }); }
    eq(other) { return other.checked === this.checked && other.label === this.label; }
    toDOM() {
        const { checked, view, label } = this;
        const hitbox = document.createElement('span'); hitbox.className = 'cm-task-checkbox-hitbox';
        const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'cm-task-checkbox';
        input.checked = checked; input.setAttribute('aria-label', label);
        hitbox.addEventListener('mousedown', event => { if (event.detail > 0) event.preventDefault(); });
        hitbox.addEventListener('click', event => {
            event.preventDefault();
            const from = view.posAtDOM(hitbox);
            view.dispatch({ changes: { from: from + 1, to: from + 2, insert: taskCheckboxReplacement(checked) }, userEvent: 'input.task-checkbox' });
            if (event.detail === 0) requestAnimationFrame(() => {
                for (const checkbox of view.dom.querySelectorAll('.cm-task-checkbox')) {
                    if (view.posAtDOM(checkbox) === from) { checkbox.focus(); break; }
                }
            });
        });
        hitbox.append(input); return hitbox;
    }
}

function selectedLines(state) {
    return state.selection.ranges.map(range => ({ from: state.doc.lineAt(range.from).from, to: state.doc.lineAt(range.to).to }));
}

function readListLines(view, visibleRanges = view.visibleRanges) {
    const lines = new Map(), seen = new Set();
    for (const range of visibleRanges) syntaxTree(view.state).iterate({ ...range, enter: node => {
        countEditorWork('syntax.nodes.listWidgets');
        if (node.name !== 'ListMark' && node.name !== 'Task') return;
        const key = `${node.type.id}:${node.from}:${node.to}`;
        if (seen.has(key)) return;
        seen.add(key);
        const line = view.state.doc.lineAt(node.from);
        countEditorWork('source.slices.listWidgets');
        const text = view.state.doc.sliceString(node.from, Math.min(node.to, line.to));
        let depth = 0, ordered = false;
        for (let parent = node.node.parent; parent; parent = parent.parent) {
            if (parent.name === 'BulletList') depth++;
            else if (parent.name === 'OrderedList') ordered = true;
        }
        const plan = markdownListNodePlan({ kind: node.name, text, from: node.from, depth, ordered });
        if (!plan) return;
        if (!lines.has(line.from)) lines.set(line.from, { from: line.from, to: line.to, text: line.text, nodes: [] });
        lines.get(line.from).nodes.push(plan);
    } });
    return [...lines.values()];
}

function readExtraLines(view, visibleRanges = view.visibleRanges) {
    const lines = new Map(), doc = view.state.doc;
    for (const range of visibleRanges) {
        if (!doc.length) continue;
        const first = doc.lineAt(range.from), last = doc.lineAt(range.to);
        countEditorWork('source.slices.extras');
        const text = doc.sliceString(first.from, last.to);
        let from = first.from, callout = '';
        for (const line of text.split('\n')) {
            const plan = markdownExtraLinePlan(line, callout); callout = plan.callout;
            if (!lines.has(from) && (plan.quote || plan.rule || plan.callout || plan.marks.length)) {
                lines.set(from, { from, to: from + line.length, text: line, ...plan });
            }
            from += line.length + 1;
        }
    }
    return [...lines.values()];
}

function listDecorations(view, block, active, metrics) {
    const decorations = [], spec = { sourceBlock: block };
    for (const node of block.nodes) {
        if (node.kind === 'bullet') {
            const marker = markdownListIndentPlan(block.text, { tabSize: view.state.tabSize });
            const attributes = markdownListHangingIndentAttributes(block.text, { metrics, tabSize: view.state.tabSize,
                markerText: active ? marker?.sourceMarker : node.label, markerWeight: active ? null : '700',
                markerMargin: active ? 0 : 2, trailingSourceWhitespace: active ? '' : marker?.separator || '' });
            if (attributes) decorations.push(Decoration.line({ ...spec, attributes }).range(block.from));
            if (!active) decorations.push(Decoration.replace({ ...spec, widget: new BulletWidget(node.label) }).range(node.from, node.to));
        } else if (!active) {
            decorations.push(Decoration.replace({ ...spec, widget: new TaskCheckboxWidget(node.checked, view, node.from,
                taskCheckboxLabel(block.text, node.checked)) }).range(node.from, node.to));
        }
    }
    return decorations;
}

function extraDecorations(view, block, active, metrics) {
    const decorations = [], spec = { sourceBlock: block };
    if (block.quote) decorations.push(Decoration.line({ ...spec, attributes: markdownBlockquoteHangingIndentAttributes(block.text,
        { metrics, tabSize: view.state.tabSize, markerVisible: active }) }).range(block.from));
    if (block.callout) decorations.push(Decoration.line({ ...spec, class: `cm-callout cm-callout-${block.callout}` }).range(block.from));
    if (block.rule) decorations.push(Decoration.line({ ...spec, class: active ? 'cm-hr-active' : 'cm-hr-passive' }).range(block.from));
    for (const mark of block.marks) decorations.push(Decoration.mark({ ...spec, class: mark.className }).range(block.from + mark.from, block.from + mark.to));
    return decorations;
}

function lineProjection(consumer, read, render, sensitive) {
    return ViewPlugin.fromClass(class {
        constructor(view) { this.lines = read(view); this.project(view); }
        get decorations() { return this.value.decorations; }

        project(view, metrics = this.lines.some(line => line.quote || line.nodes?.some(node => node.kind === 'bullet'))
            ? markdownIndentationMetrics(view) : null) {
            this.metrics = metrics;
            countEditorWork(`decorations.${consumer}`);
            const blocks = [], decorations = [], visibleIndices = new Set(), selections = selectedLines(view.state);
            for (const line of this.lines) {
                const block = { ...line };
                block.passive = render(view, block, false, metrics);
                if (sensitive(block)) {
                    block.active = render(view, block, true, metrics);
                    const active = selections.some(range => range.from <= block.to && range.to >= block.from);
                    if (active) visibleIndices.add(blocks.length);
                    blocks.push(block);
                    decorations.push(...(active ? block.active : block.passive));
                } else decorations.push(...block.passive);
            }
            this.value = { blocks, visibleIndices, revealIndex: sourceRevealIndex(blocks), decorations: Decoration.set(decorations, true) };
        }

        update(update) {
            const reconfigured = update.transactions.some(transaction => transaction.reconfigured);
            const touched = new Set();
            if (update.docChanged) update.changes.iterChangedRanges((from, to) => {
                this.lines.forEach((line, index) => { if (from <= line.to && to >= line.from) touched.add(index); });
            });
            const mapped = update.docChanged && !update.viewportMoved && !reconfigured
                && ![...touched].some(index => this.lines[index].callout) && canMapMarkdownInlineEdit(update);
            if (mapped) {
                const previous = this.value;
                const map = position => update.changes.mapPos(position);
                const ranges = values => values.map(range => range.value.range(map(range.from), map(range.to)));
                const blocks = previous.blocks.map(block => ({ ...block, from: map(block.from), to: map(block.to),
                    sourceIdentity: block.sourceIdentity || block, active: ranges(block.active), passive: ranges(block.passive) }));
                const lines = this.lines.map(line => ({ ...line, from: map(line.from), to: map(line.to),
                    ...(line.nodes ? { nodes: line.nodes.map(node => ({ ...node, from: map(node.from), to: map(node.to) })) } : {}) }));
                let decorations = previous.decorations.map(update.changes);
                const visibleIndices = new Set(previous.visibleIndices), selections = selectedLines(update.state);
                for (const index of touched) {
                    const old = this.lines[index], mappedLine = lines[index];
                    // Single-line prose keeps the block kind. Read and project only
                    // that line; callout continuation and structural edits fall back.
                    const fresh = read(update.view, [{ from: mappedLine.from, to: mappedLine.to }])[0];
                    const blockIndex = previous.blocks.findIndex(block => block.from === old.from);
                    if (Boolean(fresh && sensitive(fresh)) !== (blockIndex >= 0)) {
                        this.lines = read(update.view); this.project(update.view); return;
                    }
                    const owners = new Set();
                    previous.decorations.between(old.from, old.to, (_from, _to, value) => {
                        if (value.spec.sourceBlock && (blockIndex < 0 || value.spec.sourceBlock === (previous.blocks[blockIndex].sourceIdentity || previous.blocks[blockIndex]))) owners.add(value.spec.sourceBlock);
                    });
                    lines[index] = fresh;
                    let additions = [];
                    if (fresh) {
                        const block = { ...fresh };
                        block.passive = render(update.view, block, false, this.metrics);
                        const active = selections.some(range => range.from <= block.to && range.to >= block.from);
                        if (blockIndex >= 0) {
                            block.active = render(update.view, block, true, this.metrics);
                            blocks[blockIndex] = block;
                            if (active) visibleIndices.add(blockIndex); else visibleIndices.delete(blockIndex);
                        }
                        additions = blockIndex >= 0 && active ? block.active : block.passive;
                    }
                    countEditorWork(`decorations.${consumer}.lines`);
                    decorations = decorations.update({ filterFrom: mappedLine.from, filterTo: mappedLine.to,
                        filter: (_from, _to, value) => !owners.has(value.spec.sourceBlock), add: additions, sort: true });
                }
                this.lines = lines.filter(Boolean);
                this.value = { ...previous, blocks, visibleIndices, revealIndex: sourceRevealIndex(blocks), decorations };
            } else if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)
                || reconfigured) {
                this.lines = read(update.view); this.project(update.view); return;
            }
            if (update.geometryChanged && !mapped && this.metrics) {
                const metrics = markdownIndentationMetrics(update.view);
                if (metrics !== this.metrics) { this.project(update.view, metrics); return; }
            }
            if (!update.selectionSet && !mapped) return;
            const selections = selectedLines(update.state);
            this.value = updateSourceReveal(this.value, update,
                (_state, from, to) => selections.some(range => range.from <= to && range.to >= from),
                (_state, block, active) => {
                    countEditorWork(`decorations.${consumer}.lines`);
                    return active ? block.active : block.passive;
                }, selectedLines);
        }
    }, { decorations: value => value.decorations });
}

/** Source reading, pure plans and DOM projection have separate invalidation boundaries. */
export function createMarkdownLineDecorations() {
    return [lineProjection('listWidgets', readListLines, listDecorations, () => true),
        lineProjection('extras', readExtraLines, extraDecorations, block => block.quote || block.rule)];
}
