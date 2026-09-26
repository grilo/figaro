import { validateWritingFix } from './writingAnalysisModel.js';
import { writingLensGroups } from './writingLensesModel.js';

export const writingReviewPageSize = 4;
const correctionLenses = new Set(writingLensGroups.find(group => group.id === 'proofreading').checks);

/**
 * Proofreading findings are corrections: something is probably wrong. The
 * other lenses offer suggestions the author may reasonably decline.
 */
export function writingFindingTier(finding) {
    const lenses = finding?.spanMembers?.map(member => member.lens) || [finding?.lens];
    return lenses.some(lens => correctionLenses.has(lens)) ? 'correction' : 'suggestion';
}

const tierRank = finding => (writingFindingTier(finding) === 'correction' ? 0 : 1);

/**
 * Findings on exactly the same text become one entry listing every reason,
 * so a word flagged by two lenses is reviewed once. Members keep their own
 * identities: each fix names the finding it belongs to, and Ignore covers them
 * all. Counts per lens still come from the underlying findings.
 */
export function mergeWritingFindingsBySpan(findings) {
    const spans = new Map();
    for (const [index, finding] of findings.entries()) {
        // Only findings with a real source range can be the same text.
        const key = Number.isInteger(finding.from) && Number.isInteger(finding.to) ? `${finding.from}:${finding.to}` : `unplaced:${index}`;
        if (!spans.has(key)) spans.set(key, []);
        spans.get(key).push(finding);
    }
    return [...spans.values()].map(members => {
        if (members.length === 1) return members[0];
        const ordered = [...members].sort((a, b) => tierRank(a) - tierRank(b));
        const reasons = [];
        for (const member of ordered) {
            if (!reasons.some(reason => reason.title === member.title && reason.message === member.message)) {
                reasons.push({ id: member.id, kind: member.kind, lens: member.lens, title: member.title, message: member.message });
            }
        }
        const fixes = [];
        for (const member of ordered) {
            member.fixes.forEach((fix, index) => {
                if (!fixes.some(other => other.replacement === fix.replacement)) fixes.push({ ...fix, findingId: member.id, index });
            });
        }
        const [first] = ordered;
        return { ...first, displayId: `span:${first.from}:${first.to}:${first.displayId || first.id}`,
            spanMembers: ordered, reasons, fixes };
    });
}
const bulkKinds = new Set(['style.terminology', 'grammar.spelling', 'lexicon.complex-word', 'style.wordiness',
    'grammar.punctuation-spacing', 'grammar.repeated-comma', 'style.sentence-spacing']);

/** Group identical advice without losing source occurrences or changing analyzer results. */
export function writingReviewCards(groups) {
    const cards = new Map();
    for (const finding of mergeWritingFindingsBySpan(groups.flatMap(group => group.findings))) {
        const reasons = finding.reasons?.map(reason => [reason.kind, reason.message]) || finding.message;
        const key = JSON.stringify([finding.kind, finding.intent, finding.actual, reasons,
            finding.fixes.map(fix => [fix.expected, fix.replacement])]);
        if (!cards.has(key)) cards.set(key, { key, tier: writingFindingTier(finding), findings: [] });
        cards.get(key).findings.push(finding);
    }
    // Corrections first, each tier in document order.
    return [...cards.values()].sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'correction' ? -1 : 1)
        || a.findings[0].from - b.findings[0].from);
}

export function writingBulkAvailable(card) {
    return card.findings.length > 1 && !card.findings[0].spanMembers && bulkKinds.has(card.findings[0].kind) && card.findings.every(finding => finding.fixes.length === 1
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
