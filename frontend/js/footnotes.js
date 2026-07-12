/**
 * Small Markdown-footnote helpers used by the live editor. CodeMirror's
 * CommonMark parser does not include the footnote extension, so navigation is
 * deliberately based on the source text while preserving normal Markdown
 * positions for CodeMirror selections.
 */

function lineBounds(text, position) {
    const safePosition = Math.max(0, Math.min(Number(position) || 0, text.length));
    const from = text.lastIndexOf('\n', Math.max(0, safePosition - 1)) + 1;
    const newline = text.indexOf('\n', safePosition);
    return { from, to: newline === -1 ? text.length : newline };
}

function footnotesOnLine(text, lineFrom, lineTo) {
    const line = text.slice(lineFrom, lineTo);
    const matches = [];
    const pattern = /\[\^([^\]\n]+)\]/g;
    let match;

    while ((match = pattern.exec(line)) !== null) {
        const from = lineFrom + match.index;
        const to = from + match[0].length;
        const before = line.slice(0, match.index);
        const after = line.slice(match.index + match[0].length);
        matches.push({
            label: match[1],
            from,
            to,
            isDefinition: /^[ \t]{0,3}$/.test(before) && /^[ \t]*:/.test(after),
        });
    }

    return matches;
}

/** Return the footnote token under a document position, if any. */
export function getFootnoteAtPosition(text, position) {
    const { from, to } = lineBounds(text, position);
    const safePosition = Math.max(0, Math.min(Number(position) || 0, text.length));
    return footnotesOnLine(text, from, to).find(token =>
        safePosition >= token.from && safePosition <= token.to
    ) || null;
}

/** Find the source position of a named footnote definition. */
export function findFootnoteDefinition(text, label) {
    let lineFrom = 0;
    while (lineFrom <= text.length) {
        const newline = text.indexOf('\n', lineFrom);
        const lineTo = newline === -1 ? text.length : newline;
        const match = footnotesOnLine(text, lineFrom, lineTo)
            .find(token => token.isDefinition && token.label === label);
        if (match) return match.from;
        if (newline === -1) break;
        lineFrom = newline + 1;
    }
    return null;
}

/**
 * Find a reference for the return journey. Prefer the exact saved position
 * when it still points to the same source token, then fall back to the first
 * non-definition reference with that label.
 */
export function findFootnoteReference(text, label, preferredPosition = null) {
    if (Number.isInteger(preferredPosition)) {
        const preferred = getFootnoteAtPosition(text, preferredPosition);
        if (preferred && !preferred.isDefinition && preferred.label === label) {
            return preferred.from;
        }
    }

    let lineFrom = 0;
    while (lineFrom <= text.length) {
        const newline = text.indexOf('\n', lineFrom);
        const lineTo = newline === -1 ? text.length : newline;
        const match = footnotesOnLine(text, lineFrom, lineTo)
            .find(token => !token.isDefinition && token.label === label);
        if (match) return match.from;
        if (newline === -1) break;
        lineFrom = newline + 1;
    }
    return null;
}

/**
 * Resolve a footnote click to a selection target. The caller owns persistence
 * of the return position because it is scoped to an editor tab.
 */
export function resolveFootnoteNavigation(text, position, returnPosition = null) {
    const token = getFootnoteAtPosition(text, position);
    if (!token) return null;

    if (token.isDefinition) {
        const target = findFootnoteReference(text, token.label, returnPosition);
        return target === null
            ? { action: 'missing-return', label: token.label }
            : { action: 'return', label: token.label, target };
    }

    const target = findFootnoteDefinition(text, token.label);
    return target === null
        ? { action: 'missing-definition', label: token.label }
        : { action: 'definition', label: token.label, target, returnPosition: token.from };
}
