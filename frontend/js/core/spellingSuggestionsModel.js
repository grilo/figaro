/** Pure dictionary policy; loaded checkers are supplied by the adapter. */
import { spellingPossessive } from './spellingModel.js';
import { reviewedSpellingWord } from './spellingVocabulary.js';

const maxSpellcheckSuggestions = 5;
const proseSuggestionPattern = /^\p{L}+(?:[’'-]\p{L}+)*$/u;
const contractionSpellings = new Set(['can\'t', 'couldn\'t', 'don\'t', 'doesn\'t', 'didn\'t', 'hasn\'t', 'haven\'t', 'hadn\'t',
    'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 'won\'t', 'wouldn\'t', 'shouldn\'t', 'needn\'t', 'mustn\'t', 'it\'s', 'that\'s',
    'there\'s', 'here\'s', 'let\'s', 'i\'m', 'i\'ll', 'i\'ve', 'you\'re', 'you\'ll', 'you\'ve', 'we\'re', 'we\'ll', 'we\'ve', 'they\'re', 'they\'ll', 'they\'ve']);
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
const reviewedEnglishCorrections = new Map([
    ['teh', 'the'], ['hte', 'the'], ['adn', 'and'], ['nad', 'and'],
    ['reciept', 'receipt'], ['reciepts', 'receipts'], ['recieve', 'receive'],
    ['recieved', 'received'], ['recieving', 'receiving'], ['definately', 'definitely'],
    ['seperate', 'separate'], ['seperately', 'separately'], ['occured', 'occurred'],
    ['usres', 'users'], ['chidl', 'child'],
]);

export function reviewedSpellingCorrection(word, languages) {
    const possessive = spellingPossessive(word, languages);
    if (possessive) {
        const stem = reviewedSpellingCorrection(possessive.stem, languages);
        return stem ? stem + possessive.suffix : null;
    }
    const key = word.toLowerCase();
    return languages.some(language => ['en-US', 'en-GB'].includes(language)) ? reviewedEnglishCorrections.get(key) || null
        : languages.map(language => shortTypoCorrections.get(language)?.get(key)).find(Boolean) || null;
}

export function matchSuggestionCase(suggestion, word) {
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

export function isCorrectlySpelledProseWord(word, checkers, languages) {
    const possessive = spellingPossessive(word, languages);
    if (reviewedSpellingWord(word, languages) || possessive && reviewedSpellingWord(possessive.stem, languages)) return true;
    return checkers.some(checker => {
        if (checker.correct(word)) return true;
        if (possessive) {
            // Dictionaries often omit terminal apostrophes on valid plurals/names.
            return checker.correct(possessive.plural ? possessive.stem : possessive.stem + '\'s');
        }
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

export function highConfidenceSuggestions(word, checkers, languages) {
    const possessive = spellingPossessive(word, languages);
    if (possessive) {
        return highConfidenceSuggestions(possessive.stem, checkers, languages)
            .filter(value => !/['’]/u.test(value) && (!possessive.plural || /s$/iu.test(value)))
            .map(value => value + possessive.suffix)
            .filter(value => isCorrectlySpelledProseWord(value, checkers, languages));
    }
    const normalizedWord = String(word || '').toLocaleLowerCase();
    const reviewed = reviewedSpellingCorrection(word, languages);
    if (reviewed && checkers.some(checker => isDictionarySuggestion(checker, reviewed))) return [reviewed];
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
            // A plural spelling candidate must not silently become possession.
            // Missing contraction apostrophes have a separately reviewed shape.
            if (/['’]/u.test(value) && !/['’]/u.test(word)
                && !(contractionSpellings.has(key.replace(/’/gu, '\'')) && key.replace(/['’]/gu, '') === normalizedWord)) continue;
            const distance = damerauLevenshteinDistance(normalizedWord, key);
            if (distance > maximumDistance) continue;
            // Unknown names and mixed-case identifiers need author knowledge;
            // do not turn a similar ordinary dictionary word into their name.
            if (/[A-Z]/u.test(word) && !isSingleAdjacentTransposition(word, value)) continue;
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
