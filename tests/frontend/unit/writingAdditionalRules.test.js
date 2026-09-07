import { additionalWritingObservations, longSentenceWordLimit } from '../../../frontend/js/core/writingAdditionalRules.js';

function projection(text, type = 'paragraph') {
    return { text, units: [...text].map((char, from) => ({ char, from, to: from + 1, safe: true })),
        regions: [{ start: 0, end: text.length, type }], sentences: [{ start: 0, end: text.length }] };
}

test.each([['email', 'e-mail'], ['website', 'web site'], ['online', 'on-line'], ['offline', 'off-line'], ['ebook', 'e-book']])(
    'Consistency offers both authored forms of %s / %s without imposing a preferred style', (left, right) => {
        const data = projection(`Use ${left} and ${right}.`);
        const result = additionalWritingObservations(data);
        expect(result.map(item => [item.actual, item.replacements])).toEqual([[left, [right]], [right, [left]]]);
        expect(result[0].message).toContain(`both “${left}” and “${right}”`);
        expect(additionalWritingObservations(projection(`Use ${left} and ${left}.`))).toEqual([]);
        expect(data.text).toBe(`Use ${left} and ${right}.`);
    });

test('Consistency distinguishes acronym capitalization while ignoring sentence-case word variants and embedded tokens', () => {
    const result = additionalWritingObservations(projection('PDF and pdf. HTML and html. Email and email. myemail e-mail-test.'));
    expect(result.map(item => [item.actual, item.replacements])).toEqual([
        ['PDF', ['pdf']], ['pdf', ['PDF']], ['HTML', ['html']], ['html', ['HTML']],
    ]);
});

test('Grammar & punctuation finds spacing and repeated commas without treating ellipses or expressive punctuation as errors', () => {
    const result = additionalWritingObservations(projection('Hello , team! Wait... Really?! Yes,, please.'));
    expect(result.map(item => [item.actual, item.replacements])).toEqual([['Hello ,', ['Hello,']], [',,', [',']]]);
    expect(additionalWritingObservations(projection('Good, clear prose; we agree: yes!'))).toEqual([]);
});

test('new local checks ignore hidden prose and cannot combine terms across excluded content', () => {
    const data = projection('email e-mail. Hello , team.');
    for (let i = 6; i < data.units.length; i++) data.units[i].hidden = true;
    expect(additionalWritingObservations(data)).toEqual([]);
});

test('Readability advises above 30 words and never offers an automatic rewrite or scores short sentences', () => {
    const words = Array.from({ length: longSentenceWordLimit }, (_, i) => i % 2 ? 'ideas' : 'clear');
    const source = words.join(' ') + '.';
    const result = additionalWritingObservations(projection(source));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ rule: 'figaro-long-sentence', actual: source, replacements: [], native: { wordCount: 31, threshold: 31 } });
    expect(result[0].message).toContain('where the idea changes');
    expect(additionalWritingObservations(projection(words.slice(1).join(' ') + '.'))).toEqual([]);
    for (const type of ['heading', 'tableCell']) expect(additionalWritingObservations(projection(source, type))).toEqual([]);
});

test('Readability never crosses paragraph boundaries or excluded spans', () => {
    const text = Array.from({ length: 36 }, (_, i) => i % 2 ? 'ideas' : 'clear').join(' ');
    const data = projection(text);
    data.regions[0].end = text.indexOf(' ', 80);
    expect(additionalWritingObservations(data)).toEqual([]);
    const hidden = projection(text); hidden.units[3].hidden = true;
    expect(additionalWritingObservations(hidden)).toEqual([]);
});
