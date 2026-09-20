import nspell from 'nspell';
import { spellingPossessive } from './spellingModel.js';

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

/** A fresh, private checker keeps vault words and language choices isolated. */
export function acceptedSpelling(words = [], language) {
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
