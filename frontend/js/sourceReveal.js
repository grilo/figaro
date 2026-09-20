import { createSelectionRangeIndex, sourceRevealChanges } from './core/selectionRangeIndex.js';
import { mapMarkdownBlockDescriptors, replaceMarkdownBlockRegions } from './core/markdownProjectionModel.js';
import { countEditorWork } from './editorDiagnostics.js';

const indices = new WeakMap();

export function sourceRevealIndex(blocks) {
    if (!indices.has(blocks)) indices.set(blocks, createSelectionRangeIndex(blocks));
    return indices.get(blocks);
}

/** Patch decorations owned by changed blocks; keep unrelated widgets and descriptors. */
export function updateSourceReveal(value, transaction, sourceVisible, projectBlock,
    selectionRanges = state => state.selection.ranges) {
    const plan = sourceRevealChanges(value, [
        ...selectionRanges(transaction.startState).map(range => ({
            from: transaction.changes.mapPos(range.from, -1),
            to: transaction.changes.mapPos(range.to, 1),
        })), ...selectionRanges(transaction.state),
    ], block => sourceVisible(transaction.state, block.from, block.to));
    countEditorWork('selection.rangeNodes', plan.visited);
    countEditorWork('selection.visibilityChecks', plan.checks);
    if (!plan.changes.length) return value;
    let decorations = value.decorations;
    for (const { block, visible } of plan.changes) {
        countEditorWork('decorations.sourceBlocks');
        decorations = decorations.update({
            filterFrom: transaction.state.doc.lineAt(block.from).from,
            filterTo: block.to,
            filter: (_from, _to, decoration) => decoration.spec.sourceBlock !== (block.sourceIdentity || block),
            add: projectBlock(transaction.state, block, visible),
            sort: true,
        });
    }
    return { ...value, visibleIndices: plan.visibleIndices, decorations };
}

/** Map a proven prose edit without allocating a new decoration for every block. */
export function mapSourceReveal(value, transaction) {
    const blocks = mapMarkdownBlockDescriptors(value.blocks, position => transaction.changes.mapPos(position));
    return { ...value, blocks,
        revealIndex: blocks === value.blocks ? value.revealIndex : sourceRevealIndex(blocks),
        decorations: value.decorations.map(transaction.changes) };
}

/** Reparse changed blocks while preserving unrelated decoration ownership. */
export function patchSourceReveal(value, transaction, regions, replacements, sourceVisible, projectBlock) {
    if (!regions.length && !replacements.length) return mapSourceReveal(value, transaction);
    const { blocks, removed } = replaceMarkdownBlockRegions(value.blocks, regions, replacements,
        position => transaction.changes.mapPos(position));
    let decorations = value.decorations.map(transaction.changes);
    for (const block of removed) {
        decorations = decorations.update({
            filterFrom: transaction.state.doc.lineAt(transaction.changes.mapPos(block.from, -1)).from,
            filterTo: transaction.changes.mapPos(block.to, 1),
            filter: (_from, _to, decoration) => decoration.spec.sourceBlock !== (block.sourceIdentity || block),
        });
    }
    const previouslyVisible = new Set([...value.visibleIndices].map(index => {
        const block = value.blocks[index];
        return block.sourceIdentity || block;
    }));
    const fresh = new Set(replacements), visibleIndices = new Set(), add = [];
    blocks.forEach((block, index) => {
        const visible = fresh.has(block) ? sourceVisible(transaction.state, block.from, block.to)
            : previouslyVisible.has(block.sourceIdentity || block);
        if (visible) visibleIndices.add(index);
        if (fresh.has(block)) add.push(...projectBlock(transaction.state, block, visible));
    });
    if (add.length) decorations = decorations.update({ add, sort: true });
    return { ...value, blocks, visibleIndices, revealIndex: sourceRevealIndex(blocks), decorations };
}
