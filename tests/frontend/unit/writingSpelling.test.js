import { writingSpellingObservations, spellcheckSuggestionsAtPosition, spellcheckDiagnostics } from '../../../frontend/js/spellcheck.js';
import fs from 'node:fs';
import nspell from '../../../frontend/vendored/spellcheck/nspell.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';
import { createWritingResultsView } from '../../../frontend/js/views/writingResultsView.js';
import { spellingPossessive, spellingSentenceStart } from '../../../frontend/js/core/spellingModel.js';
import { acceptedSpelling } from '../../../frontend/js/core/spellingDictionaryModel.js';
import { inclusiveAlternatives } from '../../../frontend/js/core/writingPackagePolicy.js';
import { termGroups, capitalizationGroups } from '../../../frontend/js/core/writingAdditionalRules.js';
import { writingTerminology } from '../../../frontend/js/core/writingTextlintModel.js';

const dictionary = language => nspell({
    aff: fs.readFileSync(`frontend/vendored/spellcheck/${language}.aff`, 'utf8'),
    dic: fs.readFileSync(`frontend/vendored/spellcheck/${language}.dic`, 'utf8'),
});

test.each(['en-US', 'en-GB'])('%s capitalized and all-caps prose receive case-matched spelling alternatives', async language => {
    const checker = dictionary(language);
    const source = 'Speling SPELING TEH API APIs CPU CPUs Hennessey';
    const observations = await writingSpellingObservations(source, language, async () => checker);
    expect(observations.map(item => item.actual)).toEqual(['Speling', 'SPELING', 'TEH', 'Hennessey']);
    for (const [word, expected] of [['Speling', 'Spelling'], ['SPELING', 'SPELLING'], ['TEH', 'THE']]) {
        const item = observations.find(item => item.actual === word);
        expect(item.replacements).toContain(expected);
        expect(await spellcheckSuggestionsAtPosition(source, item.from + 1, language, async () => checker))
            .toMatchObject({ suggestions: item.replacements });
    }
    expect(observations.find(item => item.actual === 'Hennessey').replacements).toEqual([]);
});

test('ambiguous slash and dot prose stays spellchecked while actual technical ranges stay protected', async () => {
    const source = 'writting/editting writting.editting `teh` src/file.md ../teh person@teh.com https://teh.com';
    const checker = dictionary('en-US');
    const items = await writingSpellingObservations(source, 'en-US', async () => checker);
    expect(items.map(item => item.actual)).toEqual(['writting', 'editting', 'writting', 'editting']);
    for (const item of items) expect(source.slice(item.from, item.to)).toBe(item.actual);
});

test('canonical Unicode lookup keeps accents and exact original UTF-16 source ranges', async () => {
    const checker = dictionary('es');
    const source = '😀 café cafe\u0301\r\naccio\u0301nn';
    const items = await writingSpellingObservations(source, 'es', async () => checker);
    expect(items).toHaveLength(1);
    expect(items[0].actual).toBe('accio\u0301nn');
    expect(items[0].replacements).toContain('acción');
    expect(source.slice(items[0].from, items[0].to)).toBe('accio\u0301nn');
    const hints = await spellcheckDiagnostics(source, 'es', async () => checker);
    expect(hints.map(item => [item.from, item.to])).toEqual(items.map(item => [item.from, item.to]));
    expect(await spellcheckSuggestionsAtPosition(source, source.indexOf('cafe') + 1, 'es', async () => checker)).toBeNull();
});

test('personal spelling uses the same eagerly mapped nspell package in source and production builds', () => {
    const index = fs.readFileSync('frontend/index.html', 'utf8');
    const imports = JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
    expect(imports.nspell).toBe('/vendored/spellcheck/nspell.js');
    expect(JSON.parse(fs.readFileSync('frontend/vendored/importmap.json', 'utf8')).imports.nspell).toBe('./spellcheck/nspell.js');
    expect(fs.readFileSync('scripts/vendor.sh', 'utf8')).toContain('"nspell": "./spellcheck/nspell.js"');
});

test.each(['en-US', 'en-GB'])('personal noun forms agree with the bundled %s Hunspell model without inheriting verb rules', language => {
    const checker = dictionary(language);
    const roots = ['figaroword', 'glinterbox', 'glinterberry', 'glinterday', 'glinter-bush'];
    roots.forEach(word => checker.add(word, 'cat'));
    const accepts = acceptedSpelling(roots, language);
    for (const word of ['figaroword', 'figarowords', "figaroword's", 'glinterboxes', 'glinterberries', 'glinterdays',
        'glinter-bushes', 'figaroworded', 'figarowording', 'figarwords', 'glinterberrys']) {
        expect([word, accepts(word)]).toEqual([word, checker.correct(word)]);
    }
});

test('spelling protects defined and undefined footnote identifiers but checks their body and inline-note prose', async () => {
    const source = '😀 A note[^markdownreferences] and [^teh].\r\n\r\n[^teh]: A teh typo.\r\n\r\nAn inline note ^[teh].';
    const observations = await writingSpellingObservations(source, 'en-US', async () => dictionary('en-US'));
    expect(observations.map(item => [item.actual, item.from])).toEqual([
        ['teh', source.indexOf('A teh') + 2], ['teh', source.lastIndexOf('teh')],
    ]);
    await expect(spellcheckSuggestionsAtPosition(source, source.indexOf('markdownreferences') + 1, 'en-US', async () => dictionary('en-US'))).resolves.toBeNull();
});

test.each(['en-US', 'en-GB'])('real %s spelling preserves valid plural/name possessives and corrects stems without changing possession', async language => {
    const checker = dictionary(language), getChecker = async () => checker;
    const correct = "The users’ preferences matter. The users' preferences matter. The engineers’ tools and dogs' bowls are here. James’ and James' preferences matter. The children’s and child's preferences matter. It’s ready. Don't change it.";
    expect(await writingSpellingObservations(correct, language, getChecker)).toEqual([]);
    const source = "😀 usres’ tools and chidl's toys; usres' tools and chidl’s toys.";
    const observations = await writingSpellingObservations(source, language, getChecker);
    expect(observations.map(item => item.actual)).toEqual(['usres’', "chidl's", "usres'", 'chidl’s']);
    for (const [index, replacement] of ['users’', "child's", "users'", 'child’s'].entries()) {
        const item = observations[index];
        expect(source.slice(item.from, item.to)).toBe(item.actual);
        expect(item.replacements).toContain(replacement);
        expect(item.replacements.every(value => value.endsWith(item.actual.slice(item.actual.indexOf(item.actual.includes('’') ? '’' : "'"))))).toBe(true);
        await expect(spellcheckSuggestionsAtPosition(source, item.from + 1, language, getChecker)).resolves.toMatchObject({ suggestions: item.replacements });
    }
});

test('English possessive normalization is language-specific and does not accept arbitrary unknown stems', async () => {
    expect(spellingPossessive('users’', ['es'])).toBeNull();
    const checker = dictionary('en-US');
    const [unknown] = await writingSpellingObservations('zzquuxs’', 'en-US', async () => checker);
    expect(unknown).toMatchObject({ actual: 'zzquuxs’', replacements: [] });
});

test('resolved spelling rejects protected or corrupt ranges and never offers reference-key fixes, including bulk', async () => {
    const source = '[teh label][teh] and [teh][] and [teh].\n\n[teh]: destination\n\n    const teh = true;';
    const checker = dictionary('en-US'), preferences = { lenses: ['spelling'], language: 'en-US' };
    const observations = await writingSpellingObservations(source, 'en-US', async () => checker);
    const make = from => ({ engine: 'spelling', rule: 'figaro-spelling', from, to: from + 3, actual: 'teh', replacements: ['the'] });
    const result = resolveWritingFindings({ source, preferences, observations: [...observations,
        make(source.indexOf('][teh]') + 2), make(source.indexOf('[teh]:') + 1), make(source.lastIndexOf('teh')),
        { ...make(1), actual: 'bad' },
    ] });
    expect(result.rejected).toBe(4);
    const found = result.groups.flatMap(group => group.findings);
    expect(found.map(finding => [finding.actual, finding.fixes.length])).toEqual([['teh', 1], ['teh', 0], ['teh', 0]]);
    expect(found[1].message).toContain('edit the label and reference together');
    const fix = found[0].fixes[0];
    expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(source.replace('[teh label]', '[the label]'));
    const view = createWritingResultsView({ onRetry() {} });
    view.update({ ...result, current: { id: 'note', source, preferences, language: 'en-US' } });
    expect(view.element.querySelectorAll('[aria-label^="Replace"]')).toHaveLength(1);
    expect(view.element.querySelector('[data-writing-bulk]')).toBeNull();
});

test('correct possessives produce no misleading Apply buttons while a real typo remains reviewable', async () => {
    const source = "The users’ and dogs' preferences matter. The teh typo remains.";
    const observations = await writingSpellingObservations(source, 'en-US', async () => dictionary('en-US'));
    const preferences = { lenses: ['spelling'], language: 'en-US' };
    const result = resolveWritingFindings({ source, preferences, observations });
    const view = createWritingResultsView({ onRetry() {} });
    view.update({ ...result, current: { id: 'note', source, language: 'en-US', preferences } });
    expect([...view.element.querySelectorAll('[aria-label^="Replace"]')].map(button => button.getAttribute('aria-label'))).toEqual(['Replace “teh” with “the”']);
});

test('writing spelling reuses conservative corrections and only looks up each repeated word once', async () => {
    const checker = { correct: jest.fn(word => word === 'the'), spell: jest.fn(word => ({ correct: word === 'the' })), suggest: jest.fn(() => []) };
    const getChecker = jest.fn(async () => checker);
    const source = 'teh teh\n\n`teh`';
    const observations = await writingSpellingObservations(source, 'en-US', getChecker);
    expect(observations.map(item => [item.from, item.to, item.replacements])).toEqual([[0, 3, ['the']], [4, 7, ['the']]]);
    expect(checker.correct).toHaveBeenCalledTimes(1);
    expect(observations[0].replacements).toEqual((await spellcheckSuggestionsAtPosition(source, 1, 'en-US', getChecker)).suggestions);
    expect(await writingSpellingObservations('---\nspellcheck: false\n---\nteh', 'en-US', getChecker)).toEqual([expect.objectContaining({ actual: 'teh', replacements: ['the'] })]);
    await expect(writingSpellingObservations('teh', 'en-US', async () => { throw new Error('missing dictionary'); })).rejects.toThrow('missing dictionary');
});

test('spelling excludes wiki targets and embeds but retains explicit alias words', async () => {
    const { spellcheckWordRanges } = await import('../../../frontend/js/spellcheck.js');
    const source = '[[teh]] [[teh#teh]] [[teh|good]] ![[teh]] ![[Target|teh]] [[Target|teh]] [teh](teh.md)';
    expect(spellcheckWordRanges(source).map(range => source.slice(range.from, range.to))).toEqual(['good', 'teh', 'teh']);
});

test('warm spelling reuses word checks across edits, remaps occurrences and separates languages', async () => {
    const checker = { correct: jest.fn(word => word === 'the'), spell: jest.fn(word => ({ correct: word === 'the' })), suggest: jest.fn(() => []) };
    const getChecker = async () => checker, suggestions = new Map();
    await writingSpellingObservations('teh', 'en-US', getChecker, { suggestions });
    checker.correct.mockClear();
    const moved = await writingSpellingObservations('the\n\nteh', 'en-US', getChecker, { suggestions });
    expect(moved).toMatchObject([{ from: 5, to: 8, actual: 'teh', replacements: ['the'] }]);
    expect(checker.correct).toHaveBeenCalledTimes(1);
    expect(checker.correct).toHaveBeenCalledWith('the');
    checker.correct.mockClear();
    await writingSpellingObservations('teh', 'en-GB', getChecker, { suggestions });
    expect(checker.correct).toHaveBeenCalledWith('teh');
    expect(await writingSpellingObservations('`teh`', 'en-US', getChecker, { suggestions })).toEqual([]);
    await expect(writingSpellingObservations('teh', 'en-US', getChecker, { suggestions, checkpoint: async () => { throw new Error('cancelled'); } })).rejects.toThrow('cancelled');
});

test.each(['en-US', 'en-GB'])('%s spelling accepts every replacement a writing lens offers', async language => {
    const offered = [...[...inclusiveAlternatives.values()].flat(), ...termGroups.flat(), ...capitalizationGroups.flat(), ...writingTerminology];
    const source = offered.map(word => `Use ${word} here.`).join('\n\n');
    const observations = await writingSpellingObservations(source, language, async () => dictionary(language));
    expect(observations.map(item => item.actual)).toEqual([]);
    // Recognition is exact for product names: a miscased brand is still reviewed.
    const miscased = await writingSpellingObservations('Graphql and allowlist', language, async () => dictionary(language));
    expect(miscased.map(item => item.actual)).toEqual(['Graphql']);
});

test.each(['en-US', 'en-GB'])('%s lowercase proper nouns get their capital and missing spaces get reviewed splits', async language => {
    const checker = dictionary(language);
    const source = 'See you friday about english. We have alot to do, infact aswell as eachother and noone. Alot remains. Maybe incase and amercia.';
    const observations = await writingSpellingObservations(source, language, async () => checker);
    const fixes = Object.fromEntries(observations.map(item => [item.actual, item.replacements]));
    expect(fixes).toMatchObject({ friday: ['Friday'], english: ['English'], alot: ['a lot'], infact: ['in fact'],
        aswell: ['as well'], eachother: ['each other'], noone: ['no one'], Alot: ['A lot'], amercia: ['America'] });
    // Ambiguous or name-only alternatives are not offered for lowercase prose.
    expect(fixes.incase).not.toContain('in case');
    expect(fixes.incase).not.toContain('Incas');
    expect(observations.find(item => item.actual === 'alot').bulkSafe).toBe(true);
    expect(observations.find(item => item.actual === 'friday').bulkSafe).toBe(false);
    expect(await spellcheckSuggestionsAtPosition(source, source.indexOf('friday') + 1, language, async () => checker))
        .toMatchObject({ suggestions: ['Friday'] });
});

test.each(['en-US', 'en-GB'])('%s capitalized unknown words inside a sentence stay flagged without a different-word correction', async language => {
    const checker = dictionary(language);
    const source = 'We moved to Postgres last week and Recieve Waht.\n\nTeh result was fine. Speling matters.\n\n## Using Postgres\n\n- Postgres list item';
    const observations = await writingSpellingObservations(source, language, async () => checker);
    const at = (word, index = 0) => observations.filter(item => item.actual === word)[index];
    expect(at('Postgres')).toMatchObject({ replacements: [] });
    expect(at('Postgres', 1)).toMatchObject({ replacements: [] });
    expect(at('Recieve').replacements).toEqual(['Receive']);
    expect(at('Waht').replacements).toEqual(['What']);
    expect(at('Teh').replacements).toEqual(['The']);
    expect(at('Speling').replacements).toContain('Spelling');
    // A list item begins a sentence, so its capital is ordinary sentence case.
    expect(at('Postgres', 2).replacements.length).toBeGreaterThan(0);
    expect(await spellcheckSuggestionsAtPosition(source, source.indexOf('Postgres') + 1, language, async () => checker))
        .toMatchObject({ word: 'Postgres', suggestions: [] });
});

test('sentence starts follow punctuation, blocks and paragraphs but not wrapped lines or colons', () => {
    for (const [source, expected] of [['Postgres is', true], ['We use Postgres', false], ['Done. Postgres', true],
        ['Done! "Postgres', true], ['Database: Postgres', false], ['# Postgres', true], ['## Using Postgres', false],
        ['- Postgres', true], ['1. Postgres', true], ['- [ ] Postgres', true], ['text\n\nPostgres', true],
        ['we use\nPostgres', false], ['ends.\nPostgres', true], ['# Head\nPostgres', true], ['| a | Postgres |', true],
        ['> we use\n> Postgres', false], ['**Postgres**', true], ['we use **Postgres**', false], ['see (Postgres', false]]) {
        expect([source, spellingSentenceStart(source, source.indexOf('Postgres'))]).toEqual([source, expected]);
    }
});

test.each(['en-US', 'en-GB'])('%s recognizes regular derivations and accented spellings the small dictionary omits', async language => {
    const checker = dictionary(language);
    const valid = ['transformative', 'durations', 'clichés', 'Clichés', 'resizable', 'callouts', 'multiline', 'reviewable',
        'unspaced', 'untagged', 'unlinked', 'rescan', 'Durations', 'durations’'];
    expect((await writingSpellingObservations(valid.join(' '), language, async () => checker)).map(item => item.actual)).toEqual([]);
    // Every derivation needs a known base, and familiar misspellings stay reviewable.
    const misspelled = ['noticable', 'accessable', 'reversable', 'thats', 'everyones', 'durashuns', 'unrecieved', 'recieveable', 'clíchez', 'multilyne'];
    expect((await writingSpellingObservations(misspelled.join(' '), language, async () => checker)).map(item => item.actual)).toEqual(misspelled);
});

test.each(['en-US', 'en-GB'])('%s reviewed software, keyboard and note-taking vocabulary keeps exact casing where it matters', async language => {
    const checker = dictionary(language);
    const known = 'Cmd Cmd-click macOS Kanban Gantt strikethrough GTK WebKitGTK backlinks Backlinks callouts backtick Prepending tooltip frontmatter backend stylesheet UI TODO todos io env dir';
    expect((await writingSpellingObservations(known, language, async () => checker)).map(item => item.actual)).toEqual([]);
    const miscased = await writingSpellingObservations('macos Macos ui gtk gantt webkitgtk', language, async () => checker);
    expect(miscased.map(item => item.actual)).toEqual(['macos', 'Macos', 'ui', 'gtk', 'gantt', 'webkitgtk']);
});
