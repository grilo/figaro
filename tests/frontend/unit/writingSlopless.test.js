import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyzeWriting, prepareWritingSource, writingRuntimeReady } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings, writingEngineConfiguration } from '../../../frontend/js/core/writingAnalysisModel.js';
import { writingSloplessRules, writingSloplessVersion, sloplessWritingObservations } from '../../../frontend/js/core/writingSloplessModel.js';
import { writingSuggestionExamples, writingSuggestionExplanation } from '../../../frontend/js/core/writingSuggestionModel.js';
import { writingReviewCards, writingBulkAvailable } from '../../../frontend/js/core/writingReviewModel.js';
import { createWritingInlineView } from '../../../frontend/js/views/writingInlineView.js';
import { createWritingDecision } from '../../../frontend/js/core/writingDecisionsModel.js';

const fixtures = {
    cliches: 'That was a blessing in disguise.',
    'corporate-speak': 'We need to get the ball rolling.',
    wordiness: 'We left in order to catch the train.',
    simplicity: 'We utilize numerous methods to facilitate implementation.',
    redundancy: 'We agreed on future plans.',
    'exclamation-density': 'The draft is ready! We finished early!',
    'word-repetition': 'The plan covers costs. The plan covers dates. The plan covers roles. The plan covers risks. The plan covers tests. The plan covers work.',
    'hedge-stacking': 'Maybe this might possibly help.',
    'softening-language': 'Some people might generally benefit from this change.',
    'em-dashes': 'The draft is ready—we can send it.',
    'smart-quotes': 'She said “ready”.',
    'boilerplate-framing': 'Let me be honest: the deadline is unrealistic.',
    'generic-signposting': 'The short answer is that we need another day.',
    'negation-reframe': 'We do not sell software. We sell outcomes.',
    'contrastive-aphorism': 'It is less about speed. It is more about trust.',
    'blame-reframe': 'Growth comes from learning, not blame.',
    'universalizing-claims': 'Everyone knows that meetings waste time.',
    'authority-padding': 'Experts agree that trust improves retention.',
    'boilerplate-conclusion': 'The lesson is clear.',
    'summative-closer': 'In conclusion, the draft is ready.',
    'formulaic-challenges': 'Although adoption has grown, the project faces significant challenges. Looking ahead, continued investment will support growth.',
    'lesson-framing': 'The lesson here is clear: check the totals.',
    'observer-guidance': 'You see it everywhere.',
    'response-wrapper': 'Great question. Here are a few options.',
    'llm-disclaimer': 'As an AI language model, I cannot inspect the file.',
    'formal-transition-density': 'Moreover, costs fell. Furthermore, sales rose. Additionally, hiring resumed.',
    'repeated-sentence-starts': 'We can save time. We can reduce errors. We can finish sooner.',
    'empty-emphasis': 'That part matters.',
    'superficial-analysis': 'The team met, underscoring its commitment to excellence.',
    'semantic-thinness': 'The lesson is clear.',
};
async function review(source, lenses = ['formulaic'], decisions = []) {
    const data = await analyzeWriting(source);
    const result = resolveWritingFindings({ source, ...data, decisions, preferences: { lenses, language: 'en-US' } });
    expect(result.rejected).toBe(0);
    return { data, result, findings: result.groups.flatMap(group => group.findings) };
}

test('Formulaic writing pins the actual eagerly registered Slopless subset and covers every included rule', async () => {
    await writingRuntimeReady;
    expect(JSON.parse(readFileSync('package.json')).dependencies.slopless).toBe(writingSloplessVersion);
    expect(Object.keys(fixtures).sort()).toEqual(Object.keys(writingSloplessRules).sort());
    expect(writingEngineConfiguration.slopless).toEqual({ version: writingSloplessVersion, rules: writingSloplessRules });
});

test('Formulaic writing documents every included and excluded public Slopless rule without omissions', () => {
    const publicRules = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
        'import { rules } from "slopless"; process.stdout.write(JSON.stringify(Object.keys(rules).sort()));'], { encoding: 'utf8' }));
    const docs = readFileSync('docs/WRITING_SLOPLESS.md', 'utf8');
    const names = section => [...section.matchAll(/`([a-z-]+)`/gu)].map(match => match[1]);
    const included = names(docs.split('## Included rules')[1].split('## Excluded rules')[0]);
    const excluded = names(docs.split('## Excluded rules')[1].split('## Integration')[0]);
    expect(included.sort()).toEqual(Object.keys(writingSloplessRules).sort());
    expect([...included, ...excluded].sort()).toEqual(publicRules);
    expect(excluded).toHaveLength(47);
});

test.each(Object.entries(fixtures))('Formulaic writing executes real Slopless %s with exact source and advisory examples', async (rule, text) => {
    const source = `😀 Intro.\n\n${text}\n\nAnother paragraph.`;
    const { data, findings } = await review(source);
    expect(data.observations.some(raw => raw.rule === `slopless/${rule}`)).toBe(true);
    const matching = findings.filter(f => f.sources.some(raw => raw.rule === `slopless/${rule}`));
    expect(matching.length).toBeGreaterThan(0);
    for (const finding of matching) {
        expect(finding).toMatchObject({ lens: 'formulaic', severity: 'advisory', fixes: [] });
        expect(source.slice(finding.from, finding.to)).toBe(finding.sourceText);
        expect(finding.sources.some(raw => raw.version === writingSloplessVersion)).toBe(true);
        expect(writingSuggestionExamples(finding)[0]).toMatchObject({ label: 'Example', before: expect.any(String), after: expect.any(String) });
        expect(writingSuggestionExplanation(finding)).toContain('not evidence of AI authorship');
    }
    expect((await review(source, ['spelling'])).findings).toEqual([]);
});

test('Formulaic typography flags unspaced em dashes, curly quotes and apostrophes without recommending changes to quoted words', async () => {
    const source = 'She said “Let me be honest.” It’s ready—we can send it. Use ‘single quotes’ too.';
    const { findings } = await review(source);
    expect(findings.map(f => f.actual)).toEqual(['“', '”', '’', '—', '‘', '’']);
    expect(findings.every(f => f.to === f.from + 1 && f.fixes.length === 0)).toBe(true);
    expect((await review('The draft is ready — we can send it. She said "ready". It\'s ready.')).findings).toEqual([]);
    const { findings: combined } = await review(source, ['formulaic', 'consistency']);
    expect(combined.filter(f => f.lens === 'formulaic')).toHaveLength(6);
    expect(combined.filter(f => f.lens === 'consistency')).toEqual((await review(source, ['consistency'])).findings);
});

test.each([
    '---\nlabel: “ready”—yes\n---\nThe draft is ready.',
    '---\nlabel: “unfinished”—yes',
    '> Let me be honest: “ready”—yes\n\nThe draft is ready.',
    '    Let me be honest: “ready”—yes\n\nThe draft is ready.',
    '```text\nLet me be honest: “ready”—yes\n```\nThe draft is ready.',
    '`Let me be honest: “ready”—yes` and $x—y$ are examples.',
    '[Read this](https://example.com/“ready”—yes "Let me be honest")',
    '[ref]: https://example.com/“ready”—yes "Let me be honest"\n\nThe draft is ready.',
    '![[“ready”—yes]] [[“ready”—yes|label]] ![“ready”—yes](image.png)',
    'Let me `hidden` be honest: the draft is ready.',
    'We do not sell software.\n\nWe sell outcomes.',
])('Formulaic writing preserves protected Markdown and does not span missing prose: %s', async source => {
    expect((await review(source)).findings).toEqual([]);
});

test('Formulaic source offsets survive CRLF, Markdown emphasis, entities and implicit reference labels', async () => {
    for (const source of ['Intro.\r\n\r\nLet **me** be honest: the draft is ready.', 'Let m&#101; be honest: the draft is ready.', '[Let me be honest: the draft is ready.]\n\n[Let me be honest: the draft is ready.]: /target']) {
        const { findings } = await review(source);
        expect(findings.some(f => f.kind === 'formulaic.framing')).toBe(true);
        expect(findings.every(f => f.fixes.length === 0)).toBe(true);
    }
});

test('Formulaic native mapping rejects unreviewed rules and invalid or protected ranges', () => {
    const projection = prepareWritingSource('We can send it—today.');
    const raw = { ruleId: 'slopless/em-dashes', range: [14, 15], message: 'native' };
    for (const range of [[-1, 3], [2, 2], [0, 900], [1.5, 3], [0, projection.units.length]]) expect(sloplessWritingObservations([{ ...raw, range }], projection)).toEqual([]);
    expect(sloplessWritingObservations([{ ...raw, ruleId: 'slopless/llm-vocabulary' }], projection)).toEqual([]);
});

test('Formulaic keeps different advice on the same sentence and groups repeated typography without bulk rewrites', async () => {
    const { findings } = await review('The lesson is clear.');
    expect(findings.map(f => f.kind)).toEqual(['formulaic.abstract', 'formulaic.conclusion', 'formulaic.framing']);
    expect(findings.find(f => f.kind === 'formulaic.conclusion').sources.length).toBeGreaterThan(1);
    const { result } = await review(Array(8).fill('It’s ready—we can send it.').join('\n\n'));
    const cards = writingReviewCards(result.groups);
    expect(cards).toHaveLength(2);
    expect(cards.map(card => card.findings.length)).toEqual([8, 8]);
    expect(cards.every(card => !writingBulkAvailable(card))).toBe(true);
});

test('Formulaic inline suggestions use existing styled Ignore and examples without inferred Apply actions', async () => {
    const { findings } = await review('It’s ready—we can send it.');
    const onIgnore = jest.fn();
    const dom = createWritingInlineView({ findings, onIgnore, onClose() {} });
    document.body.replaceChildren(dom);
    expect(dom.textContent).toContain('Review curly punctuation');
    expect(dom.textContent).toContain('Before: It’s ready.');
    expect(dom.querySelectorAll('[aria-label^="Replace"]')).toHaveLength(0);
    const ignore = dom.querySelector('[aria-label^="Ignore"]');
    expect(ignore.classList.contains('ui-button')).toBe(true);
    ignore.click(); expect(onIgnore).toHaveBeenCalledWith(findings[0].id);
});

test('Formulaic Ignore decisions survive serialization and can be restored without changing the note', async () => {
    const source = 'The draft is ready—we can send it.';
    const { findings } = await review(source);
    const saved = JSON.parse(JSON.stringify([createWritingDecision(findings[0], source, 'en-US', 'occurrence', 'formulaic-test')]));
    expect((await review(source, ['formulaic'], saved)).findings).toEqual([]);
    expect((await review(source)).findings).toHaveLength(1);
});

test('Formulaic coalescing keeps stable identities when package observation order changes', async () => {
    const source = 'The lesson is clear.';
    const { data, findings } = await review(source);
    const reversed = resolveWritingFindings({ source, ...data, observations: [...data.observations].reverse(), preferences: { lenses: ['formulaic'], language: 'en-US' } });
    expect(reversed.groups.flatMap(g => g.findings).map(f => [f.id, f.title, f.message])).toEqual(findings.map(f => [f.id, f.title, f.message]));
});
