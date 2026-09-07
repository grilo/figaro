import { writingQuotationSpans, writingTypographyConvention } from '../../../frontend/js/core/writingTypographyModel.js';
const units = text => [...text].map((char, from) => ({ char, from, to: from + 1, safe: true }));

test('quotation boundaries distinguish balanced quotes from contractions, escaped quotes, and technical tokens', () => {
    const text = `Don't change 'quoted words' or “nested 'words' here”. An unmatched " stays prose.`;
    const spans = writingQuotationSpans(units(text));
    expect(spans.map(span => text.slice(span.from, span.to))).toEqual(["'quoted words'", "“nested 'words' here”"]);
    const escaped = units('"words"'); escaped[0].escaped = true;
    expect(writingQuotationSpans(escaped)).toEqual([]);
    expect(writingQuotationSpans(units('"words"').map(unit => ({ ...unit, hidden: true })))).toEqual([]);
});

test('quote and apostrophe conventions follow prevalence and first occurrence on ties independently', () => {
    const projection = text => ({ text, units: units(text), quotationSpans: writingQuotationSpans(units(text)) });
    expect(writingTypographyConvention(projection('"one" and “two”'))).toMatchObject({ quoteStyle: 'straight', singleFirst: false });
    expect(writingTypographyConvention(projection('“one” and "two" and “three”'))).toMatchObject({ quoteStyle: 'smart' });
    expect(writingTypographyConvention(projection('‘one’ and “two”'))).toMatchObject({ singleFirst: true });
    expect(writingTypographyConvention(projection("don't don’t don’t"))).toMatchObject({ quoteStyle: 'straight', apostropheStyle: 'smart' });
});
