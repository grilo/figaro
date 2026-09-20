import fixtures from '../../fixtures/writing-grammar-native.json';
import { analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings, valeWritingObservations, writingEngineConfiguration } from '../../../frontend/js/core/writingAnalysisModel.js';
import { writingGrammarRules, writingGrammarReplacements, writingGrammarVersion } from '../../../frontend/js/core/writingGrammarModel.js';

async function review(fixture) {
    const { projection, observations } = await analyzeWriting(fixture.source);
    expect(projection.text).toBe(fixture.projectionText);
    const native = valeWritingObservations(fixture.native, projection);
    return resolveWritingFindings({ source: fixture.source, projection, observations: [...observations, ...native], preferences: { lenses: ['grammar'], language: 'en-US' } });
}
test.each(fixtures.fixtures.map(f => [f.rule, f]))('reviewed native %s maps to Proofreading with only approved actions', async (_, fixture) => {
    const finding = (await review(fixture)).findings.find(item => item.members.some(x => x.raw.rule === fixture.rule));
    expect(finding).toBeDefined();
    expect(finding.lens).toBe('grammar');
    expect(finding.title).toBe(writingGrammarRules[fixture.rule].title);
    expect(finding.intent).toBe(fixture.rule);
    expect(finding.sourceText).toBe(fixture.actual);
    expect(finding.fixes.map(fix => fix.replacement).sort()).toEqual([...fixture.replacements].sort());
    for (const fix of finding.fixes) expect(fixture.source.slice(fix.from, fix.to)).toBe(fix.expected);
});
test.each(fixtures.probes.map(f => [f.name, f]))('grammar preserves Markdown context: %s', async (_, fixture) => {
    const result = await review(fixture);
    const grammar = result.findings.filter(item => writingGrammarRules[item.intent] && !item.suppressed);
    if (fixture.withheld) { expect(grammar).toEqual([]); return; }
    expect(grammar).toHaveLength(fixture.count || 1);
    for (const finding of grammar) {
        expect(finding.intent).toBe(fixture.rule);
        expect(finding.fixes.length > 0).toBe(fixture.fix);
        for (const fix of finding.fixes) expect(fixture.source.slice(fix.from, fix.to)).toBe(fix.expected);
    }
    if (fixture.name === 'double article overlap') expect(result.findings.filter(f => f.kind === 'grammar.article' && !f.suppressed)).toEqual([]);
});
test('grammar configuration and allowlist cannot grant arbitrary native fixes', () => {
    expect(writingEngineConfiguration.grammar).toBe(writingGrammarVersion);
    expect(Object.keys(writingGrammarRules).sort()).toEqual(fixtures.fixtures.map(f => f.rule).sort());
    for (const Check of ['Harper.Unreviewed', 'Microsoft.Passive', 'Harper.TheMy']) expect(writingGrammarReplacements({ Check, Action: { Name: 'replace', Params: ['bad'] } })).toEqual([]);
    expect(writingGrammarReplacements({ Check: 'Harper.BetterOffWith', Action: { Name: 'edit', Params: ['delete'] } })).toEqual([]);
    expect(writingGrammarReplacements({ Check: 'Harper.BetterOffWith', Action: { Name: 'replace', Params: ['safe', '\nunsafe', 9, 'safe'] } })).toEqual(['safe']);
});

test('dense single-line grammar preserves Unicode positions and per-review protected context', () => {
    const fragment = '😀 Your welcome. ';
    const text = fragment.repeat(500);
    const projection = { text, units: Array.from({ length: text.length }, (_, from) => ({ from, to: from + 1 })), regions: [{ start: 0, end: text.length }] };
    const alerts = Array.from({ length: 500 }, (_, i) => ({ Line: 1, Span: [i * 16 + 3, i * 16 + 6], Check: 'FigaroGrammar.YourPredicateAdjective', Match: 'Your' }));
    const findings = valeWritingObservations({ stdin: alerts }, projection);
    expect(findings).toHaveLength(500);
    findings.forEach((finding, i) => {
        expect(finding.from).toBe(i * fragment.length + 3);
        expect(text.slice(finding.from, finding.to)).toBe('Your');
    });
    const masked = { ...projection, units: projection.units.map((unit, i) => i === 0 ? { ...unit, hidden: true } : unit) };
    expect(valeWritingObservations({ stdin: alerts }, masked)).toEqual([]);
    expect(valeWritingObservations({ stdin: alerts.slice(0, 1) }, projection)).toHaveLength(1);
});
