import { analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';
import { mergeWritingFindingsBySpan, planWritingBulkFix, writingBulkAvailable, writingFindingTier, writingReviewCards } from '../../../frontend/js/core/writingReviewModel.js';

async function snapshot(source, lenses = ['plain']) {
    const current = { source, id: 'memo', revision: 1, configuration: 'same', preferences: { lenses, language: 'en-US' } };
    return { ...resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: current.preferences }), analyzed: current, current, states: { retext: 'complete' } };
}

test('identical findings across 120 occurrences produce one review card and retain every occurrence', async () => {
    const result = await snapshot(Array(120).fill('We utilize tools.').join('\n\n'));
    const cards = writingReviewCards(result.groups);
    expect(cards).toHaveLength(1); expect(cards[0].findings).toHaveLength(120);
    const fixes = planWritingBulkFix(result, cards[0].findings[0].id, result.current);
    expect(fixes).toHaveLength(120);
});

test('bulk corrections include only eligible unignored prose and reject stale or overlapping plans entirely', async () => {
    const result = await snapshot('We utilize tools. We utilize words. `utilize` and “utilize” stay.');
    const id = result.groups[0].findings[0].id;
    expect(planWritingBulkFix(result, id, result.current)).toHaveLength(2);
    for (const changed of [{ revision: 2 }, { id: 'other' }, { configuration: 'changed' }, { source: 'changed source' }]) {
        expect(planWritingBulkFix(result, id, { ...result.current, ...changed })).toBeNull();
    }
    expect(planWritingBulkFix({ ...result, states: { spelling: 'analyzing' } }, id, result.current)).toBeNull();
    const first = result.groups[0].findings[0];
    expect(planWritingBulkFix({ ...result, groups: [{ findings: [first, { ...first, id: 'duplicate' }] }] }, id, result.current)).toBeNull();
    expect(planWritingBulkFix({ ...result, groups: [{ findings: [first] }] }, id, result.current)).toBeNull();
});

test('contextual article and inclusive advice may be grouped but never offers bulk replacement', async () => {
    for (const [source, lens] of [['A example. A example.', 'grammar'], ['The chairman spoke. The chairman spoke.', 'inclusive']]) {
        const result = await snapshot(source, [lens]);
        const card = writingReviewCards(result.groups)[0];
        expect(card.findings).toHaveLength(2);
        expect(planWritingBulkFix(result, card.findings[0].id, result.current)).toBeNull();
    }
});

describe('merged findings and review tiers', () => {
    const base = { actual: 'very', from: 10, to: 14, intent: 'review', sources: [] };
    const plain = { ...base, id: 'plain-very', kind: 'lexicon.complex-word', lens: 'plain', title: 'Simpler word', message: 'Consider a simpler word.', fixes: [] };
    const direct = { ...base, id: 'direct-very', kind: 'style.adverb', lens: 'direct', title: 'Review modifier', message: 'Consider a specific description.', fixes: [{ from: 10, to: 14, expected: 'very', replacement: '' }] };
    const spelling = { ...base, id: 'spell-teh', actual: 'teh', from: 30, to: 33, kind: 'grammar.spelling', lens: 'spelling', title: 'Spelling', message: 'Unknown word.', fixes: [{ from: 30, to: 33, expected: 'teh', replacement: 'the' }] };

    test('findings on the same text become one entry listing each reason and owning each fix', () => {
        const [merged, other] = mergeWritingFindingsBySpan([plain, direct, spelling]);
        expect(other).toBe(spelling);
        expect(merged.spanMembers.map(member => member.id)).toEqual(['plain-very', 'direct-very']);
        expect(merged.reasons.map(reason => reason.title)).toEqual(['Simpler word', 'Review modifier']);
        expect(merged.fixes).toEqual([{ ...direct.fixes[0], findingId: 'direct-very', index: 0 }]);
        expect(writingFindingTier(merged)).toBe('suggestion');
    });

    test('Proofreading findings are corrections and are listed before suggestions', () => {
        expect(writingFindingTier(spelling)).toBe('correction');
        expect(writingFindingTier(plain)).toBe('suggestion');
        const cards = writingReviewCards([{ findings: [plain, direct, spelling] }]);
        expect(cards.map(card => card.tier)).toEqual(['correction', 'suggestion']);
        expect(cards[1].findings[0].reasons).toHaveLength(2);
        // A merged entry never offers a bulk replacement across unrelated concerns.
        expect(writingBulkAvailable({ findings: [cards[1].findings[0], cards[1].findings[0]] })).toBe(false);
    });

    test('a merged entry that includes a correction is a correction', () => {
        const typo = { ...spelling, from: 10, to: 14, actual: 'very' };
        const [merged] = mergeWritingFindingsBySpan([plain, typo]);
        expect(merged.spanMembers[0]).toBe(typo);
        expect(writingFindingTier(merged)).toBe('correction');
    });
});

test('findings without a source range are never merged with each other', () => {
    const unplaced = [{ id: 'a', kind: 'x', title: 'A', message: 'a', fixes: [] }, { id: 'b', kind: 'y', title: 'B', message: 'b', fixes: [] }];
    expect(mergeWritingFindingsBySpan(unplaced)).toEqual(unplaced);
});
