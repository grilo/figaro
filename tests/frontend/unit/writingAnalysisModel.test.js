import { resolveWritingFindings, valeWritingObservations, validateWritingFix, remapWritingDismissals, writingLanguage } from '../../../frontend/js/core/writingAnalysisModel.js';
import { analyzeRetext, prepareWritingSource } from '../../../frontend/vendored/writing/runtime.js';

const preferences = { primary: 'plain', overlays: ['direct', 'repetition'], profile: 'direct', language: 'en-US' };
function resolve(source, extra = [], profile = preferences) {
    const result = analyzeRetext(source);
    return resolveWritingFindings({ source, ...result, observations: [...result.observations, ...extra], preferences: profile });
}

test('writing engine maps Unicode and Markdown source and preserves exact phrase-only edits', () => {
    const source = '😀 é **utilize** [in order to](https://example.com) help.';
    const result = resolve(source);
    expect(result.rejected).toBe(0);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].findings.map(item => [item.from, item.to, item.kind])).toEqual([
        [7, 14, 'lexicon.complex-word'], [18, 29, 'style.wordiness'],
    ]);
    const fix = result.findings[0].fixes[0];
    expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe('😀 é **use** [in order to](https://example.com) help.');
    expect(resolve('We work in **order** to help.').findings[0].fixes).toEqual([]);
});

test('writing source masks frontmatter, quotations, technical syntax, code, math, and blockquotes', () => {
    const source = '---\nwriting-language: en-US\n---\n> utilize\n\n"utilize" and “in order to”\n\n`utilize` $utilize$ https://example.com/utilize\n\n    utilize\n\n```js\nutilize\n```\n\nWe utilize ordinary words.';
    const result = resolve(source);
    expect(result.count).toBe(1);
    expect(result.groups.flatMap(group => group.findings)[0].from).toBe(source.lastIndexOf('utilize'));
    expect(prepareWritingSource("We don't utilize code.").text).toContain("don't utilize");
});

test('writing normalization converts Vale one-based code-point inclusive columns', () => {
    const source = '😀 é The report was written in order to help.';
    const data = analyzeRetext(source);
    const raw = valeWritingObservations({ 'stdin.txt': [
        { Check: 'write-good.Passive', Line: 1, Span: [16, 26], Match: 'was written', Message: 'passive' },
    ] }, data.projection);
    expect(raw[0]).toMatchObject({ from: 16, to: 27 });
    const result = resolveWritingFindings({ source, ...data, observations: [...data.observations, ...raw], preferences });
    const passive = result.findings.filter(item => item.kind === 'syntax.passive');
    expect(passive).toHaveLength(1);
    expect(passive[0].sources.map(item => item.engine).sort()).toEqual(['retext', 'vale']);
    expect(passive[0].fixes).toEqual([]);
    const shuffled = resolveWritingFindings({ source, ...data, observations: [...raw, ...data.observations].reverse(), preferences });
    expect(shuffled.groups).toEqual(result.groups);
});

test('writing resolver preserves distinct passive occurrences and rejects unknown or corrupt evidence', () => {
    const source = 'The report was written and the letter was sent.';
    const data = analyzeRetext(source);
    const broad = { engine: 'vale', rule: 'write-good.Passive', from: 0, to: source.length, actual: source, replacements: [] };
    const result = resolveWritingFindings({ source, ...data, observations: [...data.observations, broad,
        { engine: 'vale', rule: 'new-rule', from: 0, to: 3 },
        { engine: 'vale', rule: 'write-good.Passive', from: -1, to: 999 },
    ], preferences });
    expect(result.findings.filter(item => item.kind === 'syntax.passive')).toHaveLength(3);
    expect(result.rejected).toBe(2);
});

test('Directness shows passive advice independently of the retired profile while contextual guards preserve request nouns', () => {
    const result = resolve('The request was written in order to help.', [], { ...preferences, profile: 'standard' });
    expect(result.groups[0].findings.map(item => item.actual)).toEqual(expect.arrayContaining(['in order to', 'written']));
    expect(result.findings.find(item => item.kind === 'syntax.passive').suppressed).toBe('');
    expect(result.findings.find(item => item.actual === 'request')).toMatchObject({ suppressed: 'Wording has an established meaning in this context', fixes: [] });
});

test('writing fixes reject stale revisions, changed configuration, wrong ownership, and source collisions', () => {
    const snapshot = { id: 'a', revision: 3, configuration: 'direct/en', source: 'utilize' };
    const fix = { from: 0, to: 7, expected: 'utilize', replacement: 'use' };
    expect(validateWritingFix(snapshot, snapshot, fix)).toBe(true);
    for (const changed of [{ revision: 4 }, { id: 'b' }, { configuration: 'standard/en' }, { source: 'written' }]) {
        expect(validateWritingFix(snapshot, { ...snapshot, ...changed }, fix)).toBe(false);
    }
    expect(validateWritingFix(snapshot, snapshot, { ...fix, to: 8 })).toBe(false);
});

test('writing dismissals follow only unchanged occurrences and language overrides never guess English', () => {
    const records = [{ kind: 'style.wordiness', from: 4, to: 15 }];
    expect(remapWritingDismissals(records, 'Use in order to help', 'Please use in order to help')).toEqual([{ kind: 'style.wordiness', from: 11, to: 22 }]);
    expect(remapWritingDismissals(records, 'Use in order to help', 'Use to help')).toEqual([]);
    expect(remapWritingDismissals([{ from: 0, to: 7 }], 'utilize utilize', 'utilize utilize utilize')).toEqual([]);
    expect(writingLanguage('en-US', 'es')).toBe('unsupported');
    expect(writingLanguage('en-GB', '')).toBe('unsupported');
    expect(writingLanguage('none', 'en')).toBe('en-US');
    expect(writingLanguage('en-US', 'none')).toBe('none');
});

test('writing conflict policy withholds mutually exclusive goals but retains same-goal alternatives and distinct evidence', () => {
    const source = 'utilize';
    const data = analyzeRetext(source), raw = data.observations[0];
    const alternatives = resolveWritingFindings({ source, projection: data.projection, preferences,
        observations: [raw, raw, { ...raw, replacements: ['employ'] }] });
    expect(alternatives.count).toBe(1);
    expect(alternatives.findings[0].sources).toHaveLength(2);
    expect(alternatives.findings[0].fixes.map(item => item.replacement)).toEqual(['employ', 'use']);
    const conflicting = resolveWritingFindings({ source, projection: data.projection, preferences,
        observations: [{ ...raw, intent: 'simplify' }, { ...raw, intent: 'retain technical term', replacements: ['retain'] }] });
    expect(conflicting.findings).toHaveLength(2);
    for (const item of conflicting.findings) { expect(item.fixes).toEqual([]); expect(item.message).toContain('conflict'); }
});

test('prose fixes also preserve implicit reference keys while explicit link labels remain editable', () => {
    const source = '[utilize][] [utilize][guide] [utilize]\n\n[utilize]: https://example.com/a\n[guide]: https://example.com/b';
    const result = resolve(source);
    const findings = result.groups.flatMap(group => group.findings).filter(finding => finding.kind === 'lexicon.complex-word');
    expect(findings.map(finding => finding.fixes.length)).toEqual([0, 1, 0]);
    expect(findings[0].message).toContain('edit the label and reference together');
    const fix = findings[1].fixes[0];
    expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(source.replace('[utilize][guide]', '[use][guide]'));
});
