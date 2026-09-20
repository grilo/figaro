import { markdownTextEditMayStayInBlock } from './markdownProjectionModel.js';

/** A local parse is sufficient only inside an existing independent prose block. */
export function writingProjectionEdit(previous, source, entries, context) {
    if (context) return null; // Reference definitions can change inline parsing elsewhere.
    let from = 0;
    while (from < previous.length && from < source.length && previous[from] === source[from]) from++;
    let to = previous.length, nextTo = source.length;
    while (to > from && nextTo > from && previous[to - 1] === source[nextTo - 1]) { to--; nextTo--; }
    const index = entries.findIndex(entry => /^(paragraph|heading)$/.test(entry.type) && from > entry.from && to < entry.to);
    if (index < 0 || !markdownTextEditMayStayInBlock(previous.slice(from, to), source.slice(from, nextTo))) return null;
    const block = entries[index], delta = source.length - previous.length;
    return { index, from: block.from, to: block.to + delta, delta };
}

/** Combine cached block maps at their current UTF-16 source/prose offsets. */
export function combineWritingProjections(entries) {
    const result = { text: '', units: [], regions: [], quotationSpans: [], typography: { text: '', units: [] } };
    for (const entry of entries) {
        const projection = entry.projection, delta = entry.from - entry.origin, start = result.units.length;
        const mapUnit = unit => unit.from < 0 || !delta ? unit : { ...unit, from: unit.from + delta, to: unit.to + delta };
        for (const unit of projection.units) result.units.push(mapUnit(unit));
        for (const unit of projection.typography.units) result.typography.units.push(mapUnit(unit));
        for (const region of projection.regions) result.regions.push({ ...region,
            from: region.from + delta, to: region.to + delta, start: region.start + start, end: region.end + start });
        for (const span of projection.quotationSpans) result.quotationSpans.push({ ...span, from: span.from + start, to: span.to + start });
    }
    result.text = result.units.map(unit => unit.char).join('');
    result.typography.text = result.typography.units.map(unit => unit.char).join('');
    return result;
}
