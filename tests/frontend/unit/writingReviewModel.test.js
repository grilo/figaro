import { analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';
import { writingReviewCards, planWritingBulkFix } from '../../../frontend/js/core/writingReviewModel.js';

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
