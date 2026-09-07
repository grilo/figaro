/** Curated local rules over mapped prose. No source edits or external effects. */
import { reviewedArticle } from './writingPackagePolicy.js';
export const additionalWritingRulesVersion = '3';
// Both length checks use the native rule's >30-word threshold. The local
// check covers sentences a native tokenizer merged across Markdown blocks.
export const longSentenceWordLimit = 31;

const termGroups = [
    ['email', 'e-mail'], ['website', 'web site'], ['online', 'on-line'],
    ['offline', 'off-line'], ['ebook', 'e-book'],
];
const capitalizationGroups = [['PDF', 'pdf'], ['HTML', 'html']];
const wordPattern = /\p{L}+(?:[’'-]\p{L}+)*/gu;
export const writingSentenceWordCount = text => [...text.matchAll(wordPattern)].length;
const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function additionalWritingObservations(projection) {
    const { text, units, regions = [], sentences = [] } = projection;
    const observations = [];
    const eligible = (from, to) => from >= 0 && to > from && to <= units.length
        && units.slice(from, to).every(unit => unit.from >= 0 && !unit.hidden);
    function emit(rule, from, to, replacements, message, native = {}) {
        if (!eligible(from, to)) return;
        observations.push({ engine: 'figaro', version: additionalWritingRulesVersion,
            package: 'figaro-writing', rule, from, to, actual: text.slice(from, to),
            replacements, message, severity: 'suggestion', evidenceFamily: 'local-rule', native });
    }
    function consistency(variants, caseSensitive) {
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${variants.map(escapePattern).join('|')})(?![\\p{L}\\p{N}_-])`, caseSensitive ? 'gu' : 'giu');
        const matches = [...text.matchAll(pattern)].filter(match => eligible(match.index, match.index + match[0].length));
        const form = value => caseSensitive ? value : value.toLowerCase();
        const used = variants.filter(variant => matches.some(match => form(match[0]) === variant));
        if (used.length < 2) return;
        for (const match of matches) {
            emit(caseSensitive ? 'figaro-consistent-capitalization' : 'figaro-consistent-terms',
                match.index, match.index + match[0].length, used.filter(variant => variant !== form(match[0])),
                `This document uses both “${used[0]}” and “${used[1]}”. Choose one form to use consistently.`, { forms: used });
        }
    }
    for (const variants of termGroups) consistency(variants, false);
    for (const variants of capitalizationGroups) consistency(variants, true);

    for (const match of text.matchAll(/\b(a|an)[ \t\n]+([\p{L}][\p{L}’'-]*)/giu)) {
        const expected = reviewedArticle(match[2]);
        if (!expected || expected === match[1].toLowerCase() || !eligible(match.index, match.index + match[0].length)) continue;
        emit('figaro-reviewed-article', match.index, match.index + match[1].length, [expected],
            'Choose “a” or “an” to match the sound at the start of the following word.');
    }

    for (const match of text.matchAll(/(\p{L}+)[ \t]+([,;:!?])(?![,;:!?])/gu)) {
        emit('figaro-punctuation-spacing', match.index, match.index + match[0].length, [match[1] + match[2]],
            'Remove the space before this punctuation mark in English prose.');
    }
    for (const match of text.matchAll(/,{2,}/g)) {
        emit('figaro-repeated-comma', match.index, match.index + match[0].length, [','],
            'Use a single comma here if the repetition was accidental.');
    }
    let regionIndex = 0;
    for (const sentence of sentences) {
        while (regions[regionIndex]?.end < sentence.start) regionIndex++;
        const region = regions[regionIndex];
        if (region?.type !== 'paragraph' || region.start > sentence.start || region.end < sentence.end) continue;
        const actual = text.slice(sentence.start, sentence.end);
        const wordCount = writingSentenceWordCount(actual);
        if (wordCount < longSentenceWordLimit) continue;
        emit('figaro-long-sentence', sentence.start, sentence.end, [],
            `This sentence contains ${wordCount} words. Consider splitting it where the idea changes, if that makes it easier to follow.`, { wordCount, threshold: longSentenceWordLimit });
    }
    return observations;
}
