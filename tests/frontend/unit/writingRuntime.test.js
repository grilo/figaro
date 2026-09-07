import { analyzeRetext, analyzeWriting, prepareWritingSource } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';
import editorial from '../../fixtures/writing-editorial.json';
const preferences = { primary: 'plain', overlays: ['direct', 'repetition'], profile: 'direct' };

test('pinned retext checks emit real passive, simplification, and repeated-word evidence', () => {
    const data = analyzeRetext('The report was written in order to help. The the team will utilize it.');
    expect([...new Set(data.observations.map(item => item.rule))].sort()).toEqual(['retext-passive', 'retext-repeated-words', 'retext-simplify']);
    expect(data.observations.find(item => item.rule === 'retext-passive')).toMatchObject({ actual: 'written', from: 15, to: 22, replacements: [] });
    expect(data.observations.find(item => item.rule === 'retext-repeated-words')).toMatchObject({ actual: 'The the', replacements: ['the'] });
});

test.each([
    ['😀 é\r\nWe utilize it.', 'use'],
    ['We work in order\nto help.', 'to'],
    ['The the team helps.', 'The'],
])('writing fixes preserve source offsets across Unicode, line endings, and case: %s', (source, replacement) => {
    const data = analyzeRetext(source);
    const result = resolveWritingFindings({ source, ...data, preferences });
    const fix = result.findings.find(item => item.fixes.length).fixes[0];
    expect(fix.replacement).toBe(replacement);
    expect(source.slice(fix.from, fix.to)).toBe(fix.expected);
});

test('writing entity/escape projections remain explanatory when edits would rewrite source syntax', () => {
    const source = 'We utilize it in&#32;order to help. We utilize it again.';
    const data = analyzeRetext(source);
    const result = resolveWritingFindings({ source, ...data, preferences });
    expect(result.findings.filter(item => item.kind === 'style.wordiness')[0].fixes).toEqual([]);
    expect(result.findings.filter(item => item.kind === 'lexicon.complex-word')).toHaveLength(2);
});

test('writing analysis never treats unfinished frontmatter as prose', () => {
    expect(analyzeRetext('---\nwriting-language: en-US\nutilize: in order to').observations).toEqual([]);
});

test.each(editorial)('reviewed writing fixture: $name', async ({ source, lenses, language = 'en-US', expected, workerExpected = expected }) => {
    const data = language.startsWith('en-') ? await analyzeWriting(source) : { observations: [] };
    const result = resolveWritingFindings({ source, ...data, preferences: { ...preferences, lenses } });
    expect(result.groups.flatMap(group => group.findings.map(item => item.kind)).sort()).toEqual(workerExpected.slice().sort());
});

test('Grammar & punctuation uses the pinned article checker and preserves sentence capitalization', () => {
    const source = '😀 A example is useful. It takes a hour. This is an useful idea , yes,, indeed.';
    const data = analyzeRetext(source);
    const result = resolveWritingFindings({ source, ...data, preferences: { lenses: ['grammar'], language: 'en-US' } });
    expect(result.rejected).toBe(0);
    const findings = result.groups.flatMap(group => group.findings);
    expect(findings.map(item => item.kind)).toEqual(['grammar.article', 'grammar.article', 'grammar.article', 'grammar.punctuation-spacing', 'grammar.repeated-comma']);
    expect(findings[0].sources[0]).toMatchObject({ rule: 'retext-indefinite-article', version: '5.0.0' });
    expect(findings.map(item => item.fixes[0].replacement)).toEqual(['An', 'an', 'a', 'idea,', ',']);
});

test.each([
    'Use a useful idea and an ordinary example. Wait... Really?!',
    'Use a "safe" example. Use a “safe” example. Use a `URL` endpoint.',
    'A\n\nexample in another paragraph.',
    '> a example ,\n\n`a example ,` and $a example$\n\n```txt\na example ,\n```',
])('Grammar & punctuation respects valid prose and protected context: %s', source => {
    const result = resolveWritingFindings({ source, ...analyzeRetext(source), preferences: { lenses: ['grammar'] } });
    expect(result.count).toBe(0);
});

test('Consistency maps fixes through Unicode and Markdown while protecting technical and quoted variants', () => {
    const source = '😀 Send an **email**. Another e-mail arrived. The PDF contains a pdf. `website` and web site. "offline" and off-line.';
    const result = resolveWritingFindings({ source, ...analyzeRetext(source), preferences: { lenses: ['consistency'] } });
    expect(result.rejected).toBe(0);
    const findings = result.groups.flatMap(group => group.findings);
    expect(findings.map(item => item.actual)).toEqual(['email', 'e-mail', 'PDF', 'pdf']);
    expect(findings.map(item => item.fixes[0].replacement)).toEqual(['e-mail', 'email', 'pdf', 'PDF']);
    const fix = findings[0].fixes[0];
    expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toContain('**e-mail**');
    const entity = 'An e&#45;mail arrived. Another email arrived.';
    const advisory = resolveWritingFindings({ source: entity, ...analyzeRetext(entity), preferences: { lenses: ['consistency'] } });
    expect(advisory.groups[0].findings[0].fixes).toEqual([]);
});

test('Readability uses real sentence boundaries and remains advisory across Markdown emphasis', () => {
    const long = 'Before we publish the final report, we need to review the examples with the team, check every figure against the source material, explain the remaining limitations to our readers, and decide which recommendations should appear in the introduction.';
    const source = `# Overview\n\nShort sentence. ${long.replace('final report', '**final report**')}\n\nAnother short sentence.`;
    const result = resolveWritingFindings({ source, ...analyzeRetext(source), preferences: { lenses: ['readability'] } });
    expect(result.rejected).toBe(0); expect(result.count).toBe(2);
    const finding = result.groups[0].findings.find(f => f.kind === 'readability.long-sentence');
    expect(finding.kind).toBe('readability.long-sentence');
    expect(source.slice(finding.from, finding.to)).toContain('**final report**');
    expect(finding.message).toMatch(/contains \d+ words/);
    expect(finding.fixes).toEqual([]);
});

test('writing prose protects wiki destinations, fragments and embeds while mapping only explicit labels', () => {
    const source = 'We utilize prose. [[utilize]] [[utilize#heading]] [[utilize|our reference]] ![[utilize]] ![[Target|utilize]] [[Target|**utilize**]] [utilize](utilize.md)';
    const projection = prepareWritingSource(source);
    const visible = projection.units.filter(unit => !unit.hidden && unit.from >= 0).map(unit => unit.char).join('');
    expect(visible.match(/utilize/g)).toHaveLength(3);
    expect(visible).not.toContain('Target'); expect(visible).not.toContain('heading');
    for (const target of ['[[utilize]]', '[[utilize#heading]]', '[[utilize|our reference]]', '![[utilize]]', '![[Target|utilize]]']) {
        const from = source.indexOf(target), to = from + target.length;
        expect(projection.units.filter(unit => unit.from >= from && unit.to <= to && !unit.hidden).map(unit => unit.char).join('')).toBe(target.includes('our reference') ? 'our reference' : '');
    }
});
