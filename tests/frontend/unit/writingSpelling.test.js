import { writingSpellingObservations, spellcheckSuggestionsAtPosition } from '../../../frontend/js/spellcheck.js';
import fs from 'node:fs';
import nspell from '../../../frontend/vendored/spellcheck/nspell.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';
import { createWritingResultsView } from '../../../frontend/js/views/writingResultsView.js';
import { spellingPossessive } from '../../../frontend/js/core/spellingModel.js';

const dictionary = language => nspell({
    aff: fs.readFileSync(`frontend/vendored/spellcheck/${language}.aff`, 'utf8'),
    dic: fs.readFileSync(`frontend/vendored/spellcheck/${language}.dic`, 'utf8'),
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
