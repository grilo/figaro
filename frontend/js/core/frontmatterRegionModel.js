/** Pure leading-YAML range shared by metadata and writing eligibility. */
const OPENING_BOUNDARY_RE = /^---[ \t]*$/;
const CLOSING_BOUNDARY_RE = /^(?:---|\.\.\.)[ \t]*$/;

function lineEnd(source, from) {
    const newline = source.indexOf('\n', from);
    return newline === -1 ? source.length : newline;
}

function lineText(source, from, to) {
    const text = source.slice(from, to);
    return text.endsWith('\r') ? text.slice(0, -1) : text;
}

function nextLineStart(source, end) {
    return end < source.length ? end + 1 : source.length;
}

export function getFrontmatterRegion(source) {
    const text = String(source || '');
    const openingFrom = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
    const openingEnd = lineEnd(text, openingFrom);
    if (!OPENING_BOUNDARY_RE.test(lineText(text, openingFrom, openingEnd))) return null;

    const contentFrom = nextLineStart(text, openingEnd);
    let from = contentFrom;
    while (from < text.length) {
        const end = lineEnd(text, from);
        if (CLOSING_BOUNDARY_RE.test(lineText(text, from, end))) {
            return {
                from: 0,
                to: nextLineStart(text, end),
                contentFrom,
                contentTo: from,
                closed: true,
            };
        }
        from = nextLineStart(text, end);
    }

    // While a user is still creating the frontmatter, keep the region open
    // through EOF so completion can assist with its first properties.
    return { from: 0, to: text.length, contentFrom, contentTo: text.length, closed: false };
}
