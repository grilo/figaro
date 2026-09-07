import { analyzeWriting, analyzeRetext } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings, valeWritingObservations } from '../../../frontend/js/core/writingAnalysisModel.js';
import { createWritingDecision } from '../../../frontend/js/core/writingDecisionsModel.js';
import { inclusiveAdvisoryRules } from '../../../frontend/js/core/writingPackagePolicy.js';
import { writingSuggestionExamples } from '../../../frontend/js/core/writingSuggestionModel.js';
import { readFileSync, readdirSync } from 'node:fs';
import valeFixtures from '../../fixtures/writing-package-review.json';
import inclusiveFixtures from '../../fixtures/writing-inclusive-review.json';
import inventory from '../../fixtures/writing-package-inventory.json';
const visible = result => result.groups.flatMap(g => g.findings);
const resolve = (source, data, lenses, decisions = []) => resolveWritingFindings({ source, ...data, preferences: { language: 'en-US', lenses }, decisions });

test.each(Object.keys(inventory))('package review accounts for every pinned %s rule and matches the bundled selection', name => {
    const { included, excluded } = inventory[name];
    const docs = readFileSync('docs/WRITING_PACKAGE_REVIEW.md', 'utf8').split(`### ${name}\n`)[1].split(/\n##/u)[0];
    const ruleList = prefix => [...docs.split(prefix)[1].split('\n')[0].matchAll(/`([^`]+)`/gu)].map(match => match[1]);
    expect(ruleList('Included (')).toEqual(included);
    expect(ruleList('Excluded (')).toEqual(excluded);
    expect(new Set([...included, ...excluded]).size).toBe(included.length + excluded.length);
    const files = readdirSync(`internal/writing/styles/${name}`).filter(f => f.endsWith('.yml')).map(f => f.slice(0, -4)).sort();
    expect(files).toEqual(included);
});

test('Microsoft sentence-length anchors cannot create word-only or protected-content readability advice', () => {
    const prose = 'Before we publish the final report, we need to review the examples with the team, check every figure against the source material, explain the remaining limitations to our readers, and decide which recommendations should appear in the introduction.';
    for (const source of [`# ${prose}`, prose.replace('final report', '`final report`')]) {
        const { projection } = analyzeRetext(source);
        const from = projection.text.indexOf('Before');
        const output = { 'stdin.txt': [{ Check: 'Microsoft.SentenceLength', Line: 1, Span: [from + 1, from + 6], Match: 'Before' }] };
        expect(valeWritingObservations(output, projection)).toEqual([]);
    }
    const { projection } = analyzeRetext(prose);
    const output = { 'stdin.txt': [{ Check: 'Microsoft.SentenceLength', Line: 1, Span: [1, 6], Match: 'invented' }] };
    expect(resolve(prose, { projection, observations: valeWritingObservations(output, projection) }, ['readability']).rejected).toBe(1);
});

test.each(valeFixtures)('restored $rule remains independently available in $lens with safe advice', ({ rule, source, actual, nativeActual = actual, lens, kind }) => {
    const data = analyzeRetext(source), from = data.projection.text.indexOf(nativeActual);
    expect(from).toBeGreaterThanOrEqual(0);
    const alerts = { 'stdin.txt': [{ Check: rule, Line: 1, Match: nativeActual, Span: [Array.from(data.projection.text.slice(0, from)).length + 1, Array.from(data.projection.text.slice(0, from + nativeActual.length)).length] }] };
    const input = { projection: data.projection, observations: valeWritingObservations(alerts, data.projection) };
    const [finding] = visible(resolve(source, input, [lens]));
    expect(finding).toMatchObject({ kind, lens, sourceText: actual, fixes: [] });
    expect(writingSuggestionExamples(finding).length).toBeGreaterThan(0);
    expect(visible(resolve(source, input, ['spelling']))).toEqual([]);
});

test('same phrase merges across Plain and Formulaic while fixes come only from enabled lenses', async () => {
    const source = 'We left in order to catch the train.', data = await analyzeWriting(source);
    const [formulaic] = visible(resolve(source, data, ['formulaic']));
    const [plain] = visible(resolve(source, data, ['plain']));
    const combined = visible(resolve(source, data, ['plain', 'formulaic']));
    expect(combined).toHaveLength(1);
    expect(formulaic).toMatchObject({ id: plain.id, lens: 'formulaic', lenses: ['plain', 'formulaic'], fixes: [] });
    expect(plain.fixes.map(f => f.replacement)).toEqual(['to']);
    expect(combined[0].fixes).toEqual(plain.fixes);
    expect(combined[0].sources.map(s => s.rule)).toEqual(['retext-simplify', 'slopless/wordiness']);
    const saved = JSON.parse(JSON.stringify([createWritingDecision(formulaic, source, 'en-US', 'occurrence', 'shared')]));
    for (const lenses of [['plain'], ['formulaic'], ['plain', 'formulaic']]) expect(visible(resolve(source, data, lenses, saved))).toEqual([]);
    expect(visible(resolve(source, data, ['plain', 'formulaic']))).toHaveLength(1);
});

test('independent Formulaic cliché evidence merges the same concern from Vale without requiring Plain', async () => {
    const source = 'We need to get the ball rolling.', data = await analyzeWriting(source);
    const raw = data.observations.find(r => r.rule === 'slopless/corporate-speak');
    data.observations.push({ ...raw, engine: 'vale', package: 'proselint', rule: 'proselint.CorporateSpeak' });
    for (const lenses of [['plain'], ['formulaic'], ['plain', 'formulaic']]) {
        const found = visible(resolve(source, data, lenses));
        expect(found).toHaveLength(1); expect(found[0].sources).toHaveLength(2);
    }
});

test('Plain language retains contextual advice while preserving technical request nouns', () => {
    const source = 'The request contains a body and a response code.', data = analyzeRetext(source);
    const findings = visible(resolve(source, data, ['plain']));
    expect(findings.map(f => f.actual)).toEqual(['contains']);
    for (const finding of findings) {
        expect(finding.fixes).toEqual([]); expect(finding.message).toContain('contextual review');
        expect(writingSuggestionExamples(finding)[0].label).toBe('Example');
    }
});

test('word frequency identifies each repeated word independently and keeps Ignore scoped to that concern', async () => {
    const source = 'The plan covers costs. The plan covers dates. The plan covers roles. The plan covers risks. The plan covers tests. The plan covers work.';
    const data = await analyzeWriting(source), found = visible(resolve(source, data, ['formulaic']));
    const frequencies = found.filter(f => f.kind === 'formulaic.word-frequency');
    expect(frequencies.map(f => f.actual)).toEqual(['plan', 'covers']);
    expect(frequencies.every(f => f.message.includes('appears 6 times'))).toBe(true);
    const saved = [createWritingDecision(frequencies[0], source, 'en-US', 'occurrence', 'plan')];
    const after = visible(resolve(source, data, ['formulaic'], saved));
    expect(after.some(f => f.kind === 'formulaic.word-frequency' && f.actual === 'covers')).toBe(true);
    expect(after.some(f => f.kind === 'formulaic.sentence-starts')).toBe(true);
});

test('inclusive review fixtures cover the complete expanded advisory policy', () => {
    expect(inclusiveFixtures.map(f => f.ruleId)).toEqual(inclusiveAdvisoryRules);
});
test.each(inclusiveFixtures)('Inclusive language restores contextual $ruleId advice without unreviewed replacements', ({ ruleId, phrase }) => {
    const source = `Consider ${phrase} here.`, data = analyzeRetext(source);
    const finding = visible(resolve(source, data, ['inclusive'])).find(f => f.sources.some(raw => raw.ruleId === ruleId));
    expect(finding).toMatchObject({ kind: 'language.inclusive', fixes: [] });
});
