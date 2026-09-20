import { expandedTabText, normalizeTabSize } from './tabSizeModel.js';

const bulletMarkers = ['\u2022', '\u25E6', '\u25AA'];
export function bulletMarkerForListDepth(depth) {
    return bulletMarkers[(Math.max(1, Math.floor(Number(depth) || 1)) - 1) % bulletMarkers.length];
}

export function isBlockquoteLine(line) { return /^ {0,3}>\s?/.test(line); }

/** Convert a parser-owned marker into plain source and display data. */
export function markdownListNodePlan({ kind, text, from, depth = 1, ordered = false }) {
    if (kind === 'Task') {
        const match = text.match(/\[([ xX])\]/);
        return match ? { kind: 'task', from: from + match.index, to: from + match.index + match[0].length,
            checked: match[1] !== ' ' } : null;
    }
    const match = text.match(/^(\s*)([-*+]|\d+[.)])\s?/);
    return match ? { kind: 'bullet', from: from + match[1].length, to: from + text.length,
        label: (ordered ? match[2] : bulletMarkerForListDepth(depth)) + ' ' } : null;
}

/** Font measurement is supplied by the adapter; tab expansion and prefix choices are pure. */
export function markdownListIndentPlan(lineText, options = {}) {
    const match = String(lineText ?? '').match(/^([ \t]*)(?:[-*+]|\d+[.)])([ \t]+)/);
    if (!match) return null;
    const tabSize = normalizeTabSize(options.tabSize), columns = expandedTabText(match[0], tabSize).columns;
    return { columns, sourceMarker: match[0].slice(match[1].length), separator: match[2],
        leading: expandedTabText(match[1], tabSize).text
            + expandedTabText(options.trailingSourceWhitespace || '', tabSize, columns).text };
}

export function markdownQuoteIndentPlan(lineText, { markerVisible = false, tabSize } = {}) {
    const match = String(lineText ?? '').match(/^([ \t]{0,3})((?:>[ \t]?)+)/);
    if (!match) return null;
    const marker = markerVisible ? match[2] : match[2].replace(/>/g, '');
    return expandedTabText(match[1] + marker, normalizeTabSize(tabSize));
}

/** Extras preserve callout continuation within each visible source segment. */
export function markdownExtraLinePlan(text, previousCallout = '') {
    const calloutMatch = text.match(/^>\s*\[!(\w+)\]\s*(.*)$/);
    const continues = !calloutMatch && previousCallout && isBlockquoteLine(text);
    const callout = calloutMatch ? calloutMatch[1].toLowerCase() : continues ? previousCallout : '';
    const marks = [];
    for (const [pattern, className] of [[/==([^=]+)==/g, 'cm-highlight'], [/\[\^([^\]]+)\]/g, 'cm-footnote']]) {
        for (const match of text.matchAll(pattern)) marks.push({ from: match.index, to: match.index + match[0].length, className });
    }
    return { callout, quote: isBlockquoteLine(text) && !callout, rule: /^(-{3,}|\*{3,}|_{3,})\s*$/.test(text), marks };
}
