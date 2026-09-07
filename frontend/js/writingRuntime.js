// This entry is bundled at build time for both the module worker and adapter tests.
import { getFrontmatterRegion } from './frontmatter.js';
import { wikiLinkRanges } from './core/noteLinks.js';
import { ordinaryWritingWords } from '../vendored/writing/words.js';
import { unified } from 'unified';
import { VFile } from 'vfile';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkFrontmatter from 'remark-frontmatter';
import retextEnglish from 'retext-english';
import retextPassive from 'retext-passive';
import retextSimplify from 'retext-simplify';
import retextRepeatedWords from 'retext-repeated-words';
import retextIndefiniteArticle from 'retext-indefinite-article';
import retextContractions from 'retext-contractions';
import retextRedundantAcronyms from 'retext-redundant-acronyms';
import retextQuotes from 'retext-quotes';
import retextEquality from 'retext-equality';
import retextSentenceSpacing from 'retext-sentence-spacing';
import { writingTechnicalRanges } from './core/writingTechnicalModel.js';
import retextDiacritics from 'retext-diacritics';
import retextReadability from 'retext-readability';
import retextSyntaxUrls from 'retext-syntax-urls';
import { decodeString } from 'micromark-util-decode-string';
import { additionalWritingObservations } from './core/writingAdditionalRules.js';
import { writingQuotationSpans, writingTypographyConvention } from './core/writingTypographyModel.js';
import { readabilityOptions, writingPackageObservation } from './core/writingPackagePolicy.js';
import { analyzeWritingTextlint, writingTextlintReady } from './writingTextlintRuntime.js';

export const writingRuntimeReady = writingTextlintReady;
export async function analyzeWriting(source) {
    await writingRuntimeReady;
    const result = analyzeRetext(source);
    result.observations.push(...await analyzeWritingTextlint(result.projection));
    return result;
}

const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ['yaml']).freeze();
const prose = unified().use(retextEnglish).use(retextSyntaxUrls).use(retextPassive).use(retextSimplify).use(retextRepeatedWords).use(retextIndefiniteArticle)
    .use(retextContractions, { straight: true }).use(retextRedundantAcronyms).use(retextEquality)
    .use(retextSentenceSpacing, { preferred: 'space' }).use(retextDiacritics).use(retextReadability, readabilityOptions).freeze();
const versions = { 'retext-passive': '5.0.0', 'retext-simplify': '8.0.0', 'retext-repeated-words': '5.0.0', 'retext-indefinite-article': '5.0.0',
    'retext-contractions': '6.0.0', 'retext-redundant-acronyms': '5.0.0', 'retext-quotes': '6.0.2', 'retext-equality': '7.1.0',
    'retext-sentence-spacing': '6.0.0', 'retext-diacritics': '5.0.0', 'retext-readability': '8.0.0' };
// All four typography variants are ready at startup; choosing one loads no code.
const typographyProcessors = new Map(['smart', 'straight'].flatMap(preferred => [false, true].map(single => [
    `${preferred}:${single}`, unified().use(retextEnglish).use(retextSyntaxUrls).use(retextQuotes, {
        preferred, smart: single ? ['‘’', '“”'] : ['“”', '‘’'], straight: single ? ['\'', '"'] : ['"', '\''],
    }).freeze(),
])));
const excluded = new Set(['blockquote', 'code', 'inlineCode', 'math', 'inlineMath', 'yaml', 'html', 'image', 'imageReference']);
const blocks = new Set(['paragraph', 'heading', 'tableCell']);

function textUnits(node, source) {
    const start = node.position.start.offset;
    const raw = source.slice(start, node.position.end.offset);
    const units = [];
    for (let at = 0; at < raw.length;) {
        const escaped = raw.slice(at).match(/^\\[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/);
        const entity = raw.slice(at).match(/^&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/);
        const encoded = escaped?.[0] || entity?.[0] || (raw.slice(at, at + 2) === '\r\n' ? '\r\n' : raw[at]);
        const decoded = encoded === '\r\n' || encoded === '\r' ? '\n' : decodeString(encoded);
        for (let i = 0; i < decoded.length; i++) units.push({ char: decoded[i], from: start + at, to: start + at + encoded.length, safe: decoded === encoded, escaped: Boolean(escaped) });
        at += encoded.length;
    }
    return units.map(unit => unit.char).join('') === node.value.replace(/\r\n?/g, '\n') ? units : [];
}
function collectInline(node, source, units) {
    if (excluded.has(node.type)) { units.push({ char: '\uFFFC', from: -1, to: -1, safe: false }); return; }
    if (node.type === 'text') { units.push(...textUnits(node, source)); return; }
    if (node.type === 'break') { units.push({ char: '\n', from: -1, to: -1, safe: false }); return; }
    for (const child of node.children || []) collectInline(child, source, units);
}
function hideTechnicalSyntax(units) {
    const text = units.map(unit => unit.char).join('');
    const hide = (from, to) => { for (let i = from; i < to; i++) units[i] = { ...units[i], char: ' ', safe: false, hidden: true }; };
    for (const range of writingTechnicalRanges(text)) hide(range.from, range.to);
    for (const match of text.matchAll(/(?:\.{1,2}\/|\/)[\w./-]+/gu)) hide(match.index, match.index + match[0].length);
    for (const match of text.matchAll(/--[a-z][\w-]*|\b[A-Za-z]+(?:[A-Z][a-z]+){1,}\b|\b\w+(?:\.\w+)+\([^\n)]*\)/gu)) {
        if (/^[A-Z]{2,}s$/u.test(match[0])) continue; // Acronym plurals are prose, not camelCase identifiers.
        hide(match.index, match.index + match[0].length);
    }
}
export function prepareWritingSource(source) {
    const result = { text: '', units: [], regions: [], quotationSpans: [], typography: { text: '', units: [] } };
    const wiki = wikiLinkRanges(source);
    function visit(node) {
        if (excluded.has(node.type)) return;
        if (blocks.has(node.type)) {
            const units = []; collectInline(node, source, units); hideTechnicalSyntax(units);
            for (const link of wiki) {
                if (link.to <= node.position.start.offset || link.from >= node.position.end.offset) continue;
                for (let at = 0; at < units.length; at++) {
                    const unit = units[at];
                    if (unit.from >= link.from && unit.to <= link.to && !(unit.from >= link.aliasFrom && unit.to <= link.aliasTo)) {
                        units[at] = { ...unit, char: ' ', safe: false, hidden: true };
                    }
                }
            }
            if (!units.some(unit => /\p{L}/u.test(unit.char))) return;
            const start = result.units.length;
            const separator = [{ char: '\n', from: -1, to: -1 }, { char: '\n', from: -1, to: -1 }];
            result.typography.units.push(...units, ...separator);
            for (const span of writingQuotationSpans(units)) {
                result.quotationSpans.push({ ...span, from: start + span.from, to: start + span.to });
                for (let at = span.from; at < span.to; at++) units[at] = { ...units[at], char: ' ', safe: false, hidden: true };
            }
            result.units.push(...units, { char: '\n', from: -1, to: -1 }, { char: '\n', from: -1, to: -1 });
            result.regions.push({ from: node.position.start.offset, to: node.position.end.offset, start, end: start + units.length, type: node.type });
            return;
        }
        for (const child of node.children || []) visit(child);
    }
    const frontmatter = getFrontmatterRegion(source);
    const parsedSource = frontmatter ? source.slice(0, frontmatter.to).replace(/[^\r\n]/g, ' ') + source.slice(frontmatter.to) : source;
    visit(markdown.parse(parsedSource));
    result.text = result.units.map(unit => unit.char).join('');
    result.ordinaryCapitals = [...new Set([...result.text.matchAll(/\b[A-Z]{3,5}\b/g)]
        .map(match => match[0]).filter(word => ordinaryWritingWords.has(word.toLowerCase())))];
    result.typography.text = result.typography.units.map(unit => unit.char).join('');
    return result;
}

export function analyzeRetext(source) {
    const projection = prepareWritingSource(source);
    const convention = writingTypographyConvention(projection);
    const file = new VFile(projection.text);
    const tree = prose.parse(file);
    prose.runSync(tree, file);
    const sentences = [];
    function visit(node) {
        if (node.type === 'SentenceNode') sentences.push({ start: node.position.start.offset, end: node.position.end.offset });
        else for (const child of node.children || []) visit(child);
    }
    visit(tree);
    projection.sentences = sentences;
    const messages = file.messages.filter(message => {
        if (message.source === 'retext-contractions') {
            const straight = value => value.replace(/’/g, '\'');
            if (straight(message.actual) === straight(message.expected[0])) return false;
            const apostrophe = message.actual.includes('’') || (!message.actual.includes('\'') && convention.apostropheStyle === 'smart') ? '’' : '\'';
            message.originalExpected = message.expected;
            message.expected = message.expected.map(value => value.replace(/'/g, apostrophe));
        }
        if (message.source !== 'retext-indefinite-article') return true;
        const end = message.place?.end.offset;
        const following = projection.text.slice(end).match(/^\s+\p{L}[\p{L}’'-]*/u);
        return following && projection.units.slice(message.place.start.offset, end + following[0].length)
            .every(unit => unit.from >= 0 && !unit.hidden);
    });
    const typography = typographyProcessors.get(`${convention.quoteStyle}:${convention.singleFirst}`);
    const typographyFile = new VFile(projection.typography.text);
    const typographyTree = typography.parse(typographyFile);
    typography.runSync(typographyTree, typographyFile);
    let apostropheFile = typographyFile;
    if (convention.apostropheStyle !== convention.quoteStyle) {
        apostropheFile = new VFile(projection.typography.text);
        typographyProcessors.get(`${convention.apostropheStyle}:${convention.singleFirst}`).runSync(typographyTree, apostropheFile);
    }
    for (const message of apostropheFile.messages.filter(item => item.ruleId === 'apostrophe')) {
        const at = message.place.start.offset;
        if (projection.units[at]?.hidden) continue; // Never restyle quoted wording.
        if (messages.some(item => item.source === 'retext-contractions' && item.place.start.offset <= at && item.place.end.offset > at)) continue;
        messages.push(message);
    }
    const observations = messages.map(message => ({
        engine: 'retext', version: versions[message.source], rule: message.source,
        package: message.source, evidenceFamily: 'unknown',
        ruleId: message.ruleId, message: message.reason, note: message.note, severity: 'suggestion',
        from: message.place?.start.offset, to: message.place?.end.offset,
        actual: message.actual, replacements: message.expected || [],
        native: { place: message.place, ruleId: message.ruleId, actual: message.actual, expected: message.originalExpected || message.expected, note: message.note, message: message.reason },
    })).map(raw => writingPackageObservation(raw, projection)).filter(Boolean);
    for (const span of projection.quotationSpans) {
        const marks = typographyFile.messages.filter(item => item.ruleId === 'quote' && item.place.start.offset >= span.from && item.place.end.offset <= span.to);
        if (!marks.length) continue;
        observations.push({ engine: 'retext', version: versions['retext-quotes'], package: 'retext-quotes', rule: 'retext-quotes', ruleId: 'quote',
            from: span.from, to: span.to, actual: projection.typography.text.slice(span.from, span.to), severity: 'suggestion', evidenceFamily: 'unknown', replacements: [],
            quotationMarks: marks.map(item => ({ from: item.place.start.offset, to: item.place.end.offset, actual: item.actual, replacement: item.expected[0] })),
            native: marks.map(item => ({ place: item.place, ruleId: item.ruleId, actual: item.actual, expected: item.expected, message: item.reason })) });
    }
    return { projection, observations: [...observations, ...additionalWritingObservations(projection)] };
}
