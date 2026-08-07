import { foldService, syntaxTree } from '@codemirror/language';

function headingLevel(node) {
    const match = /^ATXHeading([1-6])$/.exec(node?.name || '');
    return match ? Number(match[1]) : null;
}

function headingSectionEnd(heading, level) {
    let last = heading;
    for (;;) {
        const next = last.nextSibling;
        const nextLevel = headingLevel(next);
        if (!next || (nextLevel !== null && nextLevel <= level)) return last.to;
        last = next;
    }
}

function positionIsInFrontmatter(document, position) {
    if (document.line(1).text.trim() !== '---') return false;
    const candidateLine = document.lineAt(position).number;
    for (let lineNumber = 2; lineNumber <= candidateLine; lineNumber += 1) {
        if (/^(?:---|\.\.\.)\s*$/.test(document.line(lineNumber).text)) return false;
    }
    return true;
}

/**
 * Return the source range hidden by a Markdown heading on the requested line.
 * Lezer owns syntax recognition, so hash-like text in fenced code and other
 * non-heading contexts never becomes a fold candidate.
 */
function markdownHeadingFoldRange(state, lineStart, lineEnd) {
    for (let node = syntaxTree(state).resolveInner(lineEnd, -1); node; node = node.parent) {
        if (node.from < lineStart) break;
        const level = headingLevel(node);
        if (level === null) continue;
        if (positionIsInFrontmatter(state.doc, node.from)) return null;
        const to = headingSectionEnd(node, level);
        return to > lineEnd ? { from: lineEnd, to } : null;
    }
    return null;
}

const markdownHeadingFoldingExtension = foldService.of(markdownHeadingFoldRange);

export { markdownHeadingFoldRange, markdownHeadingFoldingExtension };
