import { writingTestPorts } from '../support/writingPorts.js';
import { createWritingDecision } from '../../../frontend/js/core/writingDecisionsModel.js';
import { createWritingAnalysis } from '../../../frontend/js/usecases/writingAnalysis.js';
import { analyzeRetext, analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';
import { createWritingProse } from '../../../frontend/js/usecases/writingProse.js';
import { createWritingResultsView } from '../../../frontend/js/views/writingResultsView.js';

function snapshot(overrides = {}) { return { id: 'memo', revision: 1, source: 'We utilize it.', language: 'en-US',
    preferences: { primary: 'plain', overlays: [], profile: 'standard', language: 'en-US' }, spelling: { enabled: false, language: 'es' }, configuration: 'one', ...overrides }; }
async function ignore(controller, finding) {
    const current = controller.snapshot().current;
    const decisions = [...(current.decisions || []), createWritingDecision(finding, current.source, current.language, 'occurrence', `decision-${current.decisions?.length || 0}`)];
    const next = { ...current, decisions, configuration: JSON.stringify(decisions) };
    controller.update(next, { immediate: true }); await jest.advanceTimersByTimeAsync(0); return next;
}
function harness() {
    const retext = { analyze: jest.fn(source => analyzeWriting(source)), cancel: jest.fn() };
    const vale = { analyze: jest.fn(async () => '{}'), cancel: jest.fn() };
    const spelling = jest.fn(async () => []);
    const controller = createWritingAnalysis({ ...writingTestPorts, retext, vale, spelling, schedule: setTimeout, unschedule: clearTimeout });
    return { controller, retext, vale, spelling };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test.each(['repetition', 'consistency', 'readability'])('enabling %s fetches its newly restored Vale evidence after a Formulaic-only cached result', async lens => {
    const { controller, vale } = harness();
    const source = 'The draft is ready—we can send it.';
    controller.update(snapshot({ source, preferences: { language: 'en-US', lenses: ['formulaic'] } }), { immediate: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(vale.analyze).not.toHaveBeenCalled();
    let finish;
    vale.analyze.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    controller.update(snapshot({ source, configuration: lens, preferences: { language: 'en-US', lenses: [lens] } }), { immediate: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(vale.analyze).toHaveBeenCalledTimes(1);
    controller.update(snapshot({ revision: 2, source: 'The next draft.', configuration: lens, preferences: { language: 'en-US', lenses: [lens] } }));
    expect(controller.snapshot().current.source).toBe('The next draft.');
    expect(controller.snapshot().count).toBe(0);
    finish('{}'); await jest.advanceTimersByTimeAsync(500);
    expect(controller.snapshot().states.vale).toBe('complete');
    controller.destroy();
});

test('writing analysis coalesces typing and applies one safe fix after real normalization', async () => {
    const { controller, retext } = harness();
    controller.update(snapshot());
    controller.update(snapshot({ revision: 2, source: 'We utilize it again.' }));
    await jest.advanceTimersByTimeAsync(499); expect(retext.analyze).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); expect(retext.analyze).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().count).toBe(1);
    const finding = controller.snapshot().findings[0], apply = jest.fn();
    expect(controller.fix(finding.id, 0, snapshot({ revision: 2, source: 'We utilize it again.' }), apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith({ from: 3, to: 10, expected: 'utilize', replacement: 'use' });
    await ignore(controller, finding); expect(controller.snapshot().count).toBe(0);
    controller.destroy();
});

test('late writing results cannot cross a document switch and only the latest snapshot is queued', async () => {
    const { controller, retext } = harness();
    let finish;
    retext.analyze.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    controller.update(snapshot(), { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    controller.update(snapshot({ id: 'second', revision: 2 }));
    controller.update(snapshot({ id: 'third', revision: 3, source: 'A normal sentence.' }));
    await jest.advanceTimersByTimeAsync(500);
    expect(retext.analyze).toHaveBeenCalledTimes(1);
    finish(analyzeRetext('We utilize it.')); await jest.advanceTimersByTimeAsync(0);
    expect(retext.analyze).toHaveBeenCalledTimes(2);
    expect(controller.snapshot().current.id).toBe('third');
    expect(controller.snapshot().count).toBe(0);
    controller.destroy();
});

test('Formulaic writing debounces typing and rejects delayed Slopless results for an older draft', async () => {
    const { controller, retext } = harness();
    const preferences = { lenses: ['formulaic'], language: 'en-US' };
    const source = 'The draft is ready—we can send it.';
    let finish;
    retext.analyze.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    controller.update(snapshot({ source, preferences }));
    await jest.advanceTimersByTimeAsync(499);
    expect(retext.analyze).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    controller.update(snapshot({ revision: 2, source: 'The draft is ready. We can send it.', preferences }));
    expect(controller.snapshot().count).toBe(0);
    await jest.advanceTimersByTimeAsync(500);
    expect(retext.analyze).toHaveBeenCalledTimes(1);
    finish(await analyzeWriting(source));
    await jest.advanceTimersByTimeAsync(0);
    expect(retext.analyze).toHaveBeenCalledTimes(2);
    expect(controller.snapshot()).toMatchObject({ count: 0, states: { retext: 'complete' }, current: { revision: 2 } });
    controller.destroy();
});

test('one failed writing analyzer preserves usable partial results and disabled checks do not run', async () => {
    const { controller, vale, retext, spelling } = harness();
    vale.analyze.mockRejectedValue(new Error('deadline exceeded'));
    controller.update(snapshot(), { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot()).toMatchObject({ count: 1, states: { retext: 'complete', vale: 'timed out', spelling: 'disabled' } });
    expect(spelling).not.toHaveBeenCalled();
    controller.update(snapshot({ configuration: 'disabled', language: 'none' }), { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(retext.analyze).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().count).toBe(0);
    controller.update(snapshot({ configuration: 'spelling-only', preferences: { primary: 'spelling' } }), { immediate: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().states).toMatchObject({ retext: 'disabled', vale: 'disabled' });
    controller.destroy();
});

test('writing spelling reanalyzes after dictionary changes and hides accepted words', async () => {
    const { controller, spelling } = harness();
    spelling.mockResolvedValue([{ engine: 'spelling', rule: 'figaro-spelling', from: 0, to: 3, actual: 'teh', replacements: ['the'] }]);
    const initial = snapshot({ source: 'teh', preferences: { primary: 'spelling' }, spelling: { enabled: true, language: 'en-US', words: [] } });
    controller.update(initial, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().count).toBe(1);
    controller.update({ ...initial, configuration: 'dictionary-updated', spelling: { ...initial.spelling, words: ['teh'] } }, { immediate: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(spelling).toHaveBeenCalledTimes(2);
    expect(controller.snapshot().count).toBe(0);
    controller.destroy();
});

test('writing lens changes reuse current evidence while display identity follows unchanged prose', async () => {
    const { controller, retext } = harness();
    const initial = snapshot({ source: 'The report was written. We utilize it.', preferences: { lenses: ['plain'] } });
    controller.update(initial, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    const word = controller.snapshot().findings.find(item => item.actual === 'utilize');
    const ignored = await ignore(controller, word);
    const direct = { ...ignored, configuration: 'direct', preferences: { lenses: ['plain', 'direct'] } };
    controller.update(direct, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(retext.analyze).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().count).toBe(1);
    controller.update({ ...direct, revision: 2, source: 'Today.\n\n' + direct.source });
    expect(controller.snapshot().count).toBe(0);
    await jest.advanceTimersByTimeAsync(500);
    expect(controller.snapshot().findings.find(item => item.actual === 'utilize').displayId).toBe(word.displayId);
    controller.update(null); expect(controller.snapshot().count).toBe(0);
    controller.update(direct, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().findings.find(item => item.actual === 'utilize').displayId).not.toBe(word.displayId);
    controller.destroy();
});

test('a wider Vale passive observation retains the already displayed retext occurrence identity', async () => {
    const { controller, vale } = harness();
    let finish;
    vale.analyze.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    controller.update(snapshot({ source: 'The report was written.', preferences: { primary: 'direct', profile: 'direct' } }), { immediate: true });
    await jest.advanceTimersByTimeAsync(0);
    const identity = controller.snapshot().findings[0].displayId;
    finish(JSON.stringify({ 'stdin.txt': [{ Check: 'write-good.Passive', Line: 1, Span: [12, 22], Match: 'was written' }] }));
    await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().findings).toHaveLength(1);
    expect(controller.snapshot().findings[0]).toMatchObject({ displayId: identity, from: 11, to: 22 });
    controller.destroy();
});

test.each([
    ['consistency', 'An email and an e-mail arrived.', 2],
    ['consistency', 'Beyonce sang.  Two songs followed.', 2],
    ['grammar', 'A example is useful.', 1],
    ['inclusive', 'The chairman spoke.', 1],
    ['formulaic', 'The draft is ready—we can send it.', 1],
    ['readability', 'Before we publish the final report, we need to review the examples with the team, check every figure against the source material, explain the remaining limitations to our readers, and decide which recommendations should appear in the introduction.', 2],
])('the %s lens runs independently and requests its supporting engines', async (lens, source, count) => {
    const { controller, vale } = harness();
    controller.update(snapshot({ source, preferences: { lenses: [lens], language: 'en-US' } }), { immediate: true });
    await jest.advanceTimersByTimeAsync(0);
    const needsVale = ['consistency', 'readability'].includes(lens);
    expect(controller.snapshot()).toMatchObject({ count, states: { retext: 'complete', vale: needsVale ? 'complete' : 'disabled' } });
    expect(vale.analyze).toHaveBeenCalledTimes(needsVale ? 1 : 0);
    controller.destroy();
});

test('enabling Directness after new lenses requests missing Vale evidence before reusing it', async () => {
    const { controller, vale } = harness();
    const initial = snapshot({ source: 'A example was written.', preferences: { lenses: ['grammar'] } });
    controller.update(initial, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(vale.analyze).not.toHaveBeenCalled();
    controller.update({ ...initial, configuration: 'with-direct', preferences: { lenses: ['grammar', 'direct'] } }, { immediate: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(vale.analyze).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().count).toBe(2);
    controller.destroy();
});

test('new-lens analysis failures retry without inventing unavailable Vale checks or retaining stale fixes', async () => {
    const { controller, retext, vale } = harness();
    retext.analyze.mockRejectedValueOnce(new Error('Worker unavailable'));
    controller.update(snapshot({ source: 'A example.', preferences: { lenses: ['grammar'] } }), { immediate: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot()).toMatchObject({ count: 0, states: { retext: 'failed', vale: 'disabled' } });
    controller.retry(); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot()).toMatchObject({ count: 1, states: { retext: 'complete', vale: 'disabled' } });
    expect(vale.analyze).not.toHaveBeenCalled(); controller.destroy();
});

test('Inclusive language retries failed analysis and rejects stale alternatives after edits or document switches', async () => {
    const { controller, retext } = harness();
    const current = snapshot({ source: 'The chairman spoke.', preferences: { lenses: ['inclusive'] } });
    retext.analyze.mockRejectedValueOnce(new Error('Worker unavailable'));
    controller.update(current, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().states.retext).toBe('failed');
    controller.retry(); await jest.advanceTimersByTimeAsync(0);
    const finding = controller.snapshot().groups[0].findings[0], apply = jest.fn();
    expect(controller.fix(finding.id, 0, { ...current, revision: 2 }, apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(0);
    controller.update({ ...current, id: 'other' }, { immediate: true });
    expect(controller.fix(finding.id, 0, current, apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled(); controller.destroy();
});

test('spacing and diacritics retry together, allow individual Apply, and Ignore without changing prose', async () => {
    const { controller, retext, vale } = harness();
    const current = snapshot({ source: 'Beyonce sang.  Two songs followed.', preferences: { lenses: ['consistency'] } });
    retext.analyze.mockRejectedValueOnce(new Error('Worker unavailable'));
    controller.update(current, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot()).toMatchObject({ count: 0, states: { retext: 'failed' } });
    controller.retry(); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().count).toBe(2);
    const findings = controller.snapshot().groups.flatMap(group => group.findings), apply = jest.fn();
    for (const finding of findings) {
        expect(controller.fix(finding.id, 0, controller.snapshot().current, apply)).toBe(true);
        await ignore(controller, finding);
    }
    expect(apply.mock.calls.map(([fix]) => fix.replacement)).toEqual(['Beyoncé', 'sang. Two']);
    expect(controller.snapshot().current.source).toBe(current.source);
    expect(controller.snapshot().count).toBe(0);
    expect(vale.analyze).toHaveBeenCalledTimes(1);
    controller.destroy();
});

test('textlint terminology and punctuation remain usable after Vale fails, retry, and reject stale term edits', async () => {
    const { controller, vale } = harness();
    const current = snapshot({ source: 'We use Javascript (draft.', preferences: { lenses: ['plain', 'consistency', 'grammar'] } });
    vale.analyze.mockRejectedValueOnce(new Error('deadline exceeded'));
    controller.update(current, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot()).toMatchObject({ count: 2, states: { retext: 'complete', vale: 'timed out' } });
    controller.retry(); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().states.vale).toBe('complete');
    const findings = controller.snapshot().groups.flatMap(group => group.findings);
    const term = findings.find(item => item.kind === 'style.terminology');
    const pair = findings.find(item => item.kind === 'grammar.unmatched-pair');
    const apply = jest.fn();
    expect(controller.fix(term.id, 0, current, apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith({ from: 7, to: 17, expected: 'Javascript', replacement: 'JavaScript' });
    await ignore(controller, pair); expect(controller.snapshot().count).toBe(1);
    expect(controller.fix(term.id, 0, { ...current, id: 'other' }, apply)).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    controller.destroy();
});

test.each([
    ['language', { language: 'none', configuration: 'none' }],
    ['lens selection', { preferences: { primary: 'direct', profile: 'standard' }, configuration: 'standard' }],
    ['vault ownership', { id: 'other-vault/memo', source: 'Ordinary prose.', revision: 2 }],
])('late writing results are rejected after a %s change', async (_, changes) => {
    const { controller, vale } = harness();
    let finish;
    vale.analyze.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    controller.update(snapshot(), { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    controller.update(snapshot(changes));
    finish('{}'); await jest.advanceTimersByTimeAsync(500);
    expect(controller.snapshot().count).toBe(0);
    controller.destroy();
});

test('late background resolution is discarded after typing, language changes and disabling lenses', async () => {
    let complete;
    const review = { cancel: jest.fn(), resolve: jest.fn(() => new Promise(resolve => { complete = resolve; })) };
    const controller = createWritingAnalysis({ retext: { analyze: async source => analyzeWriting(source), cancel() {} },
        vale: { analyze: async () => '{}', cancel() {} }, spelling: async () => [], review, schedule: setTimeout, unschedule: clearTimeout });
    controller.update(snapshot(), { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(review.resolve).toHaveBeenCalledTimes(1);
    controller.update(snapshot({ revision: 2, source: 'New text.', language: 'none', preferences: { lenses: [] }, configuration: 'disabled' }));
    complete({ result: { count: 999, findings: [], groups: [] }, identities: [], nextIdentity: 0 });
    await jest.advanceTimersByTimeAsync(500);
    expect(controller.snapshot().count).toBe(0); expect(review.resolve).toHaveBeenCalledTimes(1);
    expect(review.cancel).toHaveBeenCalled(); controller.destroy();
});

test('later spelling cannot clear a failed prose recovery; partial results retain Retry until grammar is rebuilt', async () => {
    let finishSpelling;
    const recovered = createWritingProse({ analyze: jest.fn().mockRejectedValueOnce(new Error('recovery failed')).mockImplementation(analyzeWriting) });
    const review = { cancel: jest.fn(), resolve: jest.fn().mockRejectedValueOnce(new Error('worker unavailable')).mockImplementation(input => recovered.resolve(input)) };
    let controller;
    const view = createWritingResultsView({ onRetry: () => controller.retry() });
    controller = createWritingAnalysis({ review, retext: { analyze: analyzeWriting, cancel() {} }, vale: { analyze: jest.fn(), cancel() {} },
        spelling: () => new Promise(resolve => { finishSpelling = resolve; }), schedule: setTimeout, unschedule: clearTimeout,
        onChange: value => view.update(value) });
    const initial = snapshot({ source: 'We saw a apple on teh table.', preferences: { lenses: ['grammar', 'spelling'] }, spelling: { enabled: true, language: 'en-US', words: [] } });
    controller.update(initial, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().states.review).toBe('failed');
    const spelling = [{ engine: 'spelling', rule: 'figaro-spelling', from: 18, to: 21, actual: 'teh', replacements: ['the'] }];
    finishSpelling(spelling); await jest.advanceTimersByTimeAsync(0);
    expect(review.resolve.mock.calls.at(-1)[0].proseRequired).toBe(true);
    expect(controller.snapshot()).toMatchObject({ count: 1, states: { retext: 'complete', spelling: 'complete', review: 'failed' } });
    expect(view.element.querySelector('[role=status]').textContent).toContain('Partial results');
    const retry = [...view.element.querySelectorAll('button')].find(button => button.textContent === 'Retry analysis');
    expect(retry.hidden).toBe(false); retry.click(); await jest.advanceTimersByTimeAsync(0);
    finishSpelling(spelling); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot()).toMatchObject({ count: 2, states: { review: 'complete' } });
    expect(view.element.querySelector('[role=status]').textContent).toBe('2 suggestions');
    expect(retry.hidden).toBe(true); controller.destroy();
});

test.each([
    ['document', { id: 'next', revision: 2, source: 'Ordinary prose.', configuration: 'next' }],
    ['language', { language: 'none', preferences: { language: 'none', lenses: [] }, configuration: 'none' }],
])('a late recovered prose review cannot cross a %s change', async (_, next) => {
    let finish;
    const worker = createWritingProse({ analyze: () => new Promise(resolve => { finish = resolve; }) });
    const controller = createWritingAnalysis({ ...writingTestPorts,
        review: { resolve: input => worker.resolve(input), cancel() {} },
        retext: { analyze: analyzeWriting, cancel() {} }, vale: { analyze: async () => '{}', cancel() {} },
        spelling: async () => [], schedule: setTimeout, unschedule: clearTimeout });
    const initial = snapshot({ source: 'A apple.', preferences: { lenses: ['grammar'] } });
    controller.update(initial, { immediate: true }); await jest.advanceTimersByTimeAsync(0);
    controller.update({ ...initial, ...next });
    finish(await analyzeWriting(initial.source)); await jest.advanceTimersByTimeAsync(0);
    expect(controller.snapshot().count).toBe(0);
    expect(controller.snapshot().current).toMatchObject(next); controller.destroy();
});
