import { createWritingDecision } from '../../../frontend/js/core/writingDecisionsModel.js';
import { readFileSync } from 'node:fs';
import { analyzeRetext } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings, writingEngineConfiguration, validateWritingFix } from '../../../frontend/js/core/writingAnalysisModel.js';
import { writingPackageObservation, readabilityOptions } from '../../../frontend/js/core/writingPackagePolicy.js';
import { writingSuggestionExamples } from '../../../frontend/js/core/writingSuggestionModel.js';

const complex = 'The implementation of multidisciplinary institutional reorganization necessitates comprehensive consideration of interconnected administrative responsibilities and organizational communication requirements.';
const long = 'Before we publish the final report, we need to review the examples with the team, check every figure against the source material, explain the remaining limitations to our readers, and decide which recommendations should appear in the introduction.';
function review(source, lenses = ['consistency', 'readability']) {
    return resolveWritingFindings({ source, ...analyzeRetext(source), preferences: { lenses, language: 'en-US' } });
}
const visible = result => result.groups.flatMap(group => group.findings);
const apply = (source, fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);

test('sentence spacing underlines meaningful context and offers a one-space fix with original whitespace evidence', () => {
    const source = '😀 One sentence.  Two sentences.';
    const [finding] = visible(review(source));
    expect(finding).toMatchObject({ kind: 'style.sentence-spacing', actual: 'sentence.  Two' });
    expect(finding.sources[0]).toMatchObject({ package: 'retext-sentence-spacing', version: '6.0.0', native: { actual: '  ', expected: [' '], preferred: 'space' } });
    expect(finding.fixes).toHaveLength(1);
    expect(apply(source, finding.fixes[0])).toBe('😀 One sentence. Two sentences.');
    expect(visible(review(apply(source, finding.fixes[0])))).toEqual([]);
    expect(writingSuggestionExamples(finding)).toEqual([{ label: 'Suggested spacing (2 spaces → 1)', before: 'sentence.  Two', after: 'sentence. Two' }]);
});

test.each([
    'One sentence. Two sentences.', 'One sentence.\nTwo sentences.',
    'One sentence.\r\nTwo sentences.', 'One sentence.  \nTwo sentences.',
    'One sentence.\\\nTwo sentences.', 'One sentence.\n\nTwo sentences.',
    'One sentence.\tTwo sentences.', 'Use a "safe" example.',
    '"One sentence."  Two sentences.', 'One sentence.  "Two sentences."',
])('sentence spacing preserves authored line breaks, block boundaries, and masked quotations: %s', source => {
    expect(visible(review(source, ['consistency'])).filter(item => item.kind === 'style.sentence-spacing')).toEqual([]);
});

test.each(['One sentence.&#32;&#32;Two sentences.', 'One **sentence.**  Two sentences.'])('sentence spacing cannot rewrite encoded or discontinuous Markdown source: %s', source => {
    const [finding] = visible(review(source));
    expect(finding.kind).toBe('style.sentence-spacing');
    expect(finding.fixes).toEqual([]);
});

test('sentence spacing policy refuses synthetic block gaps and hidden adjacent words even if text looks eligible', () => {
    const data = analyzeRetext('One sentence.  Two sentences.');
    const expanded = data.observations.find(item => item.rule === 'retext-sentence-spacing');
    const raw = { ...expanded, from: 13, to: 15, actual: '  ', replacements: [' '] };
    expect(writingPackageObservation(raw, data.projection)).toMatchObject({ actual: 'sentence.  Two' });
    for (const changes of [{ from: -1 }, { hidden: true }]) {
        const units = data.projection.units.map((unit, i) => i === 15 ? { ...unit, ...changes } : unit);
        expect(writingPackageObservation(raw, { ...data.projection, units })).toBeNull();
    }
    expect(writingPackageObservation(raw, { ...data.projection, regions: [] })).toBeNull();
});

test('diacritics suggestions retain names, context, capitalization and exact Unicode source offsets', () => {
    const source = '😀 **Beyonce** visited the CAFE with his resume.';
    const findings = visible(review(source));
    expect(findings.map(item => item.kind)).toEqual(Array(3).fill('style.diacritics'));
    expect(findings.map(item => item.fixes[0].replacement)).toEqual(['Beyoncé', 'CAFÉ', 'his résumé']);
    expect(apply(source, findings[0].fixes[0])).toBe('😀 **Beyoncé** visited the CAFE with his resume.');
    expect(findings[0].message).toContain('only if it fits');
    expect(findings[0].sources[0]).toMatchObject({ package: 'retext-diacritics', version: '5.0.0', native: { actual: 'Beyonce', expected: ['Beyoncé'] } });
    expect(visible(review('Beyoncé will resume work at the café.'))).toEqual([]);
    expect(visible(review('Beyonce visited the cafe.', ['grammar']))).toEqual([]);
});

test('diacritics spanning entities or emphasis remain advisory without rewriting markup', () => {
    for (const source of ['Beyon&#99;e sang.', 'Bey**on**ce sang.']) {
        const [finding] = visible(review(source));
        expect(finding.kind).toBe('style.diacritics'); expect(finding.fixes).toEqual([]);
    }
});

test('readability formulas add advice below 35 words, retain evidence, and never invent a rewrite or grade', () => {
    const [finding] = visible(review(complex));
    expect(finding).toMatchObject({ kind: 'readability.complex-sentence', actual: complex, fixes: [] });
    expect(finding.sources[0]).toMatchObject({ package: 'retext-readability', version: '8.0.0', ruleId: 'readability' });
    expect(finding.sources[0].native.message).toContain('algorithms');
    expect(finding.message).toContain('do not measure writing quality');
    expect(writingSuggestionExamples(finding)[0].label).toBe('Example');
    expect(visible(review(complex, ['grammar']))).toEqual([]);
    const injected = analyzeRetext(complex);
    const result = resolveWritingFindings({ source: complex, ...injected,
        observations: injected.observations.map(raw => ({ ...raw, replacements: ['fabricated rewrite'] })), preferences: { lenses: ['readability'] } });
    expect(visible(result)[0].fixes).toEqual([]);
});

test('readability preserves different length and complexity advice for the same sentence', () => {
    const source = long.replace('final report', '**final report**');
    const result = review(source);
    expect(result.count).toBe(2); expect(result.rejected).toBe(0);
    const finding = visible(result).find(f => f.kind === 'readability.long-sentence');
    expect(finding.kind).toBe('readability.long-sentence');
    expect(finding.sources.map(raw => raw.rule).sort()).toEqual(['figaro-long-sentence']);
    expect(finding.message).toContain('contains 38 words');
    expect(visible(result).find(f => f.kind === 'readability.complex-sentence').message).toContain('formulas');
    expect(finding.sourceText).toBe(source); expect(finding.fixes).toEqual([]);
    const data = analyzeRetext(source);
    const reversed = resolveWritingFindings({ source, ...data, observations: data.observations.slice().reverse(), preferences: { lenses: ['readability'] } });
    expect(visible(reversed)).toEqual(visible(result));
    const dismissed = resolveWritingFindings({ source, ...data, preferences: { lenses: ['readability'] }, decisions: [createWritingDecision(finding, source, 'en-US', 'occurrence', 'one')], language: 'en-US' });
    expect(dismissed.count).toBe(1);
    expect(visible(dismissed)[0].kind).toBe('readability.complex-sentence');
});

test.each([
    'Multidisciplinary institutional reorganization necessitates comprehensive consideration.',
    'We need to look at the plan and talk to the team before we make any changes.',
    `# ${complex}`, `| Notes |\n| --- |\n| ${complex} |`,
    complex.replace('institutional', '`institutional`'), complex.replace('institutional', '"institutional"'),
])('readability omits short/straightforward prose, headings, tables, and sentences crossing excluded content: %s', source => {
    expect(visible(review(source, ['readability']))).toEqual([]);
});

test.each([
    '> Beyonce visited the cafe.  Two sentences.',
    '"Beyonce visited the cafe.  Two sentences."',
    '---\nname: Beyonce\n---\n```text\nBeyonce visited the cafe.  Two sentences.\n```',
    '`Beyonce cafe` and $Beyonce cafe$ and ![Beyonce cafe](image.png)',
    'https://example.com/cafe ./cafe /cafe foo_cafe --cafe',
])('new packages leave protected code, metadata, quotations, and technical tokens alone: %s', source => {
    expect(visible(review(source))).toEqual([]);
});

test('new spacing and diacritics fixes reject stale source, configuration, and document ownership', () => {
    for (const source of ['Beyonce sang.', 'One sentence.  Two sentences.']) {
        const fix = visible(review(source))[0].fixes[0];
        const snapshot = { source, id: 'note', revision: 1, configuration: 'current' };
        expect(validateWritingFix(snapshot, snapshot, fix)).toBe(true);
        for (const change of [{ id: 'other' }, { revision: 2 }, { configuration: 'other' }, { source: 'Changed' }]) {
            expect(validateWritingFix(snapshot, { ...snapshot, ...change }, fix)).toBe(false);
        }
    }
});

test('new package pins and conservative readability policy participate in snapshot configuration', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const [name, key] of [['sentence-spacing', 'sentenceSpacing'], ['diacritics', 'diacritics'], ['readability', 'readability']]) {
        expect(writingEngineConfiguration[key]).toBe(pkg.dependencies[`retext-${name}`]);
    }
    expect(writingEngineConfiguration.mapping).toBe('11');
    expect(writingEngineConfiguration.readabilityOptions).toEqual(readabilityOptions);
    expect(readabilityOptions).toEqual({ age: 16, minWords: 15, threshold: 5 / 7 });
});
