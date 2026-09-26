import { analyzeWriting, analyzeWritingFull, createIncrementalWritingAnalyzer, prepareWritingSource } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';

const preferences = { lenses: ['plain', 'direct', 'formulaic', 'consistency'], language: 'en-US' };
const visible = result => result.groups.flatMap(group => group.findings);
const review = async source => resolveWritingFindings({ source, ...await analyzeWriting(source), preferences });

function nativeReview(source, actual, rule) {
    const projection = prepareWritingSource(source), from = projection.text.indexOf(actual);
    const raw = { engine: 'vale', rule, actual, from, to: from + actual.length, replacements: [] };
    return resolveWritingFindings({ source, projection, observations: [raw], preferences });
}

test.each([
    ['The callback is called after the promise settles.', 'is called'],
    ['The callbacks will be invoked before the next retry.', 'be invoked'],
    ['When `rejectOnClear` is enabled, pending promises are rejected.', 'is enabled'],
    ['When `rejectOnClear` is enabled, pending promises are rejected.', 'are rejected'],
    ['All retries will be aborted if the function throws.', 'be aborted'],
    ['The first mapper rejection will be rejected back to the consumer.', 'be rejected'],
    ['This is recommended if you await the returned promises.', 'is recommended'],
    ['The error that was thrown is available in the callback.', 'was thrown'],
    ['The function being retried by wrapping it in a callback receives arguments.', 'being retried'],
])('technical process descriptions preserve every passive-provider shape: %s', (source, actual) => {
    for (const [match, rule] of [[actual, 'write-good.Passive'], [actual, 'Microsoft.Passive'], [actual.split(' ').at(-1), 'retext-passive']]) {
        const result = nativeReview(source, match, rule);
        expect(visible(result)).toEqual([]);
        expect(result.evidence[0].suppressed).toBeTruthy();
    }
});

test.each([
    ['The requests were rejected by the manager.', 'were rejected'],
    ['The report was written yesterday.', 'was written'],
    ['The promises were broken.', 'were broken'],
    ['The function author was called by the supervisor.', 'was called'],
    ['The function runs. The manager was called yesterday.', 'was called'],
    ['The function runs.\n\nThis is recommended for the committee.', 'is recommended'],
])('Directness retains actor-focused and unrelated prose: %s', (source, actual) => {
    const result = nativeReview(source, actual, 'Microsoft.Passive');
    expect(result.evidence[0].suppressed).toBe('');
    if (/\bby\b/u.test(source)) expect(visible(result)).toHaveLength(1);
    else expect(result.findings[0].suppressed).toBe('Single passive without a named actor');
});

test('Directness shows actorless passives only where they cluster', async () => {
    const passives = async (source, matches) => {
        const { projection } = await analyzeWriting(source);
        const observations = matches.map(actual => {
            const from = projection.text.indexOf(actual);
            return { engine: 'vale', rule: 'Microsoft.Passive', actual, from, to: from + actual.length, replacements: [] };
        });
        return visible(resolveWritingFindings({ source, projection, observations, preferences })).map(finding => finding.actual);
    };
    expect(await passives('The report was written and was sent.', ['was written', 'was sent'])).toEqual(['was written', 'was sent']);
    expect(await passives('The report was written. It was sent. It was read.', ['was written', 'was sent', 'was read']))
        .toEqual(['was written', 'was sent', 'was read']);
    expect(await passives('The report was written. It was sent.', ['was written', 'was sent'])).toEqual([]);
    expect(await passives('The report was written.\n\nIt was sent. It was read.', ['was written', 'was sent', 'was read'])).toEqual([]);
    const named = resolveWritingFindings({ source: 'The report was written by Maya.', projection: prepareWritingSource('The report was written by Maya.'),
        observations: [{ engine: 'vale', rule: 'Microsoft.Passive', actual: 'was written', from: 11, to: 22, replacements: [] }], preferences });
    expect(visible(named)[0].message).toMatch(/names who acts/u);
});

test('ordinary vocabulary no longer creates synonym-only tasks while useful shortening remains', async () => {
    const source = 'The labels remain correct. This object contains values. However, the readings reflect differences. '
        + 'Provide a photo and identify its maker. The signal indicates readiness. Retain both copies. '
        + 'The result is equivalent. The tests establish a cause. There are multiple roots, i.e. several starting points. '
        + 'The promises are currently running. Retry immediately with no delay. We left in order to help.';
    const result = await review(source);
    const wordiness = visible(result).filter(finding => finding.kind === 'style.wordiness');
    expect(wordiness.map(finding => finding.actual)).toEqual(['in order to']);
    expect(wordiness[0].fixes.map(fix => fix.replacement)).toEqual(['to']);
    // Unreviewed matches stay only for wordy phrases and formal words, not everyday words such as “purchase”.
    const plain = visible(await review('We utilize this tool to facilitate a purchase with the exception of food.')).map(finding => finding.actual);
    expect(plain).toEqual(expect.arrayContaining(['utilize', 'facilitate', 'with the exception of']));
    expect(plain).not.toContain('purchase');
});

test.each([
    ['Most of the ocean is completely dark.', 'completely'],
    ['If you need a passport urgently, use the faster service.', 'urgently'],
    ['The instructions were deliberately short.', 'deliberately'],
    ['This is a deliberately incorrect test string.', 'deliberately'],
    ['The child took home a neatly mended bag.', 'neatly'],
    ['Their waiting quietly helped the clerk.', 'quietly'],
    ['The path is strictly a single directory.', 'strictly'],
])('meaningful manner and degree survive generic adverb advice: %s', (source, actual) => {
    expect(visible(nativeReview(source, actual, 'Microsoft.Adverbs'))).toEqual([]);
});

test.each([
    ['The report is completely amazing.', 'completely'],
    ['We urgently believe that this changes everything.', 'urgently'],
    ['This is very good.', 'very'],
])('broad emphasis remains reviewable: %s', (source, actual) => {
    expect(visible(nativeReview(source, actual, 'Microsoft.Adverbs'))).toMatchObject([{ kind: 'style.modifier' }]);
});

test.each([
    ['The first bus was usually crowded.', 'usually'],
    ['It is generally believed that the method works.', 'generally'],
    ['Pressure is slowly building up.', 'slowly'],
    ['Reading slowly is something that is perhaps inefficient.', 'slowly'],
    ['Scroll slowly through the list.', 'slowly'],
    ['Sales grew quickly after launch.', 'quickly'],
    ['The backlog has gradually increased.', 'gradually'],
])('vague degree, rate and frequency ask for specifics: %s', (source, actual) => {
    for (const rule of ['Microsoft.Adverbs', 'write-good.Weasel']) {
        const result = nativeReview(source, actual, rule);
        expect(visible(result)).toMatchObject([{ kind: 'style.vague-quantity', title: 'Be specific', legacyKind: 'style.modifier' }]);
    }
});

test('Formulaic punctuation honors authored quotation and apostrophe conventions independently', async () => {
    const typography = result => visible(result).filter(finding => ['style.quotation', 'style.apostrophe'].includes(finding.kind));
    for (const source of ['She said “ready”. It’s done.', 'Use ‘single quotes’.', 'It’s ready.', 'She said "ready". It\'s done.']) {
        expect(typography(await review(source))).toEqual([]);
    }
    const source = 'She said "ready". He said "done". They said “yes”. It\'s ready. It\'s done. It’s late.';
    const outliers = typography(await review(source));
    expect(outliers.map(finding => [finding.kind, finding.actual, finding.lens])).toEqual([
        ['style.quotation', '“yes”', 'formulaic'], ['style.apostrophe', '’', 'formulaic']]);
    expect(outliers.every(finding => finding.fixes.length === 1 && source.slice(finding.from, finding.to) === finding.actual)).toBe(true);
    // A tie follows the first occurrence, so the later straight quotation is the outlier.
    expect(typography(await review('She said “ready”. He said "done".')).map(finding => finding.actual)).toEqual(['"done"']);
    const protectedSource = '```text\n"straight" "quotes"\n```\n\nShe said “ready”.';
    expect(typography(await review(protectedSource))).toEqual([]);
});

test('relevance policy uses the current punctuation convention after incremental paragraph edits', async () => {
    const analyzer = createIncrementalWritingAnalyzer();
    const sources = ['Intro.\n\nShe said “ready”.', 'She said "one". He said "two".\n\nShe said “ready”.', 'Intro.\n\nShe said “ready”.'];
    const counts = [];
    for (const source of sources) {
        const incremental = await analyzer.analyze(source), full = await analyzeWritingFull(source);
        expect(incremental).toEqual(full);
        const result = resolveWritingFindings({ source, ...incremental, preferences });
        counts.push(visible(result).filter(finding => finding.kind === 'style.quotation').length);
    }
    expect(counts).toEqual([0, 1, 0]);
});
