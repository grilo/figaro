/** Preserve the editor's existing math recognition independently of rendering. */
export function mathPreviewBlocks(source) {
    const text = String(source || '');
    if (!text.includes('$')) return [];
    const blocks = [];
    for (const match of text.matchAll(/\$\$\s*([\s\S]*?)\s*\$\$/g)) {
        blocks.push({
            from: match.index, to: match.index + match[0].length,
            text: match[1], source: match[0], displayMode: match[0].includes('\n'),
        });
    }
    for (const match of text.matchAll(/\$([^$\n]+)\$/g)) {
        blocks.push({
            from: match.index, to: match.index + match[0].length,
            text: match[1], source: match[0], displayMode: false,
        });
    }
    return blocks;
}
