import { readFileSync } from 'node:fs';
import { analyzeWriting, writingRuntimeReady, prepareWritingSource } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings, valeWritingObservations, writingEngineConfiguration } from '../../../frontend/js/core/writingAnalysisModel.js';
import { writingTerminology, writingTextlintVersions, writingAcronymDefined, textlintWritingObservations, writingTextlintNeeded, writingTextlintProjection } from '../../../frontend/js/core/writingTextlintModel.js';
import { writingSuggestionExamples } from '../../../frontend/js/core/writingSuggestionModel.js';

async function review(source, lenses = ['grammar', 'consistency', 'plain']) {
    const result = resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: { lenses, language: 'en-US' } });
    expect(result.rejected).toBe(0);
    return result.groups.flatMap(group => group.findings);
}
const apply = (source, fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);

test('textlint skips ordinary prose and protected-only signals while preserving name and punctuation candidates', () => {
    const needed = source => writingTextlintNeeded(writingTextlintProjection(prepareWritingSource(source)));
    for (const source of ['The team wrote the report.', 'The file is 8.1Mib.', '"Javascript (draft)"', '`Github (`', 'Use \\( literally.']) expect(needed(source)).toBe(false);
    for (const source of ['We use Javascript.', 'A (draft.', 'A [draft.', 'A {draft.', 'A "draft.', 'A «draft.', 'A ‹draft.', 'A 「draft.', 'A （draft.', 'A 『draft.', 'A ｛draft.', 'A ［draft.', 'A 〚draft.', 'A 【draft.']) expect(needed(source)).toBe(true);
});

test('textlint initializes actual pinned rules before readiness and includes them in snapshot configuration', async () => {
    await expect(writingRuntimeReady).resolves.toBeUndefined();
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')).dependencies;
    expect(pkg['@textlint-rule/textlint-rule-no-unmatched-pair']).toBe(writingTextlintVersions.pairs);
    expect(pkg['textlint-rule-terminology']).toBe(writingTextlintVersions.terminology);
    expect(pkg['@textlint/kernel']).toBe(writingTextlintVersions.kernel);
    expect(pkg['@textlint/textlint-plugin-text']).toBe(writingTextlintVersions.parser);
    expect(writingEngineConfiguration).toMatchObject({ mapping: '11', terminology: writingTerminology, textlint: writingTextlintVersions });
});

test.each(['(', '[', '{', '"', '«', '‹'])('unmatched-pair maps the native position to the exact opening %s after Unicode and formatting', async mark => {
    const source = `😀 Before **${mark}unfinished** text.`;
    const findings = await review(source, ['grammar']);
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding).toMatchObject({ kind: 'grammar.unmatched-pair', actual: mark, from: source.indexOf(mark), fixes: [] });
    expect(finding.sources[0]).toMatchObject({ engine: 'textlint', package: '@textlint-rule/textlint-rule-no-unmatched-pair', version: '2.0.4' });
    expect(finding.sources[0].native.index).toBe(finding.sources[0].from + 1);
    expect(writingSuggestionExamples(finding)[0].label).toBe('Example');
});

test.each([
    'We reviewed (the draft).', 'Use [a label] here.', 'Use {braces} here.',
    'The report (first draft. Second draft.) is ready.',
    'We said "the draft" and “the draft”.', 'Use \\( as a literal.',
    '[A link](https://example.com/path) is here.',
    '`(hidden` and $(hidden$ and ![(hidden](image.png)',
    '> (quoted\n\n```txt\n(unclosed\n```',
    '---\nlabel: (hidden\n---\nPlain prose.',
])('unmatched-pair preserves balanced prose, literal escapes, and Markdown exclusions: %s', async source => {
    expect(await review(source, ['grammar'])).toEqual([]);
});

test('unmatched-pair treats mismatched closing types as advisory and never invents closing placement', async () => {
    const [finding] = await review('The draft (including the appendix] is here.', ['grammar']);
    expect(finding).toMatchObject({ kind: 'grammar.unmatched-pair', actual: '(', fixes: [] });
    const source = 'The draft (is ready.';
    const data = await analyzeWriting(source);
    const result = resolveWritingFindings({ source, ...data, observations: data.observations.map(raw => ({ ...raw, replacements: [')'] })), preferences: { lenses: ['grammar'] } });
    expect(result.groups[0].findings[0].fixes).toEqual([]);
});

test('unmatched-pair version boundary rejects native positions that do not identify their opening mark', () => {
    const projection = prepareWritingSource('A (missing close.');
    const native = { ruleId: '@textlint-rule/no-unmatched-pair', message: 'Cannot find a pairing character for (.', index: 3 };
    expect(textlintWritingObservations([native], projection)[0]).toMatchObject({ from: 2, to: 3, actual: '(' });
    for (const index of [-1, 0, 4, 500]) expect(textlintWritingObservations([{ ...native, index }], projection)).toEqual([]);
});

test.each(writingTerminology)('terminology offers the exact canonical spelling of %s, preserving source and package evidence', async term => {
    const source = `😀 We use **${term.toLowerCase()}** here.`;
    const [finding] = await review(source, ['consistency']);
    expect(finding).toMatchObject({ kind: 'style.terminology', actual: term.toLowerCase() });
    expect(finding.fixes[0].replacement).toBe(term);
    expect(apply(source, finding.fixes[0])).toBe(`😀 We use **${term}** here.`);
    expect(finding.sources[0]).toMatchObject({ engine: 'textlint', package: 'textlint-rule-terminology', version: '5.2.16' });
    expect(finding.sources[0].native.fix.text).toBe(term);
});

test('terminology preserves canonical case even when the source is all caps, and declines subjective default substitutions', async () => {
    const [finding] = await review('We use JAVASCRIPT.', ['consistency']);
    expect(finding.fixes[0].replacement).toBe('JavaScript');
    expect(await review('We use JavaScript, GitHub, PostgreSQL, and SQLite.', ['consistency'])).toEqual([]);
    expect(await review('Our website has a front-end. The Internet is useful.', ['consistency'])).toEqual([]);
    expect(await review('We use Javascript.', ['grammar'])).toEqual([]);
});

test.each([
    '"Javascript and Github"', '`Javascript` and $Github$',
    '---\nname: Javascript\n---\n> Github',
    './javascript https://example.com/github foo_javascript --javascript',
    '![Javascript](Github.png) and [label](Javascript)',
])('terminology does not rewrite quoted wording or technical/source tokens: %s', async source => {
    expect(await review(source, ['consistency'])).toEqual([]);
});

test.each(['We use Java&#115;cript.', 'We use Java**script**.'])('terminology preserves discontinuous and encoded Markdown: %s', async source => {
    const [finding] = await review(source, ['consistency']);
    expect(finding).toMatchObject({ kind: 'style.terminology', fixes: [] });
});

function acronymResult(source, acronym = 'SLO') {
    const projection = prepareWritingSource(source);
    const at = projection.text.indexOf(acronym);
    const prefix = projection.text.slice(0, at), line = prefix.split('\n').length;
    const column = Array.from(prefix.slice(prefix.lastIndexOf('\n') + 1)).length + 1;
    const observations = valeWritingObservations({ 'stdin.txt': [{ Check: 'Microsoft.Acronyms', Match: acronym,
        Line: line, Span: [column, column + acronym.length - 1], Message: 'native undefined acronym', Severity: 'suggestion' }] }, projection);
    return resolveWritingFindings({ source, projection, observations, preferences: { lenses: ['plain'] } });
}

test('undefined acronyms are contextual Plain language advice with pinned evidence and no guessed expansion', () => {
    const source = '😀 The **SLO** is ready.';
    const result = acronymResult(source), finding = result.groups[0].findings[0];
    expect(finding).toMatchObject({ kind: 'clarity.undefined-acronym', lens: 'plain', actual: 'SLO', fixes: [] });
    expect(finding.sources[0]).toMatchObject({ package: 'Microsoft', packageVersion: writingEngineConfiguration.microsoft });
    expect(writingSuggestionExamples(finding)[0].label).toBe('Example');
    expect(writingSuggestionExamples(finding)[0].after).toContain('service level objective');
});

test.each([
    'The service level objective (SLO) is ready. Our SLO matters.',
    'The SLO is ready. Define the service level objective (SLO).',
    'The **service level objective** (SLO) is ready.',
    'The SLO is ready. A service level\nobjective (SLO) sets the target.',
    'A service\nlevel\nobjective (SLO) sets the target. The SLO is ready.',
])('lowercase acronym definitions anywhere in eligible prose prevent misleading undefined advice: %s', source => {
    expect(writingAcronymDefined('SLO', prepareWritingSource(source))).toBe(true);
    expect(acronymResult(source).count).toBe(0);
});

test.each([
    'SLO is ready. "service level objective (SLO)"',
    'SLO is ready. `service level objective (SLO)`',
    'SLO is ready. service level\n\nobjective (SLO)',
    'SLO is ready. unrelated words (SLO)',
])('acronym definitions cannot be inferred from hidden text, unrelated initials, or another block: %s', source => {
    expect(writingAcronymDefined('SLO', prepareWritingSource(source))).toBe(false);
    expect(acronymResult(source).count).toBe(1);
});

test('familiar ATM/PIN exceptions preserve existing redundant-acronym review without extra undefined advice', () => {
    for (const acronym of ['ATM', 'PIN']) expect(acronymResult(`Use the ${acronym}.`, acronym).count).toBe(0);
});

test('ordinary uppercase words and draft headings are not treated as undefined acronyms', () => {
    for (const word of ['MUST', 'NEVER', 'STOP', 'DRAFT', 'HELLO', 'WORLD']) expect(acronymResult(`# ${word}\n\nWe ${word} finish.`, word).count).toBe(0);
    expect(acronymResult('We agreed on an SLO.').count).toBe(1);
});

test('all new browser rules leave attached number-unit forms including 8.1Mib unchanged', async () => {
    const source = 'The file is 8.1Mib, the disk holds 10MB, and the delay is 20ms.';
    expect(await review(source)).toEqual([]);
    const manifest = JSON.parse(readFileSync('internal/writing/styles/Microsoft/SOURCE.json', 'utf8'));
    expect(manifest.revision).toBe(writingEngineConfiguration.microsoft);
    expect(Object.keys(manifest.sha256)).toEqual(['Acronyms.yml', 'Adverbs.yml', 'Jargon.yml', 'Passive.yml', 'SentenceLength.yml', 'Wordiness.yml']);
});

test('the bundled lowercase dictionary distinguishes ordinary capitals from undefined acronyms', () => {
    for (const word of ['KEEP', 'SHORT', 'DREAM', 'BRING']) expect(acronymResult(`PLEASE ${word} THIS DRAFT.`, word).count).toBe(0);
    for (const acronym of ['SLO', 'UXD', 'CPU']) expect(acronymResult(`We use ${acronym}.`, acronym).count).toBe(1);
});

test.each([
    'User-experience design (UXD) guides the work. We use UXD.',
    'We use UXD. User-experience design (UXD) guides the work.',
    'User-**experience** design (UXD) guides the work.',
])('hyphenated acronym expansions define their initials throughout eligible prose: %s', source => {
    expect(acronymResult(source, 'UXD').count).toBe(0);
});

test.each([
    'We use UXD. `User-experience design (UXD)`',
    'We use UXD. "User-experience design (UXD)"',
    'We use UXD.\n\n> User-experience design (UXD)',
    'We use UXD. User-experience\n\ndesign (UXD)',
])('hyphenated acronym expansions cannot cross protected text or blocks: %s', source => {
    expect(acronymResult(source, 'UXD').count).toBe(1);
});
