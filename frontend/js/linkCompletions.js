/** Build the exact syntax inserted when a note is chosen from autocomplete. */
function encodeMarkdownPathSegment(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, character =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function noteLinkCompletion(style, note) {
    const label = String(note?.name || '').replace(/\.md$/i, '');
    const path = String(note?.path || '').replaceAll('\\', '/');
    if (style === 'wikilink' && !/[|\]\r\n]/.test(path) && !/[|\]\r\n]/.test(label)) {
        return `[[${path}|${label}]] `;
    }
    const markdownLabel = label.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
    const markdownPath = path.split('/').map(encodeMarkdownPathSegment).join('/');
    return `[${markdownLabel}](${markdownPath}) `;
}

/** Match either "[Wel" or "[[Wel" while leaving image syntax alone. */
export function noteLinkCompletionMatch(textBeforeCursor) {
    const text = String(textBeforeCursor || '');
    const match = text.match(/\[\[?([^[]*)$/);
    if (!match || match[1].includes(']') || text[match.index - 1] === '!') return null;
    return { fromOffset: match.index, prefix: match[1] };
}
