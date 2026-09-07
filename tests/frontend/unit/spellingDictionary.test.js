import { createSpellingDictionary } from '../../../frontend/js/usecases/spellingDictionary.js';
import { spellcheckDiagnostics, spellcheckSuggestionsAtPosition } from '../../../frontend/js/spellcheck.js';

test('dictionary additions serialize and only accepted saves update effective words', async () => {
    const onChange = jest.fn(), load = jest.fn(async () => ['figaro']);
    const add = jest.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(['figaro', 'codex']);
    const dictionary = createSpellingDictionary({ load, add, onChange });
    await dictionary.restore();
    const failed = dictionary.add('bad'), succeeded = dictionary.add('codex');
    await expect(failed).rejects.toThrow('Disk full');
    expect(dictionary.words()).toEqual(['figaro']);
    await succeeded;
    expect(load).toHaveBeenCalledTimes(1);
    expect(dictionary.words()).toEqual(['figaro', 'codex']);
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
