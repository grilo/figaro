import {
    resolveSpellcheckConfiguration,
    spellcheckDiagnostics,
    spellcheckSuggestionsAtPosition,
    spellcheckWordAtPosition,
    spellcheckWordRanges,
} from '../frontend/js/spellcheck.js';

describe('offline Markdown spellcheck', () => {
    test('uses the global default, honours frontmatter overrides, and allows a note to opt out', () => {
        expect(resolveSpellcheckConfiguration('# Note', 'en-GB')).toEqual({
            enabled: true,
            languages: ['en-GB'],
            overridden: false,
        });
        expect(resolveSpellcheckConfiguration('---\nspellcheck: [en_GB, es]\n---\n# Note')).toEqual({
            enabled: true,
            languages: ['en-GB', 'es'],
            overridden: true,
        });
        expect(resolveSpellcheckConfiguration('---\nspellcheck: false\n---\n# Note')).toEqual({
            enabled: false,
            languages: [],
            overridden: true,
        });
        expect(resolveSpellcheckConfiguration('---\nspellcheck: unsupported\n---\n# Note', 'es')).toEqual({
            enabled: true,
            languages: ['es'],
            overridden: false,
        });
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
            correct: word => language === 'en-GB' && knownWords.has(word.toLowerCase()),
        }));

        const diagnostics = await spellcheckDiagnostics(source, 'en-US', getChecker);
        expect(getChecker).toHaveBeenCalledWith('en-GB');
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
