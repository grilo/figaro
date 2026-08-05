// Return the destination range of the conventional Markdown link covering a
// position on one source line. Images are deliberately excluded.
export function markdownLinkDestinationAtPosition(line, column) {
    const source = String(line || '');
    const position = Number(column);
    if (!Number.isInteger(position) || position < 0) return null;

    const links = /\[([^\]\r\n]+)\]\(([^)\r\n]*)\)/g;
    let match;
    while ((match = links.exec(source)) !== null) {
        if (match.index > 0 && source[match.index - 1] === '!') continue;
        const linkEnd = match.index + match[0].length;
        if (position < match.index || position > linkEnd) continue;
        const destinationOffset = match[0].indexOf('(') + 1;
        const destinationFrom = match.index + destinationOffset;
        return {
            label: match[1],
            target: match[2],
            destinationFrom,
            destinationTo: destinationFrom + match[2].length,
        };
    }
    return null;
}

export function encodeMarkdownLinkTarget(path) {
    return String(path || '').replaceAll(' ', '%20');
}

// Revalidate the clicked source range before planning an editor transaction;
// a modal response must never overwrite text that changed in the meantime.
export function planMarkdownLinkTargetReplacement(document, edit, existingPath) {
    const source = String(document || '');
    const from = Number(edit?.from);
    const to = Number(edit?.to);
    const expectedTarget = String(edit?.target ?? '');
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > source.length) {
        return null;
    }
    if (source.slice(from, to) !== expectedTarget) return null;
    return { from, to, insert: encodeMarkdownLinkTarget(existingPath) };
}
