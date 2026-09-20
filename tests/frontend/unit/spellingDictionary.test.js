import { createSpellingDictionary } from '../../../frontend/js/usecases/spellingDictionary.js';
import { spellcheckDiagnostics, spellcheckSuggestionsAtPosition } from '../../../frontend/js/spellcheck.js';
import { acceptedSpelling } from '../../../frontend/js/core/spellingDictionaryModel.js';

test('dictionary additions serialize and only accepted saves update effective words', async () => {
    const onChange = jest.fn(), load = jest.fn(async () => ['figaro']);
    const add = jest.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(['figaro', 'codex']);
    const dictionary = createSpellingDictionary({ load, add, onChange });
    await dictionary.restore();
    const failed = dictionary.add('bad'), succeeded = dictionary.add('codex');
    await expect(failed).rejects.toThrow('Disk full');
    expect(dictionary.words()).toEqual(['figaro']);
    expect(acceptedSpelling(dictionary.words(), 'en-US')('bads')).toBe(false);
    await succeeded;
    expect(load).toHaveBeenCalledTimes(1);
    expect(dictionary.words()).toEqual(['figaro', 'codex']);
    expect(acceptedSpelling(dictionary.words(), 'en-US')('codexes')).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);
});

test('dictionary load failure can be retried without replacing unread words', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(['figaro']);
    const add = jest.fn(async () => ['figaro', 'codex']);
    const dictionary = createSpellingDictionary({ load, add });
    await expect(dictionary.restore()).rejects.toThrow();
    await dictionary.add('codex');
    expect(load).toHaveBeenCalledTimes(2);
    expect(dictionary.words()).toEqual(['figaro', 'codex']);
});

test('accepted words are shared by standalone spelling underlines and context-menu replacements', async () => {
    const checker = async () => ({ correct: () => false, suggest: () => [] });
    const diagnostics = await spellcheckDiagnostics('Figaro teh', 'en-US', checker, ['figaro']);
    expect(diagnostics.map(value => value.from)).toEqual([7]);
    expect(await spellcheckSuggestionsAtPosition('Figaro teh', 3, 'en-US', checker, ['figaro'])).toBeNull();
});

test.each(['en-US', 'en-GB'])('restored personal plurals and possessives disappear from %s underlines and context menus', async language => {
    const dictionary = createSpellingDictionary({ load: async () => ['figaroword'], add: jest.fn() });
    await dictionary.restore();
    const checker = async () => ({ correct: () => false, suggest: () => [] });
    const source = "figarowords figaroword’s figarowords' figarwords";
    const diagnostics = await spellcheckDiagnostics(source, language, checker, dictionary.words());
    expect(diagnostics.map(value => source.slice(value.from, value.to))).toEqual(['figarwords']);
    for (const word of ['figarowords', 'figaroword’s', "figarowords'"]) {
        expect(await spellcheckSuggestionsAtPosition(source, source.indexOf(word) + 1, language, checker, dictionary.words())).toBeNull();
    }
    expect(await spellcheckSuggestionsAtPosition(source, source.indexOf('figarwords') + 1, language, checker, dictionary.words()))
        .toMatchObject({ word: 'figarwords' });
    expect(await spellcheckSuggestionsAtPosition(source, 1, 'es', checker, dictionary.words())).toMatchObject({ word: 'figarowords' });
});

test('adding the possessive first suppresses its base only after a successful save', async () => {
    let finish;
    const dictionary = createSpellingDictionary({ load: async () => [], add: () => new Promise(resolve => { finish = resolve; }) });
    await dictionary.restore();
    const saving = dictionary.add('glinter’s');
    await Promise.resolve(); await Promise.resolve();
    expect(acceptedSpelling(dictionary.words(), 'en-US')('glinter')).toBe(false);
    finish(["glinter's"]); await saving;
    const source = 'glinter glinters glinter’s glinters’';
    const checker = async () => ({ correct: () => false, suggest: () => [] });
    expect(await spellcheckDiagnostics(source, 'en-US', checker, dictionary.words())).toEqual([]);
    expect(await spellcheckSuggestionsAtPosition(source, 2, 'en-US', checker, dictionary.words())).toBeNull();
});
