import { readFileSync } from 'node:fs';
import nspell from '../../../frontend/vendored/spellcheck/nspell.js';
import { analyzeWriting, prepareWritingSource, createIncrementalWritingAnalyzer } from '../../../frontend/vendored/writing/runtime.js';
import { writingSpellingObservations, spellcheckDiagnostics, spellcheckSuggestionsAtPosition } from '../../../frontend/js/spellcheck.js';
import { highConfidenceSuggestions } from '../../../frontend/js/core/spellingSuggestionsModel.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';
import { createWritingDecision } from '../../../frontend/js/core/writingDecisionsModel.js';
import { writingChecks, writingLensGroups } from '../../../frontend/js/core/writingLensesModel.js';
import { writingLensHelp } from '../../../frontend/js/core/writingLensHelpModel.js';
import { inclusiveAlternatives } from '../../../frontend/js/core/writingPackagePolicy.js';
import { termGroups, capitalizationGroups } from '../../../frontend/js/core/writingAdditionalRules.js';
import { writingTerminology } from '../../../frontend/js/core/writingTextlintModel.js';

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
    const source = 'There are several ways in which we can improve this.';
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

test.each(['en-US', 'en-GB'])('technical abbreviations and API members never offer unrelated replacements in %s', async language => {
    const getChecker = async () => dictionary(language);
    const source = 'Pass args to fn with exponential backoff. Debounce callbacks. Press Ctrl+C after SIGINT. '
        + 'The lifecycle uses limit.clearQueue and AbortError. The p-debounce package is ready.\n\nA teh typo remains.';
    expect((await writingSpellingObservations(source, language, getChecker)).map(item => item.actual)).toEqual(['teh']);
    expect((await spellcheckDiagnostics(source, language, getChecker)).map(item => source.slice(item.from, item.to))).toEqual(['teh']);
    for (const word of ['args', 'backoff', 'Debounce', 'Ctrl', 'clearQueue', 'AbortError']) {
        expect(await spellcheckSuggestionsAtPosition(source, source.indexOf(word) + 1, language, getChecker)).toBeNull();
    }
});

test.each([
    ['This is a convenience function for processing inputs in batches.', 'function', 'write-good.TooWordy'],
    ['If the function throws, all retries will be aborted.', 'function', 'write-good.TooWordy'],
    ['### makeRetriable(function, options?)', 'function', 'write-good.TooWordy'],
    ['The mapper function can produce concurrently.', 'function', 'write-good.TooWordy'],
    ['The attempt number starts at one.', 'attempt', 'write-good.TooWordy'],
    ['The maximum time in milliseconds is fixed.', 'maximum', 'write-good.TooWordy'],
    ['I was tired, but I was glad we stayed.', 'was tired', 'Microsoft.Passive'],
    ['The corner is exposed to cold winds.', 'is exposed', 'Microsoft.Passive'],
    ['They are a welcome meal for the birds.', 'for the birds', 'proselint.Cliches'],
    ['Nobody seemed to know who had booked it, so we made tea.', 'Nobody seemed to know who had booked it, so we made tea.', 'slopless/universalizing-claims'],
])('observed literal meanings survive shared advice: %s', (source, actual, rule) => {
    const { projection, observation } = observed(source, actual, rule);
    expect(findings(resolveWritingFindings({ source, projection, observations: [observation], preferences: { ...preferences, lenses: [...preferences.lenses, 'formulaic'] } }))).toEqual([]);
});

test.each([
    ['We left some food. This plan is for the birds.', 'for the birds', 'proselint.Cliches'],
    ['This plan is for the birds.', 'for the birds', 'proselint.Cliches'],
    ['The workers were tired by the long shift.', 'were tired', 'Microsoft.Passive'],
    ['The secret was exposed by the reporter.', 'was exposed', 'Microsoft.Passive'],
    ['Everyone knows that meetings waste time.', 'Everyone knows that meetings waste time.', 'slopless/universalizing-claims'],
])('literal-meaning guards preserve relevant advice: %s', (source, actual, rule) => {
    const { projection, observation } = observed(source, actual, rule);
    expect(findings(resolveWritingFindings({ source, projection, observations: [observation], preferences: { ...preferences, lenses: [...preferences.lenses, 'formulaic'] } }))).toHaveLength(1);
});

test('temporal just is preserved while minimizing task language remains reviewable', async () => {
    const inspect = async source => findings(resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: { ...preferences, lenses: ['direct'] } }));
    for (const source of ['We arrived just before lunch.', 'We left just after noon.', 'It happened just yesterday.']) {
        expect((await inspect(source)).filter(item => item.actual === 'just')).toEqual([]);
    }
    expect((await inspect('Just configure the database.')).some(item => item.actual.toLowerCase() === 'just')).toBe(true);
});

test('reported route descriptions, overlooked risks and technical classifications preserve their literal meaning', async () => {
    const inspect = async source => findings(resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: { ...preferences, lenses: ['direct'] } }))
        .filter(item => item.kind === 'style.reader-assumption');
    for (const source of ['The sign promised an easy route to the next village.', 'Layout problems are easy to miss in a list.', 'Treat client errors as just unhandled requests.']) {
        expect(await inspect(source)).toEqual([]);
    }
    // Describing the task is not addressed to the reader; the instruction is.
    expect((await inspect('The task is easy. Just configure the database.')).map(item => item.actual.toLowerCase())).toEqual(['just']);
});

// Native Vale checks run outside Jest; their rules are covered by the grammar and Vale fixtures.
async function everyLens(source, language = 'en-US') {
    const data = await analyzeWriting(source);
    const spelling = await writingSpellingObservations(source, language, async () => dictionary(language));
    return findings(resolveWritingFindings({ source, ...data, observations: [...data.observations, ...spelling],
        preferences: { language, lenses: writingChecks.map(check => check.id) } }));
}

test.each(['en-US', 'en-GB'])('%s lens help examples are clean under every other lens', async language => {
    for (const group of writingLensGroups) {
        for (const example of writingLensHelp(group.id, { preferences: { language, lenses: [] }, status: 'saved' }).examples) {
            expect([group.id, example.after, (await everyLens(example.after, language)).map(item => `${item.kind}:${item.actual}`)])
                .toEqual([group.id, example.after, []]);
        }
    }
});

test('applying any offered lens replacement creates no finding from any lens', async () => {
    const offered = [...[...inclusiveAlternatives.values()].flat(), ...termGroups.flat(), ...capitalizationGroups.flat(), ...writingTerminology];
    for (const word of new Set(offered)) {
        const source = `We use ${word} here.`, from = source.indexOf(word), to = from + word.length;
        const overlapping = (await everyLens(source)).filter(item => item.from < to && item.to > from);
        expect([word, overlapping.map(item => item.kind)]).toEqual([word, []]);
    }
});

test.each(['We agreed on a service level objective (SLO).', 'We agreed on an SLO (service level objective).'])(
    'Clarity does not simplify the words that define an acronym: %s', async source => {
        const plain = findings(resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: { lenses: ['plain'], language: 'en-US' } }));
        expect(plain.filter(item => item.actual === 'objective')).toEqual([]);
    });

test('wordiness advice still applies outside an acronym definition', async () => {
    const source = 'Our objective is clear.';
    const plain = findings(resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: { lenses: ['plain'], language: 'en-US' } }));
    expect(plain.some(item => item.actual === 'objective')).toBe(true);
});

test('Ignore choices saved before checks changed lens still apply to the moved findings', async () => {
    const legacy = (source, actual, kind) => {
        const from = source.indexOf(actual), to = from + actual.length;
        return createWritingDecision({ kind, title: 'Earlier finding', from, to, actual, sourceText: actual }, source, 'en-US', 'occurrence', kind);
    };
    const visibleIn = async (source, lenses, decisions) => findings(resolveWritingFindings({ source, ...await analyzeWriting(source), decisions,
        preferences: { lenses, language: 'en-US' } }));
    const tone = 'Simply run the installer.';
    expect((await visibleIn(tone, ['direct'], [])).map(item => item.kind)).toContain('style.reader-assumption');
    expect((await visibleIn(tone, ['direct'], [legacy(tone, 'Simply', 'language.inclusive')])).filter(item => item.kind === 'style.reader-assumption')).toEqual([]);
    const typography = "It's ready. It's done. It’s late.";
    expect((await visibleIn(typography, ['formulaic'], [])).map(item => item.kind)).toEqual(['style.apostrophe']);
    expect(await visibleIn(typography, ['formulaic'], [legacy(typography, '’', 'formulaic.curly-punctuation')])).toEqual([]);
});
