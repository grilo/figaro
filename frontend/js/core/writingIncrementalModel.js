/** The projection separates prose blocks with blank lines. Keep separators in
 * each chunk so package tokenizers see the same paragraph endings as a full scan.
 */
export function writingParagraphChunks(text) {
    const chunks = [];
    let from = 0, line = 1;
    for (const match of text.matchAll(/\n[\t ]*\n(?:[\t ]*\n)*/g)) {
        const to = match.index + match[0].length;
        const value = text.slice(from, to);
        chunks.push({ text: value, from, line });
        line += value.split('\n').length - 1;
        from = to;
    }
    if (from < text.length) chunks.push({ text: text.slice(from), from, line });
    return chunks;
}

export function offsetWritingPlace(place, chunk) {
    if (!place) return place;
    const point = value => value && ({ ...value, offset: value.offset + chunk.from, line: value.line + chunk.line - 1 });
    return place.start ? { start: point(place.start), end: point(place.end) } : point(place);
}

export function offsetTextlintMessage(message, chunk) {
    const range = value => value?.map(offset => offset + chunk.from);
    return { ...message, index: message.index + chunk.from, line: message.line + chunk.line - 1,
        ...(message.range ? { range: range(message.range) } : {}),
        ...(message.loc ? { loc: { start: { ...message.loc.start, line: message.loc.start.line + chunk.line - 1 }, end: { ...message.loc.end, line: message.loc.end.line + chunk.line - 1 } } } : {}),
        ...(message.fix ? { fix: { ...message.fix, range: range(message.fix.range) } } : {}),
    };
}

export function localTextlintMessages(messages, chunk) {
    return messages.filter(message => message.index >= chunk.from && message.index < chunk.from + chunk.text.length)
        .map(message => offsetTextlintMessage(message, { from: -chunk.from, line: 2 - chunk.line }));
}
