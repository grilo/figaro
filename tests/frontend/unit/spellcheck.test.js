import {
    resolveSpellcheckConfiguration,
    spellcheckDiagnostics,
    spellcheckSuggestionsAtPosition,
    spellcheckWordAtPosition,
    spellcheckWordRanges,
} from '../frontend/js/spellcheck.js';

describe('offline Markdown spellcheck', () => {
    test('reference identifiers, definitions and nested indented code never become spelling targets', async () => {
        const source = '\uFEFF---\r\ntitle: teh\r\n...\r\n\r\n😀 [teh label][teh]\r\n\r\n[teh]: https://example.com "teh title"\r\n\r\n    const teh = true;\r\n\r\n- item\r\n\r\n      const teh = true;\r\n\r\n>     const teh = true;\r\n\r\n`teh` and [teh](teh.md)';
        const words = spellcheckWordRanges(source);
        expect(words.filter(word => word.word === 'teh').map(word => word.from)).toEqual([source.indexOf('[teh label]') + 1, source.lastIndexOf('[teh]') + 1]);
        expect(words.map(word => word.word)).not.toEqual(expect.arrayContaining(['title', 'const']));
        for (const word of words) expect(source.slice(word.from, word.to)).toBe(word.word);
        const checker = jest.fn();
        for (const pos of [source.indexOf('[teh]:') + 1, source.indexOf('][teh]') + 2, source.indexOf('const teh') + 7]) {
            expect(spellcheckWordAtPosition(source, pos)).toBeNull();
            await expect(spellcheckSuggestionsAtPosition(source, pos, 'en-US', checker)).resolves.toBeNull();
        }
        expect(checker).not.toHaveBeenCalled();
        expect(spellcheckWordRanges('---\ntitle: teh')).toEqual([]);
        // Four spaces continuing a paragraph are prose, not an indented code block.
        expect(spellcheckWordRanges('A paragraph\n    teh continuation').map(word => word.word)).toContain('teh');
    });

    test('collapsed and shortcut reference labels are advisory while explicit and ordinary bracketed labels remain editable', async () => {
        const source = '[teh][] [TEH] [teh][id] [typo]\n\n[teh]: destination\n[id]: destination';
        const words = spellcheckWordRanges(source);
        expect(words).toEqual([
            { from: 1, to: 4, word: 'teh', editable: false },
            { from: 15, to: 18, word: 'teh' },
            { from: 25, to: 29, word: 'typo' },
        ]);
        const checker = async () => ({ correct: word => word === 'the', suggest: () => [] });
        await expect(spellcheckSuggestionsAtPosition(source, 2, 'en-US', checker)).resolves.toMatchObject({ suggestions: [] });
        await expect(spellcheckSuggestionsAtPosition(source, 16, 'en-US', checker)).resolves.toMatchObject({ suggestions: ['the'] });
        expect(spellcheckWordRanges('[Teh]\n\n[teh]: x')[0]).toMatchObject({ word: 'Teh', editable: false });
        expect(spellcheckWordRanges('![teh][] ![teh] ![teh][id]\n\n[teh]: x\n[id]: x').map(word => word.editable !== false)).toEqual([false, false, true]);
    });

    test('uses the lens language and ignores retired frontmatter opt-outs and language overrides', () => {
        for (const legacy of ['false', '[en_GB, es]', 'es', 'unsupported']) {
            expect(resolveSpellcheckConfiguration(`---\nspellcheck: ${legacy}\n---\nteh`, 'en-US'))
                .toEqual({ enabled: true, languages: ['en-US'], overridden: false });
        }
        expect(resolveSpellcheckConfiguration('teh', 'none')).toEqual({ enabled: false, languages: [], overridden: false });
        expect(resolveSpellcheckConfiguration('qeu', 'es').languages).toEqual(['es']);
    });

    test('checks prose but excludes frontmatter, code, URLs, email, and link destinations', async () => {
        const source = [
            '---',
            'spellcheck: en-GB',
            'title: Teh metadata stays untouched',
            '---',
            'Teh colour is [correct link text](https://misspeled.example/teh).',
            '`misspeledCode` and support@example.com stay untouched.',
            '```js',
            'const misspeledFence = true;',
            '```',
            'API remains an acronym.',
        ].join('\n');
        const knownWords = new Set(['colour', 'is', 'correct', 'link', 'text', 'and', 'stay', 'untouched', 'remains', 'an', 'acronym']);
        const getChecker = jest.fn(async language => ({
            correct: word => language === 'en-US' && knownWords.has(word.toLowerCase()),
        }));

        const diagnostics = await spellcheckDiagnostics(source, 'en-US', getChecker);
        expect(getChecker).toHaveBeenCalledWith('en-US');
        expect(diagnostics.map(diagnostic => source.slice(diagnostic.from, diagnostic.to))).toEqual(['Teh']);
        expect(diagnostics[0]).toMatchObject({
            severity: 'info',
            source: 'Figaro spellcheck',
            markClass: 'cm-spellcheck-range',
        });
        expect(spellcheckWordRanges(source).map(range => range.word)).not.toEqual(expect.arrayContaining([
            'metadata', 'misspeled', 'misspeledCode', 'misspeledFence', 'API',
        ]));
    });

    test('does not flag a correctly spelled hyphenated compound as a spellcheck error', async () => {
        const source = 'A faster-than-usual pace is well-writen.';
        const dictionary = new Set(['a', 'faster', 'than', 'usual', 'pace', 'is', 'well', 'written']);
        const getChecker = jest.fn(async () => ({
            correct: word => dictionary.has(word.toLowerCase()),
            spell: word => ({
                correct: dictionary.has(word.toLowerCase()),
                forbidden: false,
                warn: false,
            }),
            suggest: () => ['well-written'],
        }));

        const diagnostics = await spellcheckDiagnostics(source, 'en-US', getChecker);
        expect(diagnostics.map(diagnostic => source.slice(diagnostic.from, diagnostic.to))).toEqual(['well-writen']);
        await expect(spellcheckSuggestionsAtPosition(source, source.indexOf('faster-than-usual') + 3, 'en-US', getChecker))
            .resolves.toBeNull();
    });

    test('returns local suggestions only for the misspelled prose word under the context-menu position', async () => {
        const source = 'Teh colour is in [a link](https://misspeled.example/teh).';
        const dictionary = new Set(['the', 'tech', 'is', 'color']);
        const getChecker = jest.fn(async language => ({
            correct: word => language === 'en-US' && dictionary.has(word.toLowerCase()),
            spell: word => ({
                correct: language === 'en-US' && dictionary.has(word.toLowerCase()),
                forbidden: false,
                warn: false,
            }),
            suggest: word => word.toLowerCase() === 'teh'
                ? ['the', 'tech', 'the']
                : ['color'],
        }));
        const tehPosition = source.indexOf('Teh') + 1;
        const linkPosition = source.indexOf('misspeled');

        expect(spellcheckWordAtPosition(source, tehPosition)).toMatchObject({ word: 'Teh' });
        await expect(spellcheckSuggestionsAtPosition(source, tehPosition, 'en-US', getChecker)).resolves.toEqual({
            from: 0,
            to: 3,
            word: 'Teh',
            suggestions: ['The'],
        });
        await expect(spellcheckSuggestionsAtPosition(source, linkPosition, 'en-US', getChecker)).resolves.toBeNull();
        expect(getChecker).toHaveBeenCalledWith('en-US');
    });

    test('keeps only valid high-confidence prose corrections and suppresses ambiguous short words', async () => {
        const source = 'ete speling';
        const dictionary = new Set(['ere', 'ewe', 'eke', 'ate', 'spelling', 'spieling']);
        const getChecker = jest.fn(async () => ({
            correct: word => dictionary.has(word.toLowerCase()),
            spell: word => ({
                correct: dictionary.has(word.toLowerCase()),
                forbidden: false,
                warn: false,
            }),
            suggest: word => word === 'ete'
                ? ['ere', 'ewe', 'eke', 'ate']
                : ['spewing', 'spieling', 'not-a-word', 'spelling'],
        }));

        await expect(spellcheckSuggestionsAtPosition(source, 1, 'en-US', getChecker)).resolves.toMatchObject({
            word: 'ete',
            suggestions: [],
        });
        await expect(spellcheckSuggestionsAtPosition(source, source.indexOf('speling') + 2, 'en-US', getChecker)).resolves.toMatchObject({
            word: 'speling',
            suggestions: ['spelling', 'spieling'],
        });
    });
});
