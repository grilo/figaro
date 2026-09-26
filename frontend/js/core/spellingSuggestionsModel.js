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
    // Familiar missing spaces. Each has one standard spelling; ambiguous forms
    // such as “incase” (also an old spelling of encase) stay uncorrected.
    ['alot', 'a lot'], ['atleast', 'at least'], ['aswell', 'as well'], ['eachother', 'each other'],
    ['infact', 'in fact'], ['noone', 'no one'],
]);
const englishLanguages = languages => languages.some(language => language === 'en-US' || language === 'en-GB');
// A pronoun or adverb whose 's form is a contraction is not evidence of a noun:
// “thats” and “everyones” are missing apostrophes, not plurals.
const contractionStems = new Set(['that', 'what', 'there', 'here', 'where', 'when', 'everyone', 'everybody', 'someone',
    'somebody', 'anyone', 'anybody', 'nobody', 'everything', 'something', 'anything', 'nothing', 'today', 'tomorrow', 'yesterday']);

export function reviewedSpellingCorrection(word, languages) {
    word = word.normalize('NFC');
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

const verbEvidence = (knows, verb) => knows(verb + 'ed') || knows(verb + 'd') || knows(verb + verb.at(-1) + 'ed');

/**
 * The small bundled English dictionaries enumerate only some regular forms.
 * Recognize a few productive derivations when the dictionary itself supplies
 * evidence for the base: a noun’s plural (the base takes a possessive), un- on a
 * known past participle, re-/-able on a known verb, and multi- on a known word.
 * Accented English loanwords also match their unaccented dictionary spelling.
 * Every rule requires a known base, so a misspelled base stays flagged.
 */
function knownEnglishDerivation(knows, word) {
    if (!/^\p{Lu}?\p{Ll}+$/u.test(word)) return false;
    const lower = word.toLocaleLowerCase();
    const folded = lower.normalize('NFD').replace(/\p{M}/gu, '');
    if (folded !== lower) return /^[a-z]+$/u.test(folded) && (knows(folded) || knownEnglishDerivation(knows, folded));
    let match = /^([a-z]{4,})s$/u.exec(lower);
    if (match && !/(?:[sxzy]|ch|sh)$/u.test(match[1]) && !contractionStems.has(match[1])
        && knows(match[1]) && knows(match[1] + '\'s')) return true;
    match = /^un([a-z]{3,}ed)$/u.exec(lower);
    if (match && knows(match[1])) return true;
    match = /^re([a-z]{4,})$/u.exec(lower);
    if (match && knows(match[1]) && (match[1].endsWith('ed') || verbEvidence(knows, match[1]))) return true;
    match = /^multi([a-z]{4,})$/u.exec(lower);
    if (match && knows(match[1])) return true;
    match = /^([a-z]{4,})able$/u.exec(lower);
    // Soft c/g keep their e (noticeable), and an -ible word (accessible)
    // makes its -able spelling a misspelling rather than a derivation.
    if (match && !knows(match[1] + 'ible')) {
        const stem = match[1];
        return knows(stem) && verbEvidence(knows, stem)
            || !/[cg]$/u.test(stem) && knows(stem + 'e') && verbEvidence(knows, stem + 'e');
    }
    return false;
}

export function isCorrectlySpelledProseWord(word, checkers, languages) {
    word = word.normalize('NFC');
    const possessive = spellingPossessive(word, languages);
    if (reviewedSpellingWord(word, languages) || possessive && reviewedSpellingWord(possessive.stem, languages)) return true;
    const english = englishLanguages(languages);
    return checkers.some(checker => {
        const knows = value => checker.correct(value) || english && knownEnglishDerivation(value => checker.correct(value), value);
        const acronym = /^([A-Z]{2,})s$/u.exec(possessive?.stem || word);
        if (acronym && checker.correct(acronym[1])) return true;
        if (knows(word)) return true;
        if (possessive) {
            // Dictionaries often omit terminal apostrophes on valid plurals/names.
            return possessive.plural ? knows(possessive.stem) : checker.correct(possessive.stem + '\'s');
        }
        // Hunspell dictionaries do not consistently enumerate otherwise valid
        // compounds. Treat a hyphenated word as correct when every component
        // belongs to the same active dictionary, while still flagging a typo
        // in any component.
        const components = word.split('-');
        return components.length > 1 && components.every(component => knows(component) || reviewedSpellingWord(component, languages));
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

/**
 * `sentenceStart` says whether a capitalized word begins a sentence or block.
 * Elsewhere a capital usually marks a name, brand or product, so an unknown
 * capitalized word keeps its finding (and Add to dictionary) but is offered
 * only a case change or an adjacent-letter transposition, never a different word.
 */
export function highConfidenceSuggestions(word, checkers, languages, { sentenceStart = true } = {}) {
    word = word.normalize('NFC');
    if (reviewedSpellingWord(word, languages)) return [];
    const possessive = spellingPossessive(word, languages);
    if (possessive) {
        return highConfidenceSuggestions(possessive.stem, checkers, languages, { sentenceStart })
            .filter(value => !/['’]/u.test(value) && (!possessive.plural || /s$/iu.test(value)))
            .map(value => value + possessive.suffix)
            .filter(value => isCorrectlySpelledProseWord(value, checkers, languages));
    }
    const normalizedWord = String(word || '').toLocaleLowerCase();
    const reviewed = reviewedSpellingCorrection(word, languages);
    // Reviewed corrections may restore a missing space; every word must be valid.
    if (reviewed && checkers.some(checker => reviewed.split(' ').every(part => isDictionarySuggestion(checker, part)))) return [reviewed];
    // A three-letter typo is too ambiguous for generated corrections: “ete”
    // could plausibly mean several unrelated words. Only retain a tiny,
    // explicit set of familiar transposition mistakes at this length.
    if (Array.from(normalizedWord).length <= 3) {
        const direct = languages
            .map(language => shortTypoCorrections.get(language)?.get(normalizedWord))
            .find(Boolean);
        return direct && checkers.some(checker => isDictionarySuggestion(checker, direct)) ? [direct] : [];
    }

    // A word whose capitalized form is a dictionary word (friday, english)
    // needs only that capital, not a different word such as “Fridays”.
    // Short words stop above: “dir” is not a miscased “Dir”.
    const titled = normalizedWord.charAt(0).toLocaleUpperCase() + normalizedWord.slice(1);
    if (titled !== word && /\p{L}/u.test(titled) && checkers.some(checker => isDictionarySuggestion(checker, titled))) return [titled];

    const maximumDistance = Array.from(normalizedWord).length >= 7 ? 2 : 1;
    const ordinaryCase = /^\p{Lu}\p{Ll}+$/u.test(word) || word === word.toLocaleUpperCase();
    const lowercase = word === normalizedWord;
    const nameLike = !lowercase && word !== word.toLocaleUpperCase() && !sentenceStart;
    const query = ordinaryCase ? normalizedWord : word;
    const candidates = new Map();
    for (const checker of checkers) {
        for (const suggestion of checker.suggest?.(query) || []) {
            const value = String(suggestion || '').trim();
            const key = value.toLocaleLowerCase();
            if (!value || key === normalizedWord || candidates.has(key)
                || !isDictionarySuggestion(checker, value) || !isProseLikeSuggestion(value)) continue;
            // A dictionary can know the singular without listing a valid plural.
            // Deleting only its final s is not evidence of a spelling mistake.
            if (languages.some(language => ['en-US', 'en-GB'].includes(language))
                && normalizedWord === key + 's') continue;
            // A plural spelling candidate must not silently become possession.
            // Missing contraction apostrophes have a separately reviewed shape.
            if (/['’]/u.test(value) && !/['’]/u.test(word)
                && !(contractionSpellings.has(key.replace(/’/gu, '\'')) && key.replace(/['’]/gu, '') === normalizedWord)) continue;
            const distance = damerauLevenshteinDistance(normalizedWord, key);
            if (distance > maximumDistance) continue;
            // Ordinary sentence/title capitals get the same alternatives as
            // lowercase prose. Keep uncertain name-only and mixed-case guesses
            // conservative; dictionary entries such as Hennessy are not proof
            // that an unfamiliar author's name was a typo.
            if (/\p{Lu}/u.test(word) && (!ordinaryCase || !isDictionarySuggestion(checker, value.toLowerCase()))
                && !isSingleAdjacentTransposition(word, value)) continue;
            // A capital inside a sentence marks a likely name: Postgres is not
            // a typo for postures. Lowercase prose likewise gets name-only
            // entries (Boone for noone) only as an adjacent transposition.
            if ((nameLike || lowercase && value !== key && !isDictionarySuggestion(checker, key))
                && !isSingleAdjacentTransposition(normalizedWord, key)) continue;
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
