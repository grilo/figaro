/** Changed text may be prose; the adapter must also prove unchanged parsed structure. */
export function markdownProseEditPreservesBlocks(removed, inserted) {
    const prose = /^[\p{L}\p{N}\p{M}\t ,.?;:'"()%–—’‘“”-]*$/u;
    return prose.test(removed) && prose.test(inserted);
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
