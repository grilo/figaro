import nspell from 'nspell';
import { spellingPossessive } from './spellingModel.js';
import { reviewedSpellingCorrection } from './spellingSuggestionsModel.js';

// Noun-only S (regular plural) and M (possessive) rules from the pinned
// dictionary-en 4.0.0 and dictionary-en-gb 3.0.0 affixes. Real-dictionary
// regressions keep this subset aligned without admitting verb/prefix rules.
const englishPersonalAffixes = `SET UTF-8
SFX S Y 4
SFX S y ies [^aeiou]y
SFX S 0 s [aeiou]y
SFX S 0 es [sxzh]
SFX S 0 s [^sxzhy]
SFX M Y 1
SFX M 0 's .`;
const simpleWord = /^[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*$/u;

export function spellingWordKey(word) { return String(word).trim().toLowerCase().normalize('NFC').replace(/[’‘]/g, '\''); }

let lastAccepted = null;

/** A fresh, private checker keeps vault words and language choices isolated. */
export function acceptedSpelling(words = [], language) {
    // Review resolution repeats with the same words; reuse the last checker.
    const cacheKey = `${language}\n${words.join('\n')}`;
    if (lastAccepted?.key === cacheKey) return lastAccepted.accepts;
    const accepts = createAcceptedSpelling(words, language);
    lastAccepted = { key: cacheKey, accepts };
    return accepts;
}

function createAcceptedSpelling(words, language) {
    const accepted = new Set(words.map(spellingWordKey));
    if (!accepted.size || !['en-US', 'en-GB'].includes(language)) return word => accepted.has(spellingWordKey(word));
    const roots = new Set();
    for (const word of [...accepted]) {
        if (simpleWord.test(word)) { roots.add(word); continue; }
        const possessive = spellingPossessive(word, [language]);
        if (!possessive) continue;
        accepted.add(possessive.stem);
        // A terminal apostrophe can follow a plural or an s-ending name.
        // Accept its unpossessed spelling without guessing a singular root.
        if (!possessive.plural) roots.add(possessive.stem);
    }
    const checker = nspell({ aff: englishPersonalAffixes, dic: [roots.size, ...[...roots].map(word => `${word}/SM`)].join('\n') });
    return word => {
        const key = spellingWordKey(word);
        if (accepted.has(key) || checker.correct(key)) return true;
        // Hunspell's noun flags do not generate the terminal plural/name
        // apostrophe. Require an accepted s-ending root or regular plural.
        const stem = key.endsWith('s\'') ? key.slice(0, -1) : '';
        return simpleWord.test(stem) && checker.correct(stem);
    };
}

export function filterAcceptedSpelling(values, words = [], language) {
    if (!values.length) return values;
    const accepts = acceptedSpelling(words, language);
    return values.filter(value => !accepts(value.actual || value.word));
}

/** A bounded, searchable view of stored entries; derived plurals are not stored rows. */
export function personalDictionaryList(words, query = '', limit = 100) {
    const key = spellingWordKey(query);
    const matches = words.filter(word => spellingWordKey(word).includes(key)).sort((a, b) => a.localeCompare(b));
    return { count: words.length, matching: matches.length, visible: matches.slice(0, limit), more: matches.length > limit };
}

const vaultChunkSeparator = /[\s_/\\.,;:()[\]{}#+&=!?"“”«»|]+/u;
const vaultWordPattern = /\p{L}+(?:['’-]\p{L}+)*/gu;
const noteExtension = /\.(?:md|markdown)$/iu;
export const vaultSpellingWordLimit = 5000;

/**
 * The vault's own vocabulary: words in Markdown note titles and tags. These are
 * accepted for spelling in memory only and never join the personal dictionary.
 * Chunks with digits (dates, versions, Q3) are skipped, words need three
 * letters, and words with a reviewed correction (teh, recieve) stay reviewable.
 */
export function vaultSpellingWords({ tree = [], tags = [] } = {}, limit = vaultSpellingWordLimit) {
    const words = new Set();
    const add = text => {
        for (const chunk of String(text || '').normalize('NFC').split(vaultChunkSeparator)) {
            if (!chunk || /\p{N}/u.test(chunk)) continue;
            for (const [token] of chunk.matchAll(vaultWordPattern)) {
                for (const word of new Set([token, ...token.split('-')])) {
                    if (words.size >= limit) return;
                    if (word.replace(/['’-]/gu, '').length < 3 || reviewedSpellingCorrection(word, ['en-US']) || reviewedSpellingCorrection(word, ['es'])) continue;
                    words.add(spellingWordKey(word));
                }
            }
        }
    };
    const pending = [...(Array.isArray(tree) ? tree : [])];
    while (pending.length && words.size < limit) {
        const item = pending.shift();
        if (item?.type === 'directory') pending.push(...(item.children || []));
        else if (item?.type === 'file' && noteExtension.test(item.name || '')) add(item.name.replace(noteExtension, ''));
    }
    for (const tag of Array.isArray(tags) ? tags : []) add(tag);
    return [...words].sort();
}
