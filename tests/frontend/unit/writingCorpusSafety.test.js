import fs from 'node:fs';
import nspell from '../../../frontend/vendored/spellcheck/nspell.js';
import { analyzeWriting, analyzeRetext, prepareWritingSource } from '../../../frontend/vendored/writing/runtime.js';
import { writingSpellingObservations } from '../../../frontend/js/spellcheck.js';
import { spellcheckWordRanges } from '../../../frontend/js/core/spellingModel.js';
import { resolveWritingFindings, valeWritingObservations } from '../../../frontend/js/core/writingAnalysisModel.js';
import { writingReviewCards, writingBulkAvailable, planWritingBulkFix } from '../../../frontend/js/core/writingReviewModel.js';
import { writingAcronymDefined } from '../../../frontend/js/core/writingTextlintModel.js';
import { writingURLRanges } from '../../../frontend/js/core/writingTechnicalModel.js';
import { createWritingResultsView } from '../../../frontend/js/views/writingResultsView.js';

const dictionaries = new Map();
function checker(language) {
    if (!dictionaries.has(language)) dictionaries.set(language, nspell({ aff: fs.readFileSync(`frontend/vendored/spellcheck/${language}.aff`, 'utf8'), dic: fs.readFileSync(`frontend/vendored/spellcheck/${language}.dic`, 'utf8') }));
    return dictionaries.get(language);
}
const spelling = (source, language = 'en-US') => writingSpellingObservations(source, language, async () => checker(language));
const visible = result => result.groups.flatMap(group => group.findings);
const preferences = lenses => ({ lenses, language: 'en-US' });
async function review(source, lenses) { return visible(resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: preferences(lenses) })); }
const apply = (source, fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);

test.each(['en-US', 'en-GB'])('corpus spelling recognizes technical vocabulary and acronym plurals in %s without accepting typos', async language => {
    expect(await spelling('Jupyter uses APIs and DOIs. The initializer handles subclasses, unhandled exceptions, iterable values and hashbang syntax. The preprint is citable. Digital Object Identifiers (dois) are used in json. Dependences may exist.', language)).toEqual([]);
    expect((await spelling('teh reciept zzquux', language)).map(f => f.actual)).toEqual(['teh', 'reciept', 'zzquux']);
});

test('spelling bulk eligibility requires a reviewed correction, not a single dictionary guess', async () => {
    const source = 'teh reciept teh reciept';
    const current = { id: 'one', revision: 1, configuration: 'current', source };
    const result = resolveWritingFindings({ source, observations: await spelling(source), preferences: preferences(['spelling']) });
    for (const card of writingReviewCards(result.groups)) {
        expect(writingBulkAvailable(card)).toBe(true);
        expect(planWritingBulkFix({ ...result, analyzed: current }, card.findings[0].id, current)).toHaveLength(2);
    }
    const guess = { ...result.groups[0].findings[0], bulkSafe: false };
    expect(writingBulkAvailable({ findings: [guess, { ...guess, from: 12 }] })).toBe(false);
    expect(writingBulkAvailable({ findings: [{ ...guess, bulkSafe: undefined }, { ...guess, from: 12 }] })).toBe(false);
    const old = resolveWritingFindings({ source, observations: (await spelling(source)).map(({ bulkSafe: _bulkSafe, ...raw }) => raw), preferences: preferences(['spelling']) });
    expect(writingReviewCards(old.groups).every(card => !writingBulkAvailable(card))).toBe(true);
});

test('unknown names remain reviewable without ordinary-word replacement guesses', async () => {
    const [name] = await spelling('Hennessey');
    expect(name).toMatchObject({ actual: 'Hennessey', replacements: [], bulkSafe: false });
    expect((await spelling('Reciept'))[0]).toMatchObject({ replacements: ['Receipt'], bulkSafe: true });
});

test('dictionary alternatives do not turn an unpossessed plural into a possessive', async () => {
    const [finding] = await spelling('precedences');
    expect(finding.replacements).toContain('precedence');
    expect(finding.replacements).not.toContain("precedence's");
    expect(finding.bulkSafe).toBe(false);
    expect((await spelling('doesnt'))[0].replacements).toContain("doesn't");
});

test('suggestion cards expose spelling Apply to all only for reviewed corrections', async () => {
    const onApplyAll = jest.fn();
    const view = createWritingResultsView({ onRetry() {}, onApplyAll });
    for (const [source, bulk] of [['precedences precedences', false], ['teh teh', true]]) {
        const current = { source, id: 'note', revision: 1, configuration: 'current', language: 'en-US', preferences: preferences(['spelling']) };
        const result = resolveWritingFindings({ source, observations: await spelling(source), preferences: current.preferences });
        view.update({ ...result, analyzed: current, current });
        expect(Boolean(view.element.querySelector('[data-writing-bulk]'))).toBe(bulk);
        if (bulk) {
            view.element.querySelector('[data-writing-bulk]').click();
            expect(onApplyAll).toHaveBeenCalledWith(visible(result)[0].id, current);
        }
    }
});

test.each(["'verbose'", '‘open’', '[‘open’ register](https://example.org)', '‘the users’', "'the users'"])(
    'spelling preserves correct closing single quotes in %s', async source => {
        expect(await spelling(source)).toEqual([]);
    });

test.each(["The 'reciept' is here.", 'The ‘reciept’ is here.', 'The [‘reciept’](file.md) is here.', 'The ‘usres’ are here.'])(
    'spelling fixes only the word inside quotation delimiters: %s', async source => {
        const result = resolveWritingFindings({ source, observations: await spelling(source), preferences: preferences(['spelling']) });
        const [finding] = visible(result);
        expect(finding.actual).not.toMatch(/['’]$/u);
        expect(apply(source, finding.fixes[0])).toBe(source.replace('reciept', 'receipt').replace('usres', 'users'));
    });

test.each(['_teh_', '__teh__', '*teh*', '**teh**', '_a teh mistake_', '__a teh mistake__'])(
    'Markdown emphasis retains spelling detection and exact replacement boundaries: %s', async text => {
        const source = `Fix ${text} now.`;
        const observations = await spelling(source);
        expect(observations.map(f => f.actual)).toEqual(['teh']);
        const [finding] = visible(resolveWritingFindings({ source, observations, preferences: preferences(['spelling']) }));
        expect(apply(source, finding.fixes[0])).toBe(source.replace('teh', 'the'));
    });

test('underscore emphasis does not truncate possessives or disable genuine identifier protection', async () => {
    expect(await spelling('_Nucleic Acid Research’s_ and _PLOS Computational Biology’s_ are here.')).toEqual([]);
    expect(await spelling('Read src/file_name.md and `teh` and\n\n```\nteh\n```')).toEqual([]);
    expect((await spelling('_the reciepts’ totals_'))[0]).toMatchObject({ actual: 'reciepts’', replacements: ['receipts’'] });
});

test('spelling does not propose partial changes to numeric compounds or attached units', async () => {
    const source = 'Use base-10, UTF-8, 8.1Mib and 20ms.';
    expect(spellcheckWordRanges(source).map(f => f.word)).toEqual(['Use', 'and']);
    expect(await spelling(source)).toEqual([]);
});

test.each([
    ['Read (https://example.org).', 'https://example.org'],
    ['Read (https://example.org/path_(one)).', 'https://example.org/path_(one)'],
    ['Read “https://example.org/path”.', 'https://example.org/path'],
    ['Read https://example.org?a=(one), now.', 'https://example.org?a=(one)'],
])('URL recognition preserves enclosing punctuation: %s', (source, expected) => {
    expect(writingURLRanges(source).map(r => source.slice(r.from, r.to))).toEqual([expected]);
});

test.each(['Read (https://example.org).', 'Read ([https://example.org](https://example.org/)).',
    'Read (https://example.org/path_(one)).', 'Read ([website](https://example.org)).', 'Read (`code`).'])(
    'bundled punctuation rules recognize balanced URL/code neighbours: %s', async source => {
        expect((await review(source, ['grammar'])).filter(f => f.kind === 'grammar.unmatched-pair')).toEqual([]);
    });

test('URL recognition trims a long run of enclosing closers while retaining the balanced path', () => {
    const url = 'https://example.org/path_(one)';
    const source = `Read (${url}${')'.repeat(20000)}.`;
    expect(writingURLRanges(source)).toEqual([{ from: 6, to: 6 + url.length }]);
});

test('URL guards preserve a genuinely unmatched opening parenthesis', async () => {
    expect((await review('Read (https://example.org and the guide.', ['grammar'])).filter(f => f.kind === 'grammar.unmatched-pair')).toHaveLength(1);
});

function nativeAnchor(projection, actual) {
    const at = projection.text.indexOf(actual), prefix = projection.text.slice(0, at), column = Array.from(prefix.slice(prefix.lastIndexOf('\n') + 1)).length + 1;
    return { 'stdin.txt': [{ Check: 'Microsoft.SentenceLength', Match: actual, Line: prefix.split('\n').length, Span: [column, column + actual.length - 1] }] };
}

test('native sentence-length anchors cannot label a short introduction while 31-word prose retains coverage', () => {
    const long = Array(31).fill('word').join(' ') + '.';
    for (const intro of ['For example:', 'They will either:', 'The report is ready.']) {
        const source = intro + '\n\n' + long, data = analyzeRetext(source);
        expect(valeWritingObservations(nativeAnchor(data.projection, intro.split(' ')[0]), data.projection)).toEqual([]);
        const found = visible(resolveWritingFindings({ source, ...data, preferences: preferences(['readability']) }));
        expect(found.filter(f => f.kind === 'readability.long-sentence').map(f => f.actual)).toEqual([long]);
    }
    const short = Array(30).fill('word').join(' ') + '.';
    expect(analyzeRetext(short).observations.filter(f => f.rule === 'figaro-long-sentence')).toEqual([]);
});

test.each(['# Heading\n\n', '- List introduction:\n\n', '```\ncode\n```\n\n'])(
    'sentence-length checks retain correctly mapped soft-wrapped prose after %s', prefix => {
        const long = Array(16).fill('word').join(' ') + '\n' + Array(16).fill('word').join(' ') + '.';
        const source = prefix + long, data = analyzeRetext(source);
        const native = valeWritingObservations(nativeAnchor(data.projection, 'word'), data.projection);
        const [finding] = visible(resolveWritingFindings({ source, projection: data.projection, observations: native, preferences: preferences(['readability']) }));
        expect(finding.actual).toBe(long); expect(source.slice(finding.from, finding.to)).toBe(long);
    });

test.each(['The HTTP request passes parameters to a function with a return type.',
    'Enter your name and postal address.', 'The function returns a value.', 'Call the function with positional parameters.'])(
    'Clarity preserves established technical/noun senses: %s', async source => {
        expect((await review(source, ['plain'])).filter(f => ['function', 'request', 'parameters', 'type', 'address'].includes(f.actual.toLowerCase()))).toEqual([]);
    });

test.each(['We request permission.', 'We should address the concern.', 'We utilize tools in order to finish.'])(
    'Clarity retains useful verb and purpose-phrase advice: %s', async source => {
        expect((await review(source, ['plain'])).length).toBeGreaterThan(0);
    });

test.each(['Use the easy read guide.', 'The setup is not easy.', 'This is not just a list.',
    'It is just as diverse.', 'Just like any other bug, this can be fixed.',
    'Read the Ten Simple Rules collection.', 'Use a clearly annotated notebook.', 'The task cannot be easily repeated.'])(
    'Inclusive language respects accessibility terminology, limiting phrases and negation: %s', async source => {
        expect(await review(source, ['inclusive'])).toEqual([]);
    });

test('Inclusive language retains role/reader-assumption advice with concern-specific explanations', async () => {
    const found = await review('The chairman said everyone knows this is easy.', ['inclusive']);
    expect(found.some(f => f.actual === 'chairman' && f.fixes.length === 2)).toBe(true);
    const tone = found.find(f => f.actual === 'easy');
    expect(tone.message).toContain('readers'); expect(tone.message).not.toContain('insensitive'); expect(tone.fixes).toEqual([]);
});

test.each([
    ['ASI', 'ASI (Automatic Semicolon Insertion) ends statements.'],
    ['ASI', 'Automatic insertion of semicolons (ASI) ends statements.'],
    ['ASI', 'Automatic Insertion Of Semicolons (ASI) ends statements.'],
    ['ASI', 'ASI is enabled.\n\nAutomatic Semicolon Insertion (ASI) ends statements.'],
    ['DOI', 'Digital Object Identifiers (DOIs) identify resources. Use the DOI.'],
    ['DOI', 'DOIs (digital object identifiers) identify resources. Use the DOI.'],
    ['UXD', 'UXD (user-experience\ndesign) guides the work.'],
    ['DHH', '# People with hearing impairments\n\n[Deaf and hard-of-hearing (DHH)](https://example.org) people use captions.'],
    ['SLO', 'A preceding short paragraph\n\nService Level Objective (SLO) guides the work.'],
])('acronym %s recognizes forward/reverse, wrapped and plural definitions', (acronym, source) => {
    expect(writingAcronymDefined(acronym, prepareWritingSource(source))).toBe(true);
});

test('an acronym definition is author-provided; recognizing initials does not invent its meaning', () => {
    expect(writingAcronymDefined('ASI', prepareWritingSource('ASI (A Strange Idea) is used.'))).toBe(true);
});

test.each(['ASI is used. `Automatic Semicolon Insertion (ASI)`',
    'Automatic Semicolon\n\nInsertion (ASI)', 'Automatic Other Words (ASI)', 'ASI is enabled.'])(
    'acronym recognition refuses missing, unrelated or protected definitions: %s', source => {
        expect(writingAcronymDefined('ASI', prepareWritingSource(source))).toBe(false);
    });
