/** Keep presentation during a source refresh, never across a different review setup. */
export function canRetainWritingResults(previous, next) {
    return Boolean(previous && next && previous.id === next.id && previous.language === next.language
        && JSON.stringify(previous.preferences) === JSON.stringify(next.preferences)
        && JSON.stringify(previous.spelling) === JSON.stringify(next.spelling));
}

/** Structural Markdown edits can change the meaning of otherwise untouched prose. */
export function writingEditChangesStructure({ removed, inserted, beforeLine, afterLine }) {
    return /[`~<>[\]$\\*_#|=]/u.test(removed + inserted)
        || /^\s*(?:[-+>] |-{3,}|\.{3,}|`{3,}|~{3,}|\[)/mu.test(beforeLine + '\n' + afterLine);
}

const documentKinds = new Set(['style.consistency', 'style.capitalization', 'style.quotation',
    'style.apostrophe', 'clarity.undefined-acronym']);
export function writingFindingDependsOnDocument(finding) {
    return documentKinds.has(finding.kind) || (finding.members || []).some(member => documentKinds.has(member.kind));
}

/** Map display-only occurrences through old-coordinate edits; fixes remain unauthorized. */
export function retainWritingFindings(findings, { changes, paragraphs, structural = false }) {
    if (structural) return [];
    const offset = position => changes.reduce((sum, change) => sum
        + (change.to <= position ? change.insertedLength - (change.to - change.from) : 0), 0);
    return findings.filter(finding => !writingFindingDependsOnDocument(finding)
        && !paragraphs.some(range => finding.from <= range.to && finding.to >= range.from))
        .map(finding => ({ ...finding, from: finding.from + offset(finding.from), to: finding.to + offset(finding.to) }));
}
