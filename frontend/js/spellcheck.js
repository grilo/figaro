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

/**
 * Resolve local Hunspell replacements for an unknown prose word. This is kept
 * separate from diagnostics because context menus need the word and replacement
 * range, while the normal linter should remain a small, non-interactive mark.
 */
export async function spellcheckSuggestionsAtPosition(source, position, defaultLanguage = 'en-US', getChecker = loadSpellchecker, acceptedWords = []) {
    const config = resolveSpellcheckConfiguration(source, defaultLanguage);
    const wordRange = config.enabled ? spellcheckWordAtPosition(source, position) : null;
    if (!wordRange) return null;
    if (acceptedSpelling(acceptedWords, config.languages[0])(wordRange.word)) return null;

    let checkers;
    try {
        checkers = await Promise.all(config.languages.map(language => getChecker(language)));
    } catch (_) {
        return null;
    }
    if (isCorrectlySpelledProseWord(wordRange.word, checkers, config.languages)) return null;

    const suggestions = wordRange.editable === false ? [] : highConfidenceSuggestions(wordRange.word, checkers, config.languages, suggestionContext(source, wordRange))
        .map(suggestion => matchSuggestionCase(suggestion, wordRange.word));
    return { ...wordRange, suggestions };
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
    const languageKey = config.languages.join(':');
    let checked = 0, spent = 0;
    for (const range of spellcheckWordRanges(source)) {
        if (checked++ % 32 === 0) await checkpoint();
        const context = suggestionContext(source, range);
        const key = `${languageKey}:${context.sentenceStart ? '' : 'inside:'}${range.word}`;
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
