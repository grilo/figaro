/** Changed text may be prose; the adapter must also prove unchanged parsed structure. */
export function markdownProseEditPreservesBlocks(removed, inserted) {
    const prose = /^[\p{L}\p{N}\p{M}\t ,.?;:'"()%–—’‘“”-]*$/u;
    return prose.test(removed) && prose.test(inserted);
}

/** Plain text and soft line breaks still need the adapter's parsed-boundary proof. */
export function markdownTextEditMayStayInBlock(removed, inserted) {
    return markdownProseEditPreservesBlocks(removed.replace(/[\r\n]/gu, ''), inserted.replace(/[\r\n]/gu, ''));
}

/** Preserve untouched source identities while replacing only reparsed regions. */
export function replaceMarkdownBlockRegions(blocks, regions, replacements, mapPosition) {
    const removed = blocks.filter(block => regions.some(region => block.from < region.to && block.to > region.from));
    if (!removed.length && !replacements.length) return { removed, blocks: mapMarkdownBlockDescriptors(blocks, mapPosition) };
    const removedSet = new Set(removed);
    const retained = mapMarkdownBlockDescriptors(blocks.filter(block => !removedSet.has(block)), mapPosition);
    return { removed, blocks: [...retained, ...replacements].sort((a, b) => a.from - b.from || a.to - b.to) };
}

/** Retain source payloads while mapping immutable descriptor positions through an edit. */
export function mapMarkdownBlockDescriptors(blocks, mapPosition) {
    let changed = false;
    const result = blocks.map(block => {
        let mapped = block;
        for (const key of ['from', 'to', 'lineFrom', 'codeFrom', 'contentFrom', 'contentTo', 'foldFrom', 'foldTo']) {
            if (!Number.isInteger(block[key])) continue;
            const position = mapPosition(block[key]);
            if (position === block[key]) continue;
            if (mapped === block) mapped = { ...block, sourceIdentity: block.sourceIdentity || block };
            mapped[key] = position;
        }
        if (mapped !== block && block.lineStarts) mapped.lineStarts = block.lineStarts.map(mapPosition);
        changed ||= mapped !== block;
        return mapped;
    });
    return changed ? result : blocks;
}

/** Parsed inline boundaries must survive before mapping styles or replacements. */
export function markdownInlineStructuresMatch(before, after, mapPosition) {
    return before.length === after.length && before.every((node, index) => {
        const next = after[index];
        return node.name === next.name && mapPosition(node.from, 1) === next.from
            && mapPosition(node.to, -1) === next.to;
    });
}
