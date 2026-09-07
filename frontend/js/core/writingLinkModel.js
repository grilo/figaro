/** Map a rendered label to its exact source, never to a destination or title. */
export function writingLinkLabel(source, label, from) {
    const wiki = /^\[\[([^|\]]+)\|([^\]]+)\]\]$/u.exec(source);
    const ordinary = wiki ? null : /^\[([^\]]+)\](?:\(|\[|$)/u.exec(source);
    const text = wiki?.[2] ?? ordinary?.[1];
    if (!text || !label) return null;
    // Reference widgets trim label padding; ordinary/wiki widgets retain it.
    const padding = text === label ? 0 : ordinary && !ordinary[0].endsWith('(') && text.trim() === label ? text.indexOf(label) : -1;
    if (padding < 0) return null;
    const start = from + (wiki ? wiki[1].length + 3 : 1) + padding;
    return { from: start, to: start + label.length };
}

/** Disjoint paint segments let overlapping findings share the existing popup. */
export function writingLinkSegments(label, range, findings) {
    const matches = findings.filter(item => {
        const from = Math.max(item.from, range.from), to = Math.min(item.to, range.to);
        return from < to && label.slice(from - range.from, to - range.from)
            === (item.sourceText ?? item.actual).slice(from - item.from, to - item.from);
    });
    const edges = [...new Set([range.from, range.to, ...matches.flatMap(item => [Math.max(item.from, range.from), Math.min(item.to, range.to)])])].sort((a, b) => a - b);
    return { findings: matches, segments: edges.slice(0, -1).map((from, i) => ({
        text: label.slice(from - range.from, edges[i + 1] - range.from),
        marked: matches.some(item => item.from <= from && item.to >= edges[i + 1]),
    })) };
}
