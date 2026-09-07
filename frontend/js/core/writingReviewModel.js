import { validateWritingFix } from './writingAnalysisModel.js';

export const writingReviewPageSize = 4;
const bulkKinds = new Set(['style.terminology', 'grammar.spelling', 'lexicon.complex-word', 'style.wordiness',
    'grammar.punctuation-spacing', 'grammar.repeated-comma', 'style.sentence-spacing']);

/** Group identical advice without losing source occurrences or changing analyzer results. */
export function writingReviewCards(groups) {
    const cards = new Map();
    for (const finding of groups.flatMap(group => group.findings)) {
        const key = JSON.stringify([finding.kind, finding.intent, finding.actual, finding.message,
            finding.fixes.map(fix => [fix.expected, fix.replacement])]);
        if (!cards.has(key)) cards.set(key, { key, findings: [] });
        cards.get(key).findings.push(finding);
    }
    return [...cards.values()];
}

export function writingBulkAvailable(card) {
    return card.findings.length > 1 && bulkKinds.has(card.findings[0].kind) && card.findings.every(finding => finding.fixes.length === 1
        && (finding.kind !== 'grammar.spelling' || finding.bulkSafe === true));
}

/** A bulk operation is one all-or-nothing plan over the complete current result. */
export function planWritingBulkFix({ groups, analyzed, states = {} }, id, current) {
    if (Object.values(states).includes('analyzing')) return null;
    const card = writingReviewCards(groups).find(card => card.findings.some(finding => finding.id === id));
    if (!card || !writingBulkAvailable(card)) return null;
    const fixes = card.findings.map(finding => finding.fixes[0]).sort((a, b) => a.from - b.from);
    if (fixes.some((fix, index) => !validateWritingFix(analyzed, current, fix) || (index && fixes[index - 1].to > fix.from))) return null;
    return fixes;
}
