import { personalDictionaryList, vaultSpellingWords } from '../../../frontend/js/core/spellingDictionaryModel.js';
import { acceptedSpelling, filterAcceptedSpelling } from '../../../frontend/js/core/spellingDictionaryModel.js';

test.each(['en-US', 'en-GB'])('%s personal words accept regular noun plurals and singular/plural possessives', language => {
    const accepts = acceptedSpelling(['figaroword', 'glinterbox', 'glinterberry', 'glinterday', 'glinter-bush'], language);
    for (const word of ['figaroword', 'figarowords', "figaroword's", "figarowords'", 'Figaroword’s', 'FIGAROWORDS’',
        'glinterboxes', "glinterboxes'", 'glinterberries', 'glinterberries’', 'glinterdays', 'glinter-bushes']) {
        expect([word, accepts(word)]).toEqual([word, true]);
    }
    for (const word of ['figarwords', "figarword's", 'figarwords’', 'figaroworded', 'figarowording', 'figaroworder',
        'figarowordest', 'figarowordly', 'unfigaroword', 'figarowordses', "figarowords's", "figaroword's'",
        'glinterboxs', 'glinterberrys', 'glinterdaies', 'unrelated']) {
        expect([word, accepts(word)]).toEqual([word, false]);
    }
});

test('personal words ending in s allow either singular possessive style and the regular plural possessive', () => {
    const accepts = acceptedSpelling(['glinterglass'], 'en-US');
    expect(['glinterglasses', "glinterglass's", 'glinterglass’', "glinterglasses'"].every(accepts)).toBe(true);
});

test.each(['es', 'none', undefined])('%s keeps exact personal-word acceptance without English endings', language => {
    const accepts = acceptedSpelling(['Figaroword', 'D’Glinter'], language);
    expect(accepts('figaroword')).toBe(true);
    expect(accepts("d'glinter")).toBe(true);
    expect(['figarowords', "figaroword's", "figarowords'"].some(accepts)).toBe(false);
});

test('accepting a singular possessive also accepts its base and regular plural family', () => {
    const accepts = acceptedSpelling(["glinter's", "glint're"], 'en-US');
    expect(accepts('Glinter’s')).toBe(true);
    expect(accepts('glint’re')).toBe(true);
    expect(['glinter', 'glinters', 'glinters’'].every(accepts)).toBe(true);
    expect(["glinter'ss", "glint'res"].some(accepts)).toBe(false);
});

test('accepting a terminal possessive also accepts its unpossessed spelling without guessing a singular', () => {
    const accepts = acceptedSpelling(['glinters’', "James'"], 'en-US');
    expect(['glinters', "glinters'", 'James'].every(accepts)).toBe(true);
    expect(['glinter', 'jame', 'glinterses'].some(accepts)).toBe(false);
});

test('personal words compare canonical Unicode accents without changing the supplied spelling', () => {
    const saved = Object.freeze(['cafe\u0301']);
    const accepts = acceptedSpelling(saved, 'es');
    expect(accepts('CAFÉ')).toBe(true);
    expect(accepts('cafe\u0301')).toBe(true);
    expect(accepts('cafe')).toBe(false);
    expect(saved[0]).toBe('cafe\u0301');
});

test('personal acceptance stays isolated across dictionaries and does not mutate saved words or observations', () => {
    const words = Object.freeze(['figaroword']);
    const other = acceptedSpelling(['glinter'], 'en-US');
    const values = Object.freeze([Object.freeze({ actual: 'figarowords' }), Object.freeze({ word: "figaroword's" }), Object.freeze({ actual: 'teh' })]);
    expect(filterAcceptedSpelling(values, words, 'en-US')).toEqual([values[2]]);
    expect(filterAcceptedSpelling(values, [], 'en-US')).toEqual(values);
    expect(other('figarowords')).toBe(false);
    expect(acceptedSpelling(words, 'en-US')('glinters')).toBe(false);
});


test('dictionary list filters normalized stored entries and bounds alphabetical results', () => {
    expect(personalDictionaryList(['zebra', 'café', "author's"], 'CAFE\u0301')).toEqual({ count: 3, matching: 1, visible: ['café'], more: false });
    expect(personalDictionaryList(['zebra', 'alpha', 'beta'], '', 2)).toEqual({ count: 3, matching: 3, visible: ['alpha', 'beta'], more: true });
    expect(personalDictionaryList(["author's"], 'author’s').visible).toEqual(["author's"]);
    expect(personalDictionaryList([], '')).toEqual({ count: 0, matching: 0, visible: [], more: false });
});

test('vault spelling words come from Markdown note titles and tags, skipping dates, short words and reviewed typos', () => {
    const tree = [
        { type: 'file', name: 'Postgres setup.md' },
        { type: 'file', name: '2024-05-01.md' },
        { type: 'file', name: 'Diagramsnet.drawio' },
        { type: 'directory', name: 'Hiddenfolder', children: [
            { type: 'file', name: 'Q3 roadmap_v2.markdown' },
            { type: 'file', name: 'Zettel-Kasten ideas.md' },
            { type: 'file', name: 'Recieve payments.md' },
            { type: 'file', name: 'Joe’s AI plan.md' },
        ] },
    ];
    const words = vaultSpellingWords({ tree, tags: ['proj-alpha', 'wip', 'x2', 'ok', '2024'] });
    expect(words).toEqual(['alpha', 'ideas', 'joe\'s', 'kasten', 'payments', 'plan', 'postgres', 'proj', 'proj-alpha',
        'roadmap', 'setup', 'wip', 'zettel', 'zettel-kasten']);
    // Folder names, other file types, dates, versions and two-letter words are not vocabulary.
    for (const word of ['hiddenfolder', 'diagramsnet', 'recieve', 'ai', 'ok', 'q']) expect(words).not.toContain(word);
    expect(vaultSpellingWords({ tree, tags: [] }, 3)).toHaveLength(3);
    expect(vaultSpellingWords()).toEqual([]);
});

test('accepted spelling reuses its checker only for identical words and language', () => {
    const first = acceptedSpelling(['postgres'], 'en-US');
    expect(acceptedSpelling(['postgres'], 'en-US')).toBe(first);
    expect(first('Postgres')).toBe(true);
    const changed = acceptedSpelling(['kubectl'], 'en-US');
    expect(changed('postgres')).toBe(false);
    expect(changed('kubectl')).toBe(true);
    expect(acceptedSpelling(['kubectl'], 'es')('kubectls')).toBe(false);
});
