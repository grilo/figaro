import { readFileSync } from 'node:fs';
import { analyzeRetext } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings, valeWritingObservations, writingEngineConfiguration } from '../../../frontend/js/core/writingAnalysisModel.js';
import { writingSuggestionExamples } from '../../../frontend/js/core/writingSuggestionModel.js';

function review(source, lenses = ['grammar', 'plain', 'consistency', 'inclusive', 'direct']) {
    return resolveWritingFindings({ source, ...analyzeRetext(source), preferences: { lenses, language: 'en-US' } }).groups.flatMap(group => group.findings);
}
const apply = (source, fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);

test.each([
    ['This isnt right.', 'isnt', "isn't"],
    ['This does’nt work.', 'does’nt', 'doesn’t'],
    ['Isnt it ready?', 'Isnt', "Isn't"],
    ['It doesn’t work and isnt ready.', 'isnt', 'isn’t'],
])('contraction fixes repair apostrophe placement and retain the authored style: %s', (source, actual, replacement) => {
    const [finding] = review(source, ['grammar']);
    expect(finding).toMatchObject({ kind: 'grammar.contraction', actual });
    expect(finding.fixes[0]).toMatchObject({ expected: actual, replacement });
    expect(finding.sources[0]).toMatchObject({ package: 'retext-contractions', version: '6.0.0' });
    expect(finding.sources[0].native.expected).toEqual([replacement.replace(/’/g, "'")]);
});

test('correct contraction typography belongs to Consistency and never becomes a grammar error', () => {
    const source = "We don't agree. We don’t agree. We don’t agree.";
    expect(review(source, ['grammar'])).toEqual([]);
    const [finding] = review(source, ['consistency']);
    expect(finding).toMatchObject({ kind: 'style.apostrophe', actual: "'" });
    expect(apply(source, finding.fixes[0])).toBe('We don’t agree. We don’t agree. We don’t agree.');
    expect(review('This does’nt work.', ['grammar', 'consistency'])).toHaveLength(1);
});

test('redundant acronyms provide individual syntax-safe fixes with original Unicode source offsets', () => {
    const source = '😀 Use your **PIN number** at the ATM machine.';
    const findings = review(source, ['plain']);
    expect(findings.map(finding => finding.kind)).toEqual(['style.redundant-acronym', 'style.redundant-acronym']);
    expect(findings.map(finding => finding.fixes[0].replacement)).toEqual(['PIN', 'ATM']);
    expect(apply(source, findings[0].fixes[0])).toBe('😀 Use your **PIN** at the ATM machine.');
    expect(review('Use a PIN and an ATM.', ['plain'])).toEqual([]);
});

test.each([
    ['Use "one" and “**two**”.', 'Use "one" and "**two**".'],
    ["Use ‘one’ and “two”.", "Use ‘one’ and ‘two’."],
    ["Use “she said 'hello' today”.", 'Use “she said ‘hello’ today”.'],
])('quotation fixes change all paired delimiters atomically while preserving wording and Markdown: %s', (source, expected) => {
    const [finding] = review(source, ['consistency']);
    expect(finding).toMatchObject({ kind: 'style.quotation' });
    expect(finding.fixes).toHaveLength(1);
    expect(apply(source, finding.fixes[0])).toBe(expected);
    expect(review(expected, ['consistency'])).toEqual([]);
});

test('encoded quotation delimiters remain advisory and consistent quote conventions stay untouched', () => {
    const [finding] = review('"One" and &ldquo;two&rdquo;.', ['consistency']);
    expect(finding.kind).toBe('style.quotation'); expect(finding.fixes).toEqual([]);
    for (const source of ['"One" and "two".', '“One” and “two”.', '‘One’ and ‘two’.']) expect(review(source, ['consistency'])).toEqual([]);
});

test('quotation fixes refuse non-delimiters, overlapping markers, and replacements that would alter quoted wording', () => {
    const source = '"One" and “two”.', data = analyzeRetext(source);
    const raw = data.observations.find(item => item.rule === 'retext-quotes');
    for (const quotationMarks of [
        [{ ...raw.quotationMarks[0], replacement: 'changed wording' }],
        [{ from: raw.from + 1, to: raw.from + 2, actual: 't', replacement: '"' }],
        [raw.quotationMarks[0], raw.quotationMarks[0]],
    ]) {
        const result = resolveWritingFindings({ source, ...data, observations: [{ ...raw, quotationMarks }], preferences: { lenses: ['consistency'] } });
        expect(result.findings[0].fixes).toEqual([]);
    }
});

test('Inclusive language is opt-in, contextual, retains package alternatives, and gives examples without inventing edits', () => {
    const source = 'The chairman spoke. Obviously, we can change it.';
    expect(review(source, ['grammar', 'plain'])).toEqual([]);
    const findings = review(source, ['inclusive']);
    expect(findings.map(finding => finding.actual)).toEqual(['chairman', 'Obviously']);
    expect(findings[0].message).toContain('in some contexts');
    expect(findings[0].fixes.map(fix => fix.replacement)).toContain('chairperson');
    expect(findings[0].sources[0]).toMatchObject({ package: 'retext-equality', version: '7.1.0' });
    expect(writingSuggestionExamples(findings[0])).toEqual(expect.arrayContaining([expect.objectContaining({ before: 'chairman', after: 'chairperson' })]));
    expect(findings[1].fixes).toEqual([]);
    expect(writingSuggestionExamples(findings[1])[0].label).toBe('Example');
    expect(review('The chair spoke. We can change the setting.', ['inclusive'])).toEqual([]);
});

test.each([
    '> The chairman isnt using an ATM machine.\n\n`chairman isnt ATM machine` and $chairman isnt$',
    '"The chairman isnt using an ATM machine."',
    '‘The chairman isnt using an ATM machine.’',
    '---\nchairman: isnt\n---\n```text\nchairman isnt ATM machine\n```',
    '![chairman isnt](chairman.png) https://example.com/chairman foo_chairman ./chairman --chairman',
])('all new prose packages preserve protected quotations, code, metadata, and technical tokens: %s', source => {
    expect(review(source)).toEqual([]);
});

test('proselint uses the pinned package, merges identical cliché/jargon occurrences, and retains independent advisory goals', () => {
    const source = '😀 At the end of the day, I would argue that this works!!';
    const data = analyzeRetext(source);
    const alert = (Check, Match) => {
        const from = source.indexOf(Match);
        return { Check, Match, Line: 1, Span: [Array.from(source.slice(0, from)).length + 1, Array.from(source.slice(0, from + Match.length)).length], Severity: 'error', Message: 'native advice', Action: { Name: 'replace', Params: ['unsafe'] } };
    };
    const observations = valeWritingObservations({ 'stdin.txt': [alert('proselint.Cliches', 'At the end of the day'), alert('proselint.CorporateSpeak', 'At the end of the day'), alert('proselint.Hedging', 'I would argue that'), alert('proselint.Hyperbole', 'works!!')] }, data.projection);
    const result = resolveWritingFindings({ source, ...data, observations, preferences: { lenses: ['plain', 'direct'] } });
    expect(result.rejected).toBe(0); expect(result.count).toBe(3);
    expect(result.findings[0].sources).toHaveLength(2);
    for (const finding of result.findings) {
        expect(finding.severity).toBe('advisory'); expect(finding.fixes).toEqual([]);
        expect(writingSuggestionExamples(finding)[0].label).toBe('Example');
        expect(finding.sources[0]).toMatchObject({ package: 'proselint', packageVersion: writingEngineConfiguration.proselint });
    }
    const manifest = JSON.parse(readFileSync('internal/writing/styles/proselint/SOURCE.json', 'utf8'));
    expect(manifest.revision).toBe(writingEngineConfiguration.proselint);
    expect(Object.keys(manifest.sha256).sort()).toEqual(['Airlinese.yml', 'Archaisms.yml', 'Cliches.yml', 'CorporateSpeak.yml', 'Hedging.yml', 'Hyperbole.yml', 'Jargon.yml', 'Malapropisms.yml', 'Oxymorons.yml', 'RASSyndrome.yml', 'Skunked.yml', 'Spelling.yml', 'Uncomparables.yml', 'Very.yml']);
});
