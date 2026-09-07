import { remapWritingDecision, writingDecisionRange } from './writingDecisionsModel.js';
import { resolveWritingFindings, remapWritingDismissals, valeWritingObservations } from './writingAnalysisModel.js';
import { filterAcceptedSpelling, inlineWritingFindings } from './writingInlineModel.js';
import { writingReviewCards } from './writingReviewModel.js';

/** Pure background transformations; the adapter owns workers and deadlines. */
export function trackWritingDecisions({ decisions, before, after, changes }) {
    const mapped = decisions.map(item => remapWritingDecision(item, before, after, changes));
    return { decisions: mapped, activeIds: mapped.filter(item => item.type === 'acronym' || writingDecisionRange(after, item)).map(item => item.id) };
}

export function resolveWritingReview({ job, projection, observations, spelling = [], valeOutput, identities = [], identitySource, nextIdentity = 0 }) {
    const combined = [...observations, ...filterAcceptedSpelling(spelling, job.spelling.words)];
    if (valeOutput !== undefined) combined.push(...valeWritingObservations(valeOutput, projection));
    const result = resolveWritingFindings({ source: job.source, projection, observations: combined, preferences: job.preferences,
        decisions: job.decisions || [], language: job.language });
    const key = item => `${item.kind}:${item.intent}:${item.from}:${item.to}`;
    const prior = new Map((identitySource === undefined || identitySource === job.source ? identities
        : remapWritingDismissals(identities, identitySource, job.source)).map(item => [key(item), item]));
    for (const finding of result.findings) {
        const matches = new Set([finding, ...finding.members].map(item => prior.get(key(item))?.displayId).filter(Boolean));
        finding.displayId = matches.size === 1 ? [...matches][0] : `writing-${++nextIdentity}`;
        prior.set(key(finding), { kind: finding.kind, intent: finding.intent, from: finding.from, to: finding.to, displayId: finding.displayId });
    }
    result.cards = writingReviewCards(result.groups);
    result.inlineFindings = inlineWritingFindings({ ...result, current: job, analyzed: job });
    return { result, identities: [...prior.values()], nextIdentity };
}
