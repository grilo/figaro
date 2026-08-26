const inlineFormats = Object.freeze({
    bold: Object.freeze({ marker: '**' }),
    italic: Object.freeze({ marker: '*' }),
    strikethrough: Object.freeze({ marker: '~~' }),
});

function normalizedRange(source, from, to) {
    const length = source.length;
    const start = Math.max(0, Math.min(length, Number(from) || 0));
    const end = Math.max(start, Math.min(length, Number(to) || start));
    return { from: start, to: end };
}

function wrapPlan(source, range, open, close = open) {
    const selected = source.slice(range.from, range.to);
    const insertion = `${open}${selected}${close}`;
    return {
        from: range.from,
        to: range.to,
        insert: insertion,
        anchor: range.from + open.length,
        head: range.from + open.length + selected.length,
    };
}

function markerTogglePlan(source, range, marker) {
    const selected = source.slice(range.from, range.to);
    const markerLength = marker.length;

    if (selected.length >= markerLength * 2
        && selected.startsWith(marker)
        && selected.endsWith(marker)) {
        const unwrapped = selected.slice(markerLength, -markerLength);
        return {
            from: range.from,
            to: range.to,
            insert: unwrapped,
            anchor: range.from,
            head: range.from + unwrapped.length,
        };
    }

    if (range.from >= markerLength
        && source.slice(range.from - markerLength, range.from) === marker
        && source.slice(range.to, range.to + markerLength) === marker) {
        return {
            from: range.from - markerLength,
            to: range.to + markerLength,
            insert: selected,
            anchor: range.from - markerLength,
            head: range.from - markerLength + selected.length,
        };
    }

    return wrapPlan(source, range, marker);
}

function longestBacktickRun(value) {
    return Math.max(0, ...Array.from(String(value).matchAll(/`+/g), match => match[0].length));
}

function inlineCodePlan(source, range) {
    const selected = source.slice(range.from, range.to);
    const outsideMatch = source.slice(0, range.from).match(/(`+)$/);
    const outsideMarker = outsideMatch?.[1] || '';
    if (outsideMarker
        && source.slice(range.to, range.to + outsideMarker.length) === outsideMarker) {
        return {
            from: range.from - outsideMarker.length,
            to: range.to + outsideMarker.length,
            insert: selected,
            anchor: range.from - outsideMarker.length,
            head: range.from - outsideMarker.length + selected.length,
        };
    }

    const selectedMatch = selected.match(/^(`+)([\s\S]*)\1$/);
    if (selectedMatch) {
        const unwrapped = selectedMatch[2];
        return {
            from: range.from,
            to: range.to,
            insert: unwrapped,
            anchor: range.from,
            head: range.from + unwrapped.length,
        };
    }

    const marker = '`'.repeat(longestBacktickRun(selected) + 1);
    const pad = selected && (/^`|`$/.test(selected) || /^\s|\s$/.test(selected)) ? ' ' : '';
    return wrapPlan(source, range, `${marker}${pad}`, `${pad}${marker}`);
}

function linkPlan(source, range) {
    const selected = source.slice(range.from, range.to);
    const selectedLink = selected.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
    if (selectedLink) {
        const label = selectedLink[1];
        return {
            from: range.from,
            to: range.to,
            insert: label,
            anchor: range.from,
            head: range.from + label.length,
        };
    }

    const insert = `[${selected}]()`;
    const destination = range.from + selected.length + 3;
    return {
        from: range.from,
        to: range.to,
        insert,
        anchor: selected ? destination : range.from + 1,
        head: selected ? destination : range.from + 1,
    };
}

/** Plan one portable Markdown inline-format toggle without editor or DOM I/O. */
export function markdownInlineFormatPlan({ source = '', from = 0, to = from, format } = {}) {
    const text = String(source ?? '');
    const range = normalizedRange(text, from, to);
    if (format === 'link') return linkPlan(text, range);
    if (format === 'code') return inlineCodePlan(text, range);
    const definition = inlineFormats[format];
    return definition ? markerTogglePlan(text, range, definition.marker) : null;
}
