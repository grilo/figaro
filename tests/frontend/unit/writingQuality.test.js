import { readFileSync } from 'node:fs';
import nspell from '../../../frontend/vendored/spellcheck/nspell.js';
import { analyzeWriting, prepareWritingSource, createIncrementalWritingAnalyzer } from '../../../frontend/vendored/writing/runtime.js';
import { writingSpellingObservations, spellcheckDiagnostics, spellcheckSuggestionsAtPosition } from '../../../frontend/js/spellcheck.js';
import { highConfidenceSuggestions } from '../../../frontend/js/core/spellingSuggestionsModel.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';
import { createWritingDecision } from '../../../frontend/js/core/writingDecisionsModel.js';

const dictionary = language => nspell({ aff: readFileSync(`frontend/vendored/spellcheck/${language}.aff`, 'utf8'),
    dic: readFileSync(`frontend/vendored/spellcheck/${language}.dic`, 'utf8') });
const preferences = { lenses: ['spelling', 'grammar', 'plain', 'direct'], language: 'en-US' };
const findings = result => result.groups.flatMap(group => group.findings);
const review = async source => resolveWritingFindings({ source, ...await analyzeWriting(source), preferences });

test.each(['en-US', 'en-GB'])('technical prose and defined acronyms agree across all %s spelling surfaces', async language => {
    const getChecker = async () => dictionary(language);
    const source = 'Async middleware reads dotfiles and etags. NPM handles fallbacks and backpressure. '
        + 'The pathname uses fallthrough.\n\n### serveStatic(root, options)\n\n### acceptRanges\n\n'
        + 'Our leaf area index (LAI) describes the canopy. LAI matters. A teh typo remains.';
    const observed = await writingSpellingObservations(source, language, getChecker);
    expect(observed.map(item => item.actual)).toEqual(['teh']);
    expect((await spellcheckDiagnostics(source, language, getChecker)).map(item => source.slice(item.from, item.to))).toEqual(['teh']);
    for (const word of ['Async', 'dotfiles', 'LAI', 'serveStatic', 'acceptRanges']) {
        expect(await spellcheckSuggestionsAtPosition(source, source.indexOf(word) + 1, language, getChecker)).toBeNull();
    }
    expect(observed[0].replacements).toEqual(['the']);
});

test('acronym spelling recognition follows current prose and never persists through the suggestion cache', async () => {
    const getChecker = async () => dictionary('en-US'), suggestions = new Map();
    for (const source of ['LAI matters.', 'LAI matters. `leaf area index (LAI)`', 'LAI matters. leaf area\n\nindex (LAI)']) {
        expect((await writingSpellingObservations(source, 'en-US', getChecker, { suggestions })).some(item => item.actual === 'LAI')).toBe(true);
    }
    expect(await writingSpellingObservations('Leaf **area** index (LAI) matters. LAI grows.', 'en-US', getChecker, { suggestions })).toEqual([]);
    expect((await writingSpellingObservations('LAI matters.', 'en-US', getChecker, { suggestions })).some(item => item.actual === 'LAI')).toBe(true);
});

test('generated English alternatives do not erase a terminal plural s from a dictionary-unknown noun', () => {
    const checker = { correct: word => word === 'widget', suggest: () => ['widget'] };
    expect(highConfidenceSuggestions('widgets', [checker], ['en-US'])).toEqual([]);
    expect(highConfidenceSuggestions('widgets', [checker], ['es'])).toEqual(['widget']);
    expect(highConfidenceSuggestions('speling', [dictionary('en-US')], ['en-US'])).toContain('spelling');
});

test('balanced multiline parentheses survive quoted terms and abbreviations in full and incremental review', async () => {
    const source = 'A dotfile begins with a dot ("."). Note this check is done on\nthe path itself without checking if the path actually exists on the\ndisk. If `root` is specified, only the dotfiles above the root are\nchecked (i.e. the root itself can be within a dotfile when set\nto "deny").';
    expect(findings(await review(source)).filter(item => item.kind === 'grammar.unmatched-pair')).toEqual([]);
    const analyzer = createIncrementalWritingAnalyzer();
    const output = await analyzer.analyze(source);
    expect(findings(resolveWritingFindings({ source, ...output, preferences })).filter(item => item.kind === 'grammar.unmatched-pair')).toEqual([]);
    expect(findings(await review('The draft (including the appendix] is here.')).some(item => item.kind === 'grammar.unmatched-pair')).toBe(true);
    expect(findings(await review('The draft (is ready.\n\nAnother paragraph.)')).some(item => item.kind === 'grammar.unmatched-pair')).toBe(true);
});

function observed(source, actual, rule) {
    const projection = prepareWritingSource(source), from = projection.text.indexOf(actual);
    return { projection, observation: { rule, actual, from, to: from + actual.length, replacements: [], engine: 'vale' } };
}

test.each([
    ['The callback function handles the response.', 'function', 'write-good.TooWordy'],
    ['Map the directories to the same web address.', 'address', 'Microsoft.Wordiness'],
    ['Forward a client error to the handler.', 'Forward', 'Microsoft.Wordiness'],
    ['I look forward to meeting the team.', 'forward', 'write-good.TooWordy'],
    ['The `maxAge` option controls caching.', 'option', 'Microsoft.Wordiness'],
    ['Their going home was unexpected.', 'was unexpected', 'write-good.Passive'],
    ['The two walkers were disappointed, but they waited.', 'were disappointed', 'Microsoft.Passive'],
    ['At the end of the day, ask each group what it learned.', 'At the end of the day', 'proselint.Cliches'],
])('shared policy suppresses literal or misleading advice: %s', (source, actual, rule) => {
    const { projection, observation } = observed(source, actual, rule);
    const result = resolveWritingFindings({ source, projection, observations: [observation], preferences });
    expect(findings(result)).toEqual([]);
    expect(result.evidence[0].raw).toBe(observation);
    expect(result.evidence[0].suppressed).toBeTruthy();
});

test.each([
    ['We must address the problem.', 'address', 'Microsoft.Wordiness'],
    ['The visitors were disappointed by the cancellation.', 'were disappointed', 'Microsoft.Passive'],
    ['At the end of the day, the proposal is too expensive.', 'At the end of the day', 'proselint.Cliches'],
])('context suppression preserves useful review: %s', (source, actual, rule) => {
    const { projection, observation } = observed(source, actual, rule);
    expect(findings(resolveWritingFindings({ source, projection, observations: [observation], preferences }))).toHaveLength(1);
});

test('duplicate indirect-opening advice retains both sources, either lens, and current and legacy Ignore decisions', () => {
    const source = 'There are two large jugs on the shelf.';
    const { projection, observation } = observed(source, 'There are', 'write-good.ThereIs');
    const observations = [observation, { ...observation, rule: 'write-good.TooWordy' }];
    const resolve = (lenses, decisions = []) => resolveWritingFindings({ source, projection, observations, preferences: { ...preferences, lenses }, decisions, language: 'en-US' });
    for (const lenses of [['plain'], ['direct'], ['plain', 'direct']]) {
        const result = resolve(lenses), [finding] = findings(result);
        expect(findings(result)).toHaveLength(1);
        expect(finding.sources).toHaveLength(2);
        expect(finding.lenses.sort()).toEqual(['direct', 'plain']);
        expect(finding.fixes).toEqual([]);
        const decision = createWritingDecision(finding, source, 'en-US', 'occurrence', 'one');
        expect(findings(resolve(lenses, [decision]))).toEqual([]);
        expect(findings(resolve(lenses, [{ ...decision, kind: 'style.wordiness' }]))).toEqual([]);
        const partial = resolveWritingFindings({ source, projection, observations: [observation], preferences,
            language: 'en-US', decisions: [{ ...decision, kind: 'style.wordiness' }] });
        expect(findings(partial)).toEqual([]);
    }
});
