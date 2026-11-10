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

/**
 * Order live-Markdown features so presentation needed by the current source
 * becomes ready before dormant authoring features are attached. Dormant
 * fields still load immediately afterward, so newly typed syntax activates
 * without another feature-code load.
 */
export function markdownPresentationStagePlan(content) {
    const source = String(content ?? '');
    const detected = {
        image: source.includes('!['),
        diagram: /(?:^|\n)[ \t]{0,3}(?:`{3,}|~{3,})[^\n]*(?:mermaid|vega(?:-lite)?)/iu.test(source),
        table: source.includes('|'),
        math: source.includes('$'),
    };
    const order = ['image', 'frontmatter', 'diagram', 'table', 'math'];
    const ready = order.filter(feature => feature === 'frontmatter' || detected[feature]);
    return {
        ready,
        deferred: order.filter(feature => !ready.includes(feature)),
    };
}

/**
 * Whether a transaction may change the mounted text. `replacement` marks the
 * adapter's own source installs: a mount, the tail of a staged mount, or a
 * revision preview. They are the only changes accepted while the editor is
 * read-only or still holds just the leading chunk of a staged mount, so a
 * widget that dispatches directly cannot edit either state.
 */
export function documentChangeAllowed({
    docChanged = false,
    replacement = false,
    readOnly = false,
    halfMounted = false,
} = {}) {
    if (!docChanged || replacement) return true;
    return !readOnly && !halfMounted;
}

export { LARGE_MARKDOWN_DOCUMENT_BYTES };
