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

export { LARGE_MARKDOWN_DOCUMENT_BYTES };
