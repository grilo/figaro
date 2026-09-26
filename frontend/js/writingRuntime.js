// This entry is bundled at build time for both the module worker and adapter tests.
import { getFrontmatterRegion } from './frontmatter.js';
import { wikiLinkRanges } from './core/noteLinks.js';
import { writingFootnoteRanges } from './core/writingFootnoteModel.js';
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
import { analyzeWritingTextlint, createIncrementalWritingTextlint, writingTextlintReady } from './writingTextlintRuntime.js';
import { createWritingSourceProjection } from './usecases/writingSourceProjection.js';
import { createWritingParagraphChecks } from './usecases/writingParagraphChecks.js';
import { offsetWritingPlace, writingParagraphChunks } from './core/writingIncrementalModel.js';

export const writingRuntimeReady = writingTextlintReady;
export async function analyzeWriting(source, options) {
    return incremental.analyze(source, options);
}
// Reference path for package equivalence tests and corpus verification.
export async function analyzeWritingFull(source) {
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

const escapedCharacter = /\\[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/y;
const characterReference = /&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/y;
// One source character, escape or character reference and the text it spells.
function markdownTextPiece(raw, at) {
    escapedCharacter.lastIndex = at; characterReference.lastIndex = at;
    const escaped = escapedCharacter.exec(raw)?.[0], entity = !escaped && characterReference.exec(raw)?.[0];
    const encoded = escaped || entity || (raw.slice(at, at + 2) === '\r\n' ? '\r\n' : raw[at]);
    const decoded = encoded === '\r\n' || encoded === '\r' ? '\n' : decodeString(encoded);
    return { encoded, decoded, escaped: Boolean(escaped) };
}
function textUnits(node, source) {
    // A node whose source cannot be recovered is left out rather than guessed.
    if (!node.position) return [];
    const start = node.position.start.offset;
    const raw = source.slice(start, node.position.end.offset);
    const units = [];
    for (let at = 0; at < raw.length;) {
        const { encoded, decoded, escaped } = markdownTextPiece(raw, at);
        for (let i = 0; i < decoded.length; i++) units.push({ char: decoded[i], from: start + at, to: start + at + encoded.length, safe: decoded === encoded, escaped });
        at += encoded.length;
    }
    return units.map(unit => unit.char).join('') === node.value.replace(/\r\n?/g, '\n') ? units : [];
}
// The end offset where source text starting at `from` spells `value`, or -1.
function markdownTextEnd(source, from, to, value) {
    const expected = value.replace(/\r\n?/gu, '\n');
    let at = from, text = '';
    while (text.length < expected.length && at < to) {
        const piece = markdownTextPiece(source, at);
        text += piece.decoded; at += piece.encoded.length;
        if (!expected.startsWith(text)) return -1;
    }
    return text === expected ? at : -1;
}
// Source ranges for consecutive nodes starting exactly at `from`, or null.
function placeMarkdownNodes(nodes, source, from, to, placed = []) {
    let at = from;
    for (const node of nodes) {
        const start = at;
        if (node.type === 'text') at = markdownTextEnd(source, at, to, node.value);
        else if (node.children?.length) at = placeMarkdownNodes(node.children, source, at, to, placed)?.end ?? -1;
        else return null;
        if (at < 0) return null;
        placed.push({ node, start, end: at });
    }
    return { end: at, placed };
}
// GFM finds some URLs only after parsing, such as “[https://example.com]”, and
// splits the surrounding text into new nodes without source positions. Recover
// each run from the source between its positioned neighbours.
function restoreSourcePositions(parent, source) {
    const children = parent.children || [];
    for (let index = 0; index < children.length; index++) {
        if (children[index].position) { restoreSourcePositions(children[index], source); continue; }
        let last = index;
        while (children[last + 1] && !children[last + 1].position) last++;
        const from = children[index - 1]?.position?.end.offset ?? parent.position?.start.offset;
        const to = children[last + 1]?.position?.start.offset ?? parent.position?.end.offset;
        for (let start = from; Number.isInteger(start) && start < to; start++) {
            const run = placeMarkdownNodes(children.slice(index, last + 1), source, start, to);
            if (!run) continue;
            for (const { node, start: begin, end } of run.placed) node.position = { start: { offset: begin }, end: { offset: end } };
            break;
        }
        index = last;
    }
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
    for (const match of text.matchAll(/--[a-z][\w-]*|\b[A-Za-z]+(?:[A-Z][a-z]+){1,}\b|\b\w+(?:\.\w+)+\([^\n)]*\)/gu)) {
        if (/^[A-Z]{2,}s$/u.test(match[0])) continue; // Acronym plurals are prose, not camelCase identifiers.
        hide(match.index, match.index + match[0].length);
    }
}
function projectWritingTree(root, source, { wiki, footnotes }) {
    restoreSourcePositions(root, source);
    const result = { text: '', units: [], regions: [], quotationSpans: [], typography: { text: '', units: [] } };
    function visit(node) {
        if (excluded.has(node.type)) return;
        if (blocks.has(node.type)) {
            const units = []; collectInline(node, source, units); hideTechnicalSyntax(units);
            for (const range of footnotes) {
                if (range.to <= node.position.start.offset || range.from >= node.position.end.offset) continue;
                for (let at = 0; at < units.length; at++) {
                    const unit = units[at];
                    if (unit.from >= range.from && unit.to <= range.to) units[at] = { ...unit, char: ' ', safe: false, hidden: true };
                }
            }
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
    visit(root);
    return result;
}

function parseWritingDocument(source) {
    const frontmatter = getFrontmatterRegion(source);
    const parsedSource = frontmatter ? source.slice(0, frontmatter.to).replace(/[^\r\n]/g, ' ') + source.slice(frontmatter.to) : source;
    const tree = markdown.parse(parsedSource), definitions = [];
    const visit = node => {
        if (node.type === 'definition' || node.type === 'footnoteDefinition') {
            definitions.push(source.slice(node.position.start.offset, node.position.end.offset));
        }
        for (const child of node.children || []) visit(child);
    };
    visit(tree);
    return { tree, context: definitions.join('\0'), wiki: wikiLinkRanges(source), footnotes: writingFootnoteRanges(source),
        blocks: tree.children.map(node => ({ from: node.position.start.offset, to: node.position.end.offset, type: node.type, node })) };
}

function finishWritingProjection(result) {
    result.text = result.units.map(unit => unit.char).join('');
    result.ordinaryCapitals = [...new Set([...result.text.matchAll(/\b[A-Z]{3,5}\b/g)]
        .map(match => match[0]).filter(word => ordinaryWritingWords.has(word.toLowerCase())))];
    result.typography.text = result.typography.units.map(unit => unit.char).join('');
    return result;
}

export function prepareWritingSource(source) {
    const parsed = parseWritingDocument(source);
    return finishWritingProjection(projectWritingTree(parsed.tree, source, parsed));
}

/** Current-document maps are shared only through the adapter's proven block plan. */
export function createIncrementalWritingSource() {
    const projection = createWritingSourceProjection({ parse: parseWritingDocument,
        project: (block, source, parsed) => projectWritingTree(block.node, source, parsed) });
    return { prepare: source => finishWritingProjection(projection.prepare(source)), stats: projection.stats };
}

function collectRetext(text) {
    const file = new VFile(text);
    const tree = prose.parse(file);
    prose.runSync(tree, file);
    const sentences = [];
    function visit(node) {
        if (node.type === 'SentenceNode') sentences.push({ start: node.position.start.offset, end: node.position.end.offset });
        else for (const child of node.children || []) visit(child);
    }
    visit(tree);
    return { sentences, messages: file.messages.map(({ source, ruleId, reason, note, actual, expected, place }) =>
        ({ source, ruleId, reason, note, actual, expected, place })) };
}

export function analyzeRetext(source) {
    const projection = prepareWritingSource(source);
    return finishRetext(projection, collectRetext(projection.text));
}

function finishRetext(projection, collected) {
    const convention = writingTypographyConvention(projection);
    projection.sentences = collected.sentences;
    const messages = collected.messages.map(message => ({ ...message })).filter(message => {
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

/** Reuse Markdown block maps and expensive paragraph checks with current offsets.
 * Convention, consistency, and acronym policy retain the whole document.
 */
export function createIncrementalWritingAnalyzer() {
    const sourceProjection = createIncrementalWritingSource();
    const retext = createWritingParagraphChecks({ analyze: collectRetext });
    const textlint = createIncrementalWritingTextlint();
    const order = Object.keys(versions);
    return {
        async analyze(source, { checkpoint = async () => {} } = {}) {
            await writingRuntimeReady;
            await checkpoint();
            const projection = sourceProjection.prepare(source);
            const collected = { messages: [], sentences: [] };
            const chunks = writingParagraphChunks(projection.text);
            const values = await retext.checkMany(chunks, checkpoint, (value, chunk) => ({
                messages: value.messages.filter(message => message.place?.start.offset >= chunk.from && message.place.start.offset < chunk.from + chunk.text.length)
                    .map(message => ({ ...message, place: offsetWritingPlace(message.place, { from: -chunk.from, line: 2 - chunk.line }) })),
                sentences: value.sentences.filter(sentence => sentence.start >= chunk.from && sentence.start < chunk.from + chunk.text.length)
                    .map(sentence => ({ start: sentence.start - chunk.from, end: sentence.end - chunk.from })),
            }));
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i], value = values[i];
                collected.messages.push(...value.messages.map(message => ({ ...message, place: offsetWritingPlace(message.place, chunk) })));
                collected.sentences.push(...value.sentences.map(sentence => ({ start: sentence.start + chunk.from, end: sentence.end + chunk.from })));
            }
            collected.messages.sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source));
            await checkpoint();
            const result = finishRetext(projection, collected);
            result.observations.push(...await textlint.analyze(projection, checkpoint));
            await checkpoint();
            return result;
        },
        stats: () => ({ projection: sourceProjection.stats(), retext: retext.stats(), textlint: textlint.stats() }),
    };
}
const incremental = createIncrementalWritingAnalyzer();
