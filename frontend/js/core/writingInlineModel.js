/** Visible, current occurrences only; display grouping never authorizes an edit. */
export function inlineWritingFindings(snapshot) {
    const { current, analyzed, groups = [] } = snapshot || {};
    if (!current || !analyzed || current.id !== analyzed.id || current.revision !== analyzed.revision
        || current.configuration !== analyzed.configuration) return [];
    if (snapshot.inlineFindings) return snapshot.inlineFindings;
    return groups.flatMap(group => group.findings).filter(finding => Number.isInteger(finding.from)
        && Number.isInteger(finding.to) && finding.from >= 0 && finding.to > finding.from
        && finding.to <= current.source.length && current.source.slice(finding.from, finding.to) === (finding.sourceText ?? finding.actual));
}

export function writingFindingsAt(findings, position, side = 0) {
    return findings.filter(finding => position >= finding.from && position <= finding.to
        && (position !== finding.from || side >= 0) && (position !== finding.to || side <= 0));
}

export function visibleWritingRanges(findings, visibleRanges) {
    return findings.flatMap(finding => visibleRanges.map(range => ({
        finding, from: Math.max(finding.from, range.from), to: Math.min(finding.to, range.to),
    })).filter(range => range.from < range.to));
}

export function spellingWordKey(word) { return String(word).trim().toLowerCase().replace(/[’‘]/g, '\''); }
export function filterAcceptedSpelling(values, words = []) {
    const accepted = new Set(words.map(spellingWordKey));
    return values.filter(value => !accepted.has(spellingWordKey(value.actual || value.word)));
}

/** Keep review actions inside the editor/viewport intersection. */
export function writingTooltipBounds(editor, viewport) {
    return { left: Math.max(8, editor.left + 8), right: Math.min(viewport.width - 8, editor.right - 8),
        top: Math.max(8, editor.top + 8), bottom: Math.min(viewport.height - 8, editor.bottom - 8) };
}
