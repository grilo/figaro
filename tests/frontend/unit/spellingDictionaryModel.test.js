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
