import { parser, GFM } from '@lezer/markdown';
import { getFrontmatterRegion } from './frontmatterRegionModel.js';
import { wikiLinkRanges } from './noteLinks.js';
import { writingTechnicalRanges } from './writingTechnicalModel.js';

const markdown = parser.configure(GFM);
const excludedNodes = new Set(['CodeBlock', 'FencedCode', 'InlineCode', 'LinkReference', 'LinkLabel', 'URL', 'LinkTitle', 'HTMLBlock', 'HTMLTag']);
const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*(?:['’](?![\p{L}\p{M}\p{N}]))?/gu;
const mask = value => value.replace(/[^\r\n]/g, ' ');
const referenceKey = value => value.trim().replace(/\s+/gu, ' ').toLowerCase();

/** Source ranges remain UTF-16; parsing never runs in a typing handler. */
export function spellingSource(source) {
    const text = String(source || ''), frontmatter = getFrontmatterRegion(text);
    const parsed = frontmatter ? mask(text.slice(0, frontmatter.to)) + text.slice(frontmatter.to) : text;
    const hidden = frontmatter ? [frontmatter] : [], references = new Set(), implicit = [], delimiters = [];
    const wiki = wikiLinkRanges(text);
    markdown.parse(parsed).iterate({ enter(node) {
        if (['EmphasisMark', 'StrikethroughMark'].includes(node.name)) delimiters.push({ from: node.from, to: node.to });
        if (node.name === 'LinkReference') {
            const label = node.node.getChild('LinkLabel');
            if (label) references.add(referenceKey(text.slice(label.from + 1, label.to - 1)));
        }
        if (excludedNodes.has(node.name)) { hidden.push({ from: node.from, to: node.to }); return false; }
        if (['Link', 'Image'].includes(node.name) && text[node.to - 1] === ']') {
            const label = node.node.getChild('LinkLabel');
            if (!label || label.to - label.from === 2) {
                const from = node.from + (node.name === 'Image' ? 2 : 1), to = (label?.from ?? node.to) - 1;
                implicit.push({ from, to, reference: referenceKey(text.slice(from, to)) });
            }
        }
    } });
    for (const link of wiki) hidden.push({ from: link.from, to: link.aliasFrom }, { from: Math.max(link.aliasFrom, link.aliasTo), to: link.to });
    const readOnly = implicit.filter(range => references.has(range.reference)
        && !wiki.some(link => link.from <= range.from && link.to >= range.to));
    // Markdown underscores are delimiters, not parts of a filename. Mask them
    // before looking for identifiers, without changing any source offsets.
    const syntax = text.split('');
    for (const range of delimiters) for (let at = range.from; at < range.to; at++) syntax[at] = ' ';
    hidden.push(...delimiters, ...writingTechnicalRanges(syntax.join('')));
    hidden.sort((a, b) => a.from - b.from);
    const pieces = []; let end = 0;
    for (const range of hidden) {
        if (range.to <= end) continue;
        if (range.from > end) pieces.push(text.slice(end, range.from));
        pieces.push(mask(text.slice(Math.max(end, range.from), range.to))); end = range.to;
    }
    pieces.push(text.slice(end));
    const words = [];
    const prose = pieces.join('');
    const closingQuotes = new Set();
    let opening = null;
    for (let at = 0; at < prose.length; at++) {
        if (prose[at] === '\n' && prose[at + 1] === '\n') opening = null;
        if (!/['‘’]/u.test(prose[at])) continue;
        const before = /[\p{L}\p{N}]/u.test(prose[at - 1] || ''), after = /[\p{L}\p{N}]/u.test(prose[at + 1] || '');
        if (before && after) continue; // An apostrophe within a word.
        if (opening !== null && prose[at] !== '‘' && !after) { closingQuotes.add(at); opening = null; }
        else if (!before && after && prose[at] !== '’') opening = at;
    }
    for (const match of prose.matchAll(wordPattern)) {
        let word = match[0];
        if (/\p{N}/u.test(word) || prose[match.index + word.length] === '-') continue;
        if (/['’]$/u.test(word) && (closingQuotes.has(match.index + word.length - 1) || !/s['’]$/iu.test(word))) word = word.slice(0, -1);
        if (word.replace(/[’'-]/g, '').length < 2 || word === word.toLocaleUpperCase() && word !== word.toLocaleLowerCase()) continue;
        const range = { from: match.index, to: match.index + word.length, word };
        if (readOnly.some(label => label.from < range.to && label.to > range.from)) range.editable = false;
        words.push(range);
    }
    return { words, readOnly };
}

export function spellcheckWordRanges(source) { return spellingSource(source).words; }

/** English suffixes are grammatical structure, not interchangeable spelling. */
export function spellingPossessive(word, languages) {
    if (!languages.some(language => language === 'en-US' || language === 'en-GB')) return null;
    const match = /^([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)(['’]s|['’])$/iu.exec(word);
    if (!match || match[2].length === 1 && !/s$/iu.test(match[1])) return null;
    return { stem: match[1], suffix: match[2], plural: match[2].length === 1 };
}
