/** Infer punctuation conventions from authored prose, never from code or URLs. */
export function writingQuotationSpans(units) {
    const spans = [];
    const word = char => /[\p{L}\p{N}]/u.test(char || '');
    for (let from = 0; from < units.length; from++) {
        const unit = units[from], opening = unit.char;
        if (unit.hidden || unit.escaped || !['"', '“', '\'', '‘'].includes(opening)) continue;
        const single = opening === '\'' || opening === '‘';
        if (single && word(units[from - 1]?.char)) continue;
        for (let end = from + 1; end < units.length; end++) {
            const last = units[end];
            if (last.hidden || last.escaped || !(single ? ['\'', '’'] : ['"', '”']).includes(last.char)) continue;
            if (single && word(units[end + 1]?.char)) continue;
            spans.push({ from, to: end + 1, opening });
            from = end;
            break;
        }
    }
    return spans;
}

function prevalent(values, fallback) {
    if (!values.length) return fallback;
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export function writingTypographyConvention(projection) {
    const spans = projection.quotationSpans || [];
    const style = char => ['“', '‘', '’'].includes(char) ? 'smart' : 'straight';
    const quoteStyle = prevalent(spans.map(span => style(span.opening)), 'straight');
    const first = spans.find(span => style(span.opening) === quoteStyle);
    const singleFirst = first?.opening === '\'' || first?.opening === '‘';
    const apostrophes = [...projection.text.matchAll(/(?<=\p{L})['’](?=\p{L})/gu)]
        .filter(match => !projection.units[match.index].hidden);
    return { quoteStyle, singleFirst,
        apostropheStyle: prevalent(apostrophes.map(match => style(match[0])), quoteStyle) };
}
