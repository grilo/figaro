/**
 * Offline Markdown spellchecking backed by the small Hunspell dictionaries
 * bundled with Figaro. Dictionaries are fetched from the local Wails asset
 * server once, then retained for the life of the editor—no note text or
 * spelling request leaves the device.
 */

import nspell from '../vendored/spellcheck/nspell.js';
import { getFrontmatterValue, parseFrontmatter } from './frontmatter.js';

export const spellcheckLanguages = [
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'es', label: 'Spanish (Spain)' },
];

const languageLabels = new Map(spellcheckLanguages.map(language => [language.id, language.label]));
const languageAliases = new Map([
    ['en', 'en-US'],
    ['en-us', 'en-US'],
    ['en-gb', 'en-GB'],
    ['es', 'es'],
    ['es-es', 'es'],
]);
const checkerPromises = new Map();
const wordPattern = /[\p{L}\p{M}][\p{L}\p{M}'’’-]*/gu;
const fencedCodeStart = /^ {0,3}(`{3,}|~{3,})/;
const maxSpellcheckSuggestions = 5;
const proseSuggestionPattern = /^\p{L}+(?:[’'-]\p{L}+)*$/u;
const shortTypoCorrections = new Map([
    ['en-US', new Map([
        ['teh', 'the'],
        ['hte', 'the'],
        ['adn', 'and'],
        ['nad', 'and'],
    ])],
    ['en-GB', new Map([
        ['teh', 'the'],
        ['hte', 'the'],
        ['adn', 'and'],
        ['nad', 'and'],
    ])],
    ['es', new Map([
        ['qeu', 'que'],
    ])],
]);

export function canonicalSpellcheckLanguage(value, fallback = 'en-US') {
    const normalized = String(value || '').trim().replaceAll('_', '-').toLowerCase();
    return languageAliases.get(normalized) || fallback;
}

function parseLanguageList(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const list = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
    return list.split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
}

/**
 * Resolve the portable frontmatter contract. `spellcheck: false` disables a
 * note; a language or YAML-style inline array overrides the global fallback.
 * Unknown values intentionally keep the global language so a typo in YAML
 * cannot silently turn off spellchecking.
 */
export function resolveSpellcheckConfiguration(source, defaultLanguage = 'en-US') {
    const fallback = canonicalSpellcheckLanguage(defaultLanguage);
    const raw = getFrontmatterValue(source, 'spellcheck').trim();
    if (!raw) return { enabled: true, languages: [fallback], overridden: false };
    if (/^(?:false|off|no|0)$/i.test(raw)) return { enabled: false, languages: [], overridden: true };

    const languages = [...new Set(parseLanguageList(raw)
        .map(language => canonicalSpellcheckLanguage(language, ''))
        .filter(Boolean))];
    return languages.length
        ? { enabled: true, languages, overridden: true }
        : { enabled: true, languages: [fallback], overridden: false };
}

function masked(value) {
    return String(value).replace(/[^\n\r]/g, ' ');
}

function maskInlineMarkdown(line) {
    let result = line;
    // Link text remains prose; link destinations, autolinks, bare URLs,
    // emails, tags, and inline code do not belong to a natural-language
    // dictionary.
    result = result.replace(/(!?\[[^\]]*])((?:\([^\n)]*\)))/g, (_match, label, destination) => label + masked(destination));
    result = result.replace(/<[^>\n]*>/g, masked);
    result = result.replace(/\b(?:https?:\/\/|mailto:)[^\s<]+/giu, masked);
    result = result.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, masked);
    result = result.replace(/`+[^`\n]*`+/g, masked);
    // Identifier-like tokens are usually code, file names, or paths. Keep
    // normal hyphenated prose (for example, “well-written”) visible.
    result = result.replace(/\b[\w.-]*(?:[_/]|\.[A-Za-z0-9]{1,8})[\w./-]*\b/g, masked);
    return result;
}

/** Return only natural-language word ranges from Markdown prose. */
export function spellcheckWordRanges(source) {
    const text = String(source || '');
    const frontmatter = parseFrontmatter(text);
    const proseStart = frontmatter?.to || 0;
    const ranges = [];
    let position = proseStart;
    let openFence = null;

    for (const chunk of text.slice(proseStart).split(/(?<=\n)/)) {
        const newlineLength = chunk.endsWith('\n') ? 1 : 0;
        const line = newlineLength ? chunk.slice(0, -1) : chunk;
        const fence = line.match(fencedCodeStart);
        if (openFence) {
            if (fence && fence[1][0] === openFence.character && fence[1].length >= openFence.length) {
                openFence = null;
            }
            position += chunk.length;
            continue;
        }
        if (fence) {
            openFence = { character: fence[1][0], length: fence[1].length };
            position += chunk.length;
            continue;
        }

        const visible = maskInlineMarkdown(line);
        for (const match of visible.matchAll(wordPattern)) {
            const word = match[0];
            const lettersOnly = word.replace(/[’'-]/g, '');
            if (lettersOnly.length < 2) continue;
            // Initialisms such as API and Wails should not be treated as
            // misspellings in prose. Capitalized names remain checkable.
            if (word === word.toLocaleUpperCase() && word !== word.toLocaleLowerCase()) continue;
            ranges.push({ from: position + match.index, to: position + match.index + word.length, word });
        }
        position += chunk.length;
    }
    return ranges;
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

async function loadSpellchecker(language) {
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

function matchSuggestionCase(suggestion, word) {
    const value = String(suggestion || '');
    if (!value) return '';
    if (word === word.toLocaleUpperCase() && word !== word.toLocaleLowerCase()) return value.toLocaleUpperCase();
    if (word[0] === word[0]?.toLocaleUpperCase()) return value[0]?.toLocaleUpperCase() + value.slice(1);
    return value;
}

function isDictionarySuggestion(checker, suggestion) {
    const status = checker.spell?.(suggestion);
    if (status) return status.correct && !status.forbidden && !status.warn;
    return checker.correct?.(suggestion) === true;
}

function isCorrectlySpelledProseWord(word, checkers) {
    return checkers.some(checker => {
        if (checker.correct(word)) return true;
        // Hunspell dictionaries do not consistently enumerate otherwise valid
        // compounds. Treat a hyphenated word as correct when every component
        // belongs to the same active dictionary, while still flagging a typo
        // in any component.
        const components = word.split('-');
        return components.length > 1 && components.every(component => checker.correct(component));
    });
}

function isProseLikeSuggestion(suggestion) {
    const value = String(suggestion || '').trim();
    const lower = value.toLocaleLowerCase();
    if (!proseSuggestionPattern.test(value) || value !== lower && value === value.toLocaleUpperCase()) return false;
    const letters = lower.replace(/[’'-]/g, '');
    // Acronyms and opaque dictionary entries such as “rte” or “xxx” are not
    // useful prose corrections. Include y because it is a vowel in words such
    // as “rhythm”; this is deliberately a conservative display filter, not a
    // spelling rule.
    return letters.length >= 3 && /[aeiouyáéíóúü]/iu.test(letters);
}

function damerauLevenshteinDistance(left, right) {
    const source = Array.from(String(left || '').toLocaleLowerCase());
    const target = Array.from(String(right || '').toLocaleLowerCase());
    const rows = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));
    for (let row = 0; row <= source.length; row++) rows[row][0] = row;
    for (let column = 0; column <= target.length; column++) rows[0][column] = column;

    for (let row = 1; row <= source.length; row++) {
        for (let column = 1; column <= target.length; column++) {
            const cost = source[row - 1] === target[column - 1] ? 0 : 1;
            rows[row][column] = Math.min(
                rows[row - 1][column] + 1,
                rows[row][column - 1] + 1,
                rows[row - 1][column - 1] + cost,
            );
            if (row > 1 && column > 1
                && source[row - 1] === target[column - 2]
                && source[row - 2] === target[column - 1]) {
                rows[row][column] = Math.min(rows[row][column], rows[row - 2][column - 2] + cost);
            }
        }
    }
    return rows[source.length][target.length];
}

function isSingleAdjacentTransposition(source, target) {
    const left = String(source || '').toLocaleLowerCase();
    const right = String(target || '').toLocaleLowerCase();
    if (left.length !== right.length) return false;
    let firstDifference = -1;
    for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) {
            firstDifference = index;
            break;
        }
    }
    return firstDifference >= 0
        && firstDifference + 1 < left.length
        && left[firstDifference] === right[firstDifference + 1]
        && left[firstDifference + 1] === right[firstDifference]
        && left.slice(firstDifference + 2) === right.slice(firstDifference + 2);
}

function sharedBoundaryLetters(left, right) {
    const source = String(left || '').toLocaleLowerCase();
    const target = String(right || '').toLocaleLowerCase();
    let prefix = 0;
    while (prefix < source.length && prefix < target.length && source[prefix] === target[prefix]) prefix++;
    let suffix = 0;
    while (suffix < source.length - prefix && suffix < target.length - prefix
        && source[source.length - suffix - 1] === target[target.length - suffix - 1]) suffix++;
    return prefix + suffix;
}

function highConfidenceSuggestions(word, checkers, languages) {
    const normalizedWord = String(word || '').toLocaleLowerCase();
    // A three-letter typo is too ambiguous for generated corrections: “ete”
    // could plausibly mean several unrelated words. Only retain a tiny,
    // explicit set of familiar transposition mistakes at this length.
    if (Array.from(normalizedWord).length <= 3) {
        const direct = languages
            .map(language => shortTypoCorrections.get(language)?.get(normalizedWord))
            .find(Boolean);
        return direct && checkers.some(checker => isDictionarySuggestion(checker, direct)) ? [direct] : [];
    }

    const maximumDistance = Array.from(normalizedWord).length >= 7 ? 2 : 1;
    const candidates = new Map();
    for (const checker of checkers) {
        for (const suggestion of checker.suggest?.(word) || []) {
            const value = String(suggestion || '').trim();
            const key = value.toLocaleLowerCase();
            if (!value || key === normalizedWord || candidates.has(key)
                || !isDictionarySuggestion(checker, value) || !isProseLikeSuggestion(value)) continue;
            const distance = damerauLevenshteinDistance(normalizedWord, key);
            if (distance > maximumDistance) continue;
            candidates.set(key, {
                value,
                distance,
                transposed: isSingleAdjacentTransposition(normalizedWord, key),
                sharedBoundary: sharedBoundaryLetters(normalizedWord, key),
                lengthDifference: Math.abs(Array.from(normalizedWord).length - Array.from(key).length),
            });
        }
    }
    return [...candidates.values()]
        .sort((left, right) => left.distance - right.distance
            || Number(right.transposed) - Number(left.transposed)
            || right.sharedBoundary - left.sharedBoundary
            || left.lengthDifference - right.lengthDifference
            || left.value.localeCompare(right.value))
        .slice(0, maxSpellcheckSuggestions)
        .map(candidate => candidate.value);
}

/**
 * Resolve local Hunspell replacements for an unknown prose word. This is kept
 * separate from diagnostics because context menus need the word and replacement
 * range, while the normal linter should remain a small, non-interactive mark.
 */
export async function spellcheckSuggestionsAtPosition(source, position, defaultLanguage = 'en-US', getChecker = loadSpellchecker) {
    const config = resolveSpellcheckConfiguration(source, defaultLanguage);
    const wordRange = config.enabled ? spellcheckWordAtPosition(source, position) : null;
    if (!wordRange) return null;

    let checkers;
    try {
        checkers = await Promise.all(config.languages.map(language => getChecker(language)));
    } catch (_) {
        return null;
    }
    if (isCorrectlySpelledProseWord(wordRange.word, checkers)) return null;

    const suggestions = highConfidenceSuggestions(wordRange.word, checkers, config.languages)
        .map(suggestion => matchSuggestionCase(suggestion, wordRange.word));
    return { ...wordRange, suggestions };
}

/**
 * Return CodeMirror diagnostics for words unknown to every enabled language.
 * `getChecker` is injectable so unit tests can directly exercise language
 * selection and Markdown exclusions without loading browser assets.
 */
export async function spellcheckDiagnostics(source, defaultLanguage = 'en-US', getChecker = loadSpellchecker) {
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
    return spellcheckWordRanges(source)
        .filter(({ word }) => !isCorrectlySpelledProseWord(word, checkers))
        .map(({ from, to, word }) => ({
            from,
            to,
            severity: 'info',
            source: 'Figaro spellcheck',
            markClass: 'cm-spellcheck-range',
            message: `“${word}” is not in the ${languageDescription} dictionary.`,
        }));
}

export function createSpellcheckLinter(defaultLanguage) {
    return view => spellcheckDiagnostics(view.state.doc.toString(), defaultLanguage);
}
