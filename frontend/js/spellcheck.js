/**
 * Offline Markdown spellchecking backed by the small Hunspell dictionaries
 * bundled with Figaro. Dictionaries are fetched from the local Wails asset
 * server once, then retained for the life of the editor—no note text or
 * spelling request leaves the device.
 */

import nspell from '../vendored/spellcheck/nspell.js';
import { spellcheckWordRanges } from './core/spellingModel.js';
import { matchSuggestionCase, isCorrectlySpelledProseWord, highConfidenceSuggestions, reviewedSpellingCorrection } from './core/spellingSuggestionsModel.js';
import { canonicalSpellcheckLanguage, spellcheckLanguages } from './spellcheckPreference.js';
import { filterAcceptedSpelling, spellingWordKey } from './core/writingInlineModel.js';

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
 * Find a prose word at a CodeMirror document position. The range source is
 * shared with diagnostics, so right-click suggestions cannot appear in
 * frontmatter, code, URLs, or other deliberately ignored Markdown regions.
 */
export function spellcheckWordAtPosition(source, position) {
    const point = Number(position);
    if (!Number.isFinite(point)) return null;
    return spellcheckWordRanges(source).find(range => point >= range.from && point <= range.to) || null;
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

/**
 * Resolve local Hunspell replacements for an unknown prose word. This is kept
 * separate from diagnostics because context menus need the word and replacement
 * range, while the normal linter should remain a small, non-interactive mark.
 */
export async function spellcheckSuggestionsAtPosition(source, position, defaultLanguage = 'en-US', getChecker = loadSpellchecker, acceptedWords = []) {
    const config = resolveSpellcheckConfiguration(source, defaultLanguage);
    const wordRange = config.enabled ? spellcheckWordAtPosition(source, position) : null;
    if (!wordRange) return null;
    if (acceptedWords.some(word => spellingWordKey(word) === spellingWordKey(wordRange.word))) return null;

    let checkers;
    try {
        checkers = await Promise.all(config.languages.map(language => getChecker(language)));
    } catch (_) {
        return null;
    }
    if (isCorrectlySpelledProseWord(wordRange.word, checkers, config.languages)) return null;

    const suggestions = wordRange.editable === false ? [] : highConfidenceSuggestions(wordRange.word, checkers, config.languages)
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
    return filterAcceptedSpelling(spellcheckWordRanges(source), acceptedWords)
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

/** Writing worker adapter: one prose scan and one conservative lookup per unique word. */
export async function writingSpellingObservations(source, defaultLanguage, getChecker = loadSpellchecker) {
    const config = resolveSpellcheckConfiguration(source, defaultLanguage);
    if (!config.enabled) return [];
    const checkers = await Promise.all(config.languages.map(getChecker));
    const suggestions = new Map();
    const observations = [];
    for (const range of spellcheckWordRanges(source)) {
        if (!suggestions.has(range.word)) {
            suggestions.set(range.word, isCorrectlySpelledProseWord(range.word, checkers, config.languages) ? null
                : highConfidenceSuggestions(range.word, checkers, config.languages).map(value => matchSuggestionCase(value, range.word)));
        }
        const candidates = suggestions.get(range.word);
        if (candidates === null) continue;
        const replacements = range.editable === false ? [] : candidates;
        const reviewed = reviewedSpellingCorrection(range.word, config.languages);
        const bulkSafe = replacements.length === 1 && reviewed !== null && replacements[0] === matchSuggestionCase(reviewed, range.word);
        observations.push({ engine: 'spelling', version: 'nspell-2.1.5', rule: 'figaro-spelling', from: range.from, to: range.to,
            actual: range.word, severity: 'info', replacements, bulkSafe, native: { ...range, languages: config.languages, replacements } });
    }
    return observations;
}
