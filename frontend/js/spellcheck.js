/**
 * Offline Markdown spellchecking backed by the small Hunspell dictionaries
 * bundled with Figaro. Dictionaries are fetched from the local Wails asset
 * server once, then retained for the life of the editor—no note text or
 * spelling request leaves the device.
 */

import nspell from 'nspell';
import { spellcheckWordRanges, spellingSentenceStart, spellingWordAt } from './core/spellingModel.js';
import { matchSuggestionCase, isCorrectlySpelledProseWord, highConfidenceSuggestions, reviewedSpellingCorrection } from './core/spellingSuggestionsModel.js';
import { canonicalSpellcheckLanguage, spellcheckLanguages } from './spellcheckPreference.js';
import { filterAcceptedSpelling, acceptedSpelling } from './core/spellingDictionaryModel.js';

export { spellcheckWordRanges } from './core/spellingModel.js';
export { canonicalSpellcheckLanguage, spellcheckLanguages } from './spellcheckPreference.js';

const languageLabels = new Map(spellcheckLanguages.map(language => [language.id, language.label]));
const checkerPromises = new Map();

/** The writing lens supplies the language; legacy frontmatter is ordinary metadata. */
export function resolveSpellcheckConfiguration(_source, language = 'en-US') {
    const canonical = canonicalSpellcheckLanguage(language, '');
    return { enabled: Boolean(canonical), languages: canonical ? [canonical] : [], overridden: false };
}

/**
 * Find a prose word at a CodeMirror document position. The range rules are
 * shared with diagnostics, so right-click suggestions cannot appear in
 * frontmatter, code, URLs, or other deliberately ignored Markdown regions.
 * A context menu runs on the UI thread, so only the block around the position
 * is read; see `spellingWordAt`.
 */
export function spellcheckWordAtPosition(source, position) {
    return spellingWordAt(source, position);
}

export async function loadSpellchecker(language) {
    const canonical = canonicalSpellcheckLanguage(language);
    if (checkerPromises.has(canonical)) return checkerPromises.get(canonical);

    const promise = Promise.all(['aff', 'dic'].map(async extension => {
        const response = await fetch(`/vendored/spellcheck/${canonical}.${extension}`);
        if (!response.ok) throw new Error(`could not load ${canonical} spellcheck dictionary`);
        return response.text();
    })).then(([aff, dic]) => nspell({ aff, dic }));
    checkerPromises.set(canonical, promise);
    return promise;
}

/** Only a capitalized word's suggestions depend on where its sentence starts. */
function suggestionContext(source, range) {
    return { sentenceStart: !/\p{Lu}/u.test(range.word) || spellingSentenceStart(source, range.from) };
}

/** One cache entry per word, language and sentence position: null for a word
 * that is spelled correctly, otherwise its case-matched replacements. */
function suggestionCacheKey(languages, sentenceStart, word) {
    return `${languages.join(':')}:${sentenceStart ? '' : 'inside:'}${word}`;
}

function rememberSuggestions(cache, key, value) {
    if (!cache) return;
    cache.delete(key);
    if (cache.size >= 4096) cache.delete(cache.keys().next().value);
    cache.set(key, value);
}

/**
 * The cheap half of a right-click: find the prose word under the position and
 * describe the lookup it needs, or return null when there is nothing to check
 * (spelling off, no word there, or a word the user has accepted). Only the
 * block around the position is read; see `spellingWordAt`.
 */
export function spellingSuggestionRequest(source, position, defaultLanguage = 'en-US', acceptedWords = []) {
    const config = resolveSpellcheckConfiguration(source, defaultLanguage);
    const range = config.enabled ? spellcheckWordAtPosition(source, position) : null;
    if (!range || acceptedSpelling(acceptedWords, config.languages[0])(range.word)) return null;
    return {
        range,
        lookup: {
            word: range.word,
            languages: config.languages,
            sentenceStart: suggestionContext(source, range).sentenceStart,
            editable: range.editable !== false,
        },
    };
}

/**
 * The expensive half: load the dictionaries, then check one word and generate
 * its replacements. Building a Hunspell dictionary takes a noticeable moment
 * and each replacement search about a tenth of a second, so the editor runs
 * this in the spelling worker, whose `cache` the writing review has usually
 * filled already. Resolves null for a correctly spelled word or when no
 * dictionary loads.
 */
export async function spellingWordSuggestions({ word, languages, sentenceStart = true, editable = true }, getChecker = loadSpellchecker, cache = null) {
    const key = suggestionCacheKey(languages, sentenceStart, word);
    if (cache?.has(key)) {
        const cached = cache.get(key);
        rememberSuggestions(cache, key, cached);
        return cached === null ? null : { suggestions: editable ? cached : [] };
    }
    let checkers;
    try {
        checkers = await Promise.all(languages.map(language => getChecker(language)));
    } catch (_) {
        return null;
    }
    if (isCorrectlySpelledProseWord(word, checkers, languages)) {
        rememberSuggestions(cache, key, null);
        return null;
    }
    if (!editable) return { suggestions: [] };
    const suggestions = highConfidenceSuggestions(word, checkers, languages, { sentenceStart })
        .map(suggestion => matchSuggestionCase(suggestion, word));
    rememberSuggestions(cache, key, suggestions);
    return { suggestions };
}

/**
 * Resolve local Hunspell replacements for an unknown prose word. This is kept
 * separate from diagnostics because context menus need the word and replacement
 * range, while the normal linter should remain a small, non-interactive mark.
 * `lookup` performs `spellingWordSuggestions`; the editor passes one that runs
 * in the spelling worker, and by default it runs here.
 */
export async function spellcheckSuggestionsAtPosition(source, position, defaultLanguage = 'en-US', getChecker = loadSpellchecker, acceptedWords = [],
    lookup = request => spellingWordSuggestions(request, getChecker)) {
    const request = spellingSuggestionRequest(source, position, defaultLanguage, acceptedWords);
    if (!request) return null;
    const answer = await lookup(request.lookup);
    return answer ? { ...request.range, suggestions: answer.suggestions } : null;
}

/**
 * Return CodeMirror diagnostics for words unknown to every enabled language.
 * `getChecker` is injectable so unit tests can directly exercise language
 * selection and Markdown exclusions without loading browser assets.
 */
export async function spellcheckDiagnostics(source, defaultLanguage = 'en-US', getChecker = loadSpellchecker, acceptedWords = []) {
    const config = resolveSpellcheckConfiguration(source, defaultLanguage);
    if (!config.enabled) return [];

    let checkers;
    try {
        checkers = await Promise.all(config.languages.map(language => getChecker(language)));
    } catch (_) {
        // A missing local asset must never disrupt editing or convert every
        // word into an error. The normal asset-generation check prevents this.
        return [];
    }
    const languageDescription = config.languages.map(language => languageLabels.get(language) || language).join(' and ');
    return filterAcceptedSpelling(spellcheckWordRanges(source), acceptedWords, config.languages[0])
        .filter(({ word }) => !isCorrectlySpelledProseWord(word, checkers, config.languages))
        .map(({ from, to, word }) => ({
            from,
            to,
            severity: 'info',
            source: 'Figaro spellcheck',
            markClass: 'cm-spellcheck-range',
            message: `“${word}” is not in the ${languageDescription} dictionary.`,
        }));
}

export function createSpellcheckLinter(defaultLanguage, acceptedWords = []) {
    return view => spellcheckDiagnostics(view.state.doc.toString(), defaultLanguage, undefined, acceptedWords);
}

/**
 * Writing worker adapter: one prose scan and one conservative lookup per unique word.
 *
 * Every unknown word is flagged in one pass, but generating replacements is
 * the expensive part (roughly a tenth of a second per word), so one pass
 * spends at most `suggestionBudgetMs` on it. Words beyond the budget carry
 * `suggestionsPending`; their replacements come from a later pass, which finds
 * everything computed so far in the shared `suggestions` cache. A note with
 * many unfamiliar names therefore reports at once and never has to finish all
 * of its lookups inside a single watchdog window.
 */
export async function writingSpellingObservations(source, defaultLanguage, getChecker = loadSpellchecker, {
    suggestions = new Map(), checkpoint = async () => {}, suggestionBudgetMs = 1000, now = () => performance.now(),
} = {}) {
    const config = resolveSpellcheckConfiguration(source, defaultLanguage);
    if (!config.enabled) return [];
    const checkers = await Promise.all(config.languages.map(getChecker));
    const observations = [];
    let checked = 0, spent = 0;
    for (const range of spellcheckWordRanges(source)) {
        if (checked++ % 32 === 0) await checkpoint();
        const context = suggestionContext(source, range);
        const key = suggestionCacheKey(config.languages, context.sentenceStart, range.word);
        let pending = false;
        if (!suggestions.has(key)) {
            let value = null;
            if (!isCorrectlySpelledProseWord(range.word, checkers, config.languages)) {
                pending = spent >= suggestionBudgetMs;
                if (!pending) {
                    const started = now();
                    value = highConfidenceSuggestions(range.word, checkers, config.languages, context).map(candidate => matchSuggestionCase(candidate, range.word));
                    spent += now() - started;
                }
            }
            if (!pending) {
                if (suggestions.size >= 4096) suggestions.delete(suggestions.keys().next().value);
                suggestions.set(key, value);
            }
        }
        const candidates = pending ? [] : suggestions.get(key);
        if (!pending) { suggestions.delete(key); suggestions.set(key, candidates); }
        if (candidates === null) continue;
        const replacements = range.editable === false ? [] : candidates;
        const reviewed = reviewedSpellingCorrection(range.word, config.languages);
        const bulkSafe = replacements.length === 1 && reviewed !== null && replacements[0] === matchSuggestionCase(reviewed, range.word);
        observations.push({ engine: 'spelling', version: 'nspell-2.1.5', rule: 'figaro-spelling', from: range.from, to: range.to,
            actual: range.word, severity: 'info', replacements, bulkSafe, ...(pending ? { suggestionsPending: true } : {}),
            native: { ...range, languages: config.languages, replacements } });
    }
    return observations;
}
