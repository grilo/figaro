const LARGE_MARKDOWN_DOCUMENT_BYTES = 256 * 1024;

/**
 * Decide whether Markdown presentation should be attached after the source
 * transaction. Keeping this source-only makes the threshold independently
 * testable while the editor adapter owns CodeMirror and frame scheduling.
 */
export function editorDocumentMountPlan({ languageKind = 'plain', contentLength = 0 } = {}) {
    const length = Math.max(0, Number(contentLength) || 0);
    return {
        deferMarkdownPresentation: languageKind === 'markdown'
            && length >= LARGE_MARKDOWN_DOCUMENT_BYTES,
    };
}

/** Split a deferred Markdown mount at a line boundary for two bounded transactions. */
export function editorDocumentMountChunks(content, languageKind = 'plain') {
    const source = String(content ?? '');
    if (!editorDocumentMountPlan({
        languageKind,
        contentLength: source.length,
    }).deferMarkdownPresentation) return [source];
    const midpoint = Math.floor(source.length / 2);
    const lineBreak = source.indexOf('\n', midpoint);
    const split = lineBreak < 0 ? midpoint : lineBreak + 1;
    return [source.slice(0, split), source.slice(split)];
}

export { LARGE_MARKDOWN_DOCUMENT_BYTES };
