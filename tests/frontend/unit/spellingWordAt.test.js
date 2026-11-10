/**
 * Right-click spelling reads the block around the pointer instead of the whole
 * note. These tests hold it to the whole-note scan it replaced, and count what
 * the Markdown parser is actually given.
 */
jest.mock('@lezer/markdown', () => {
    const actual = jest.requireActual('@lezer/markdown');
    const parses = [];
    const counting = (instance, kind) => new Proxy(instance, {
        get(target, key) {
            if (key === 'parse') return (input, ...rest) => { parses.push({ kind, length: input.length }); return target.parse(input, ...rest); };
            if (key === 'configure') return spec => counting(target.configure(spec), spec?.remove ? 'blocks' : kind);
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    return { ...actual, parser: counting(actual.parser, 'full'), parses };
});

import { parses } from '@lezer/markdown';
import {
    spellcheckWordRanges,
    spellingSentenceStart,
    spellingWordAt,
    spellingWordScope,
} from '../frontend/js/core/spellingModel.js';
import { spellcheckSuggestionsAtPosition, spellcheckWordAtPosition } from '../frontend/js/spellcheck.js';

/** The implementation the context menu used before: every word of the note, then a search. */
const wholeNoteWordAt = (words, point) => words.find(range => point >= range.from && point <= range.to) || null;

const fragments = [
    'A plain paragraph with a mispelled word and Wikipedia’s articles.',
    'Line one of a paragraph\nline two continues with teh typo.',
    '# Heading with teh typo',
    'Setext heading teh\n==================',
    '```js\nconst teh = 1;\n\nlet other = teh;\n```',
    '```\nunclosed fence teh',
    '~~~\ntilde teh\n\nstill tilde teh\n~~~',
    '````markdown\n```js\nnested teh\n```\n\nmore teh\n````',
    '    indented teh code\n\n    more teh code',
    '- item teh one\n- item teh two\n\n  continuation teh paragraph\n\n      nested code teh',
    '1. first teh\n2. second teh\n   ```\n   fenced in list teh\n   ```',
    '- list with fence\n  ```\n  code teh\n\nafter the list teh text',
    '- loose teh\n\n- second loose teh\n\n- third loose teh',
    '> quoted teh text\nlazy teh continuation\n> more teh',
    '> ```\n> quoted fence teh\n\noutside the quote teh',
    '<div>\nhtml block teh\n</div>',
    '<script>\nvar teh = 1;\n\nvar more = teh;\n</script>',
    '<!-- comment teh\n\nstill comment teh -->',
    '<pre>\npre teh\n\nmore teh\n</pre>',
    '<?php teh\n\necho teh ?>',
    '<![CDATA[ teh\n\nteh ]]>',
    '<!DOCTYPE teh\n\nteh>',
    'Inline `code teh` and <span>inline html teh</span> and <!-- inline teh --> comment.',
    'A [link teh](https://example.com/teh "title teh") and ![image teh](pic-teh.png).',
    'See [teh][ref] and [teh][] and [teh] and ![teh] here.',
    '[teh]: https://example.com/teh "teh title"\n[ref]: <dest teh>',
    'Visit https://example.com/teh_path and mail someone@example.com about file_name.md or ./path/teh.txt.',
    'A [[Wiki Teh|alias teh]] and ![[embed teh]] and [[plain teh]].',
    'Footnote ref[^teh] and inline ^[inline teh note].',
    '[^teh]: The footnote teh body.',
    'The Application Programming Interface (API) is here. The API works.',
    'Use the CLI and the SDK and the API today.',
    'HTTP (Hypertext Transfer Protocol) is old. HTTP and HTTPs everywhere.',
    '*Portable Document Format* (PDF) and the PDF again.',
    'The **CLI** (Command Line Interface) and `SDK (Software Development Kit)` differ.',
    'She said \'hello teh\' and the dogs\' bowls and it\'s ‘quoted teh’ fine.',
    '"Quoted teh" isn\'t the writers\' problem — rock \'n\' roll\nand an unclosed \'quote teh',
    'closing teh\' the quote opened above and James\' book.',
    '| Column teh | Other |\n| --- | --- |\n| cell teh | `code teh` |',
    '- [ ] task teh\n- [x] done teh',
    '---',
    '***',
    'Emphasis *teh* and **strong teh** and ~~struck teh~~ and snake_case_teh and mid*word*teh.',
    'well-known hyphen-teh words and 3rd numbers 2nd-rate x86 a I.',
    'Trailing spaces teh   \nhard break teh\\\nnext teh',
    'A line ending with an apostrophe teh\'\n\'starting teh',
    '&amp; entity teh &copy; \\*escaped teh\\* \\[teh\\]',
    'CamelCaseTeh and dotted.memberName and C:/path/teh and ~/home/teh.',
    'Unicode café naïve teh — “curly teh” ‘single teh’ 日本語 teh.',
    'looks: like yaml teh\n---',
    '---\nnot: frontmatter teh\n---',
    'Autolink <https://example.com/teh> and www.example.com/teh and bare teh.',
    '',
];
const separators = ['\n\n', '\n\n', '\n\n', '\n', '\n\n\n', '\n \n', '\n\t\n', '\n\n  '];

/** Deterministic notes: the same seed always builds the same text. */
function generatedNote(seed) {
    let state = seed * 2654435761 % 4294967296;
    const next = bound => { state = (state * 1664525 + 1013904223) % 4294967296; return Math.floor(state / 4294967296 * bound); };
    let note = ['', '', '', '---\ntitle: teh note\ntags: [teh]\n---\n', '---\ntitle: unclosed teh\n', '\n\n', '\uFEFF'][next(7)];
    for (let count = 4 + next(9); count > 0; count--) note += fragments[next(fragments.length)] + separators[next(separators.length)];
    return next(9) === 0 ? note.replace(/\n/g, '\r\n') : note;
}

describe('the prose word at one position', () => {
    beforeEach(() => { parses.length = 0; });

    test.each([
        ['every construct, in order', fragments.join('\n\n')],
        ['every construct, in reverse', [...fragments].reverse().join('\n\n')],
        ['frontmatter then every construct', `---\ntitle: teh\n---\n${fragments.join('\n\n')}`],
        ['single newlines between constructs', fragments.join('\n')],
        ['windows line endings', fragments.slice(0, 30).join('\n\n').replace(/\n/g, '\r\n')],
        ['an empty note', ''],
        ['only blank lines', '\n\n\n'],
        ['no final newline', 'teh'],
        ['a thematic break after an empty line is not frontmatter', 'Intro teh\n\n---\ntitle: teh\n---\n\nOutro teh'],
        ['a definition after its label', 'First [teh] here.\n\nMiddle teh.\n\n[teh]: destination'],
        ['a definition before its label', '[teh]: destination\n\nMiddle teh.\n\nLast [teh][] and ![teh] here.'],
        ['an acronym defined after its use', 'The API teh.\n\nMore teh.\n\nApplication Programming Interface (API).'],
        ['an acronym defined in emphasis', 'The CLI teh.\n\n**CLI** (Command Line Interface) and CLIs.'],
        ['an acronym only defined inside code', 'The API teh.\n\n`Application Programming Interface (API)`'],
        ['a fence that never closes', 'Before teh.\n\n```\ncode teh\n\nmore teh\n\nlast teh'],
        ['text after a fence in a list', '- item\n  ```\n  code teh\n\nafter teh\n\nlater teh'],
    ])('matches the whole-note scan at every position: %s', (_name, note) => {
        const words = spellcheckWordRanges(note);
        for (let point = -1; point <= note.length + 1; point++) {
            expect({ point, word: spellingWordAt(note, point) }).toEqual({ point, word: wholeNoteWordAt(words, point) });
        }
    });

    test('matches the whole-note scan across generated notes', () => {
        const used = new Set();
        let checked = 0;
        for (let seed = 1; seed <= 100; seed++) {
            const note = generatedNote(seed);
            const words = spellcheckWordRanges(note);
            for (let point = 0; point <= note.length; point++) {
                const expected = wholeNoteWordAt(words, point);
                const actual = spellingWordAt(note, point);
                if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                    throw new Error(`seed ${seed}, position ${point}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}\n${JSON.stringify(note)}`);
                }
                const scope = spellingWordScope(note, point);
                if (scope) used.add(scope.basis);
                checked++;
            }
        }
        // Both ways of finding where a block starts were exercised.
        expect([...used].sort()).toEqual(['blocks', 'local']);
        expect(checked).toBeGreaterThan(40000);
    });

    test('positions outside the note, inside frontmatter and without a number have no word', () => {
        const note = '---\ntitle: teh\n---\nteh body';
        for (const point of [-1, 5, note.length + 1, NaN, Infinity, undefined, 'x']) expect(spellingWordAt(note, point)).toBeNull();
        expect(spellingWordScope(note, 5)).toBeNull();
        expect(spellingWordAt(note, note.indexOf('teh body'))).toEqual({ from: 19, to: 22, word: 'teh' });
        expect(spellingWordAt(note, '20')).toEqual({ from: 19, to: 22, word: 'teh' });
        expect(spellingWordAt(note, 20.5)).toEqual({ from: 19, to: 22, word: 'teh' });
        expect(parses.every(parse => parse.length <= 'teh body'.length)).toBe(true);
    });

    test('a right-click in a large note parses its own paragraph, whatever the note size', () => {
        const paragraph = 'Some prose with a mispelled word, *emphasis* and [a link](https://example.com/page).\nA second line.\n\n';
        const offset = paragraph.indexOf('mispelled');
        const parsedBy = {};
        for (const copies of [100, 20000]) {
            const note = paragraph.repeat(copies);
            const from = note.length - 3 * paragraph.length + offset;
            parses.length = 0;
            expect(spellcheckWordAtPosition(note, from + 4)).toEqual({ from, to: from + 9, word: 'mispelled' });
            parsedBy[copies] = [...parses];
            expect(spellingWordScope(note, from + 4)).toEqual({
                from: from - offset, to: from - offset + paragraph.length - 1, basis: 'local',
            });
        }
        expect(parsedBy[20000]).toEqual([{ kind: 'full', length: paragraph.length - 1 }]);
        expect(parsedBy[100]).toEqual(parsedBy[20000]);

        // The scan it replaces parses all of it.
        const small = paragraph.repeat(100);
        parses.length = 0;
        spellcheckWordRanges(small);
        expect(parses).toEqual([{ kind: 'full', length: small.length }]);
    });

    test('code before the position costs one block-structure pass over the text before it, never a full parse of the note', () => {
        const section = 'Prose with a mispelled word.\n\n```js\nconst value = compute(input);\n\nreturn value;\n```\n\n';
        const note = section.repeat(3000);
        const offset = section.indexOf('mispelled');

        // Near the top: only the text before the position is looked at.
        const early = 2 * section.length + offset;
        expect(spellingWordAt(note, early)).toEqual({ from: early, to: early + 9, word: 'mispelled' });
        expect(parses).toEqual([
            { kind: 'blocks', length: 2 * section.length + 'Prose with a mispelled word.\n'.length },
            { kind: 'full', length: 'Prose with a mispelled word.\n'.length },
        ]);
        expect(spellingWordScope(note, early)).toMatchObject({ basis: 'blocks', from: 2 * section.length });

        // Near the bottom: the inline parse is still one paragraph.
        parses.length = 0;
        const late = 2990 * section.length + offset;
        expect(spellingWordAt(note, late + 9)).toEqual({ from: late, to: late + 9, word: 'mispelled' });
        expect(parses.filter(parse => parse.kind === 'full')).toEqual([{ kind: 'full', length: 'Prose with a mispelled word.\n'.length }]);
        expect(parses.filter(parse => parse.kind === 'blocks')).toHaveLength(1);

        // Inside a code block there is nothing to check, and the block is not parsed inline beyond itself.
        parses.length = 0;
        const code = 2990 * section.length + section.indexOf('return');
        expect(spellingWordAt(note, code + 2)).toBeNull();
        expect(Math.max(...parses.filter(parse => parse.kind === 'full').map(parse => parse.length))).toBeLessThan(section.length);
    });

    test('only a reference label or a possibly defined acronym is resolved against the whole note', () => {
        const filler = 'Ordinary prose about nothing in particular.\n\n'.repeat(400);
        const labelled = `See [teh] today.\n\n${filler}[teh]: https://example.com`;
        expect(spellingWordAt(labelled, 6)).toEqual({ from: 5, to: 8, word: 'teh', editable: false });
        expect(parses.some(parse => parse.kind === 'full' && parse.length === labelled.length)).toBe(true);

        parses.length = 0;
        const unlabelled = `See [teh] today.\n\n${filler}`;
        expect(spellingWordAt(unlabelled, 6)).toEqual({ from: 5, to: 8, word: 'teh' });
        expect(parses.some(parse => parse.length === unlabelled.length)).toBe(true);

        parses.length = 0;
        const defined = `The API teh.\n\n${filler}An Application Programming Interface (API) appears late.`;
        expect(spellingWordAt(defined, 5)).toBeNull();
        expect(spellingWordAt(defined, 9)).toEqual({ from: 8, to: 11, word: 'teh' });

        parses.length = 0;
        const undefinedAcronym = `The API teh.\n\n${filler}`;
        expect(spellingWordAt(undefinedAcronym, 5)).toEqual({ from: 4, to: 7, word: 'API' });
        expect(parses).toEqual([{ kind: 'full', length: 'The API teh.\n'.length }]);
    });

    test('suggestions for a word in a large note come from its paragraph and one dictionary lookup', async () => {
        const paragraph = 'Ordinary prose about nothing in particular.\n\n';
        const note = `${paragraph.repeat(5000)}A mispelled word here.\n\n${paragraph.repeat(5000)}`;
        const from = note.indexOf('mispelled');
        const checker = { correct: jest.fn(word => !/^mispelled$/i.test(word)), suggest: jest.fn(() => ['misspelled']) };
        const getChecker = jest.fn(async () => checker);

        await expect(spellcheckSuggestionsAtPosition(note, from + 3, 'en-US', getChecker))
            .resolves.toEqual({ from, to: from + 9, word: 'mispelled', suggestions: ['misspelled'] });
        expect(parses).toEqual([{ kind: 'full', length: 'A mispelled word here.\n'.length }]);
        expect(getChecker).toHaveBeenCalledTimes(1);
        // Only the word under the pointer and its candidate replacement reach the dictionary.
        const consulted = new Set([...checker.correct.mock.calls, ...checker.suggest.mock.calls].map(([word]) => word.toLowerCase()));
        expect([...consulted].sort()).toEqual(['mispelled', 'misspelled']);
    });
});

describe('sentence starts read only the previous line', () => {
    /** The implementation before it stopped copying and scanning the text above the line. */
    const blockLead = /^([ \t>]*)((?:(?:#{1,6}|[-+*]|\d{1,9}[.)]|\[[ xX]\])[ \t]+)*)[ \t"'“‘«([*_~`]*$/u;
    const sentenceEnd = /[.!?…|]["'”’)\]*_~`]*[ \t]*$/u;
    function wholePrefixSentenceStart(source, from) {
        const text = String(source || '');
        const lineStart = text.lastIndexOf('\n', from - 1) + 1;
        const prefix = text.slice(lineStart, from);
        const lead = blockLead.exec(prefix);
        if (!lead) return sentenceEnd.test(prefix.replace(/[ \t"'“‘«([*_~`]+$/u, ''));
        if (lead[2] || lineStart === 0) return true;
        const previous = text.slice(0, Math.max(0, lineStart - 1)).replace(/[ \t\r]+$/u, '');
        const line = previous.slice(previous.lastIndexOf('\n') + 1);
        return !line.trim() || /^[ \t>]*#{1,6}[ \t]/u.test(line) || sentenceEnd.test(line);
    }

    test('agrees with the whole-prefix rule at every position of varied notes', () => {
        const notes = [
            fragments.join('\n\n'), fragments.join('\n'), fragments.join(' \t\r\n'), fragments.join('\n   \n'),
            '\nLeading newline. Next\n\n\n# Heading\nAfter heading\nwrapped line\nEnds here.   \nNew Sentence', '', '\n', ' \t\r',
            ...Array.from({ length: 12 }, (_unused, seed) => generatedNote(seed + 200)),
        ];
        let checked = 0;
        for (const note of notes) {
            for (let from = 0; from <= note.length; from++) {
                expect({ from, start: spellingSentenceStart(note, from) }).toEqual({ from, start: wholePrefixSentenceStart(note, from) });
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(10000);
    });
});
