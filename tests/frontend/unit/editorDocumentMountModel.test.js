import {
    editorDocumentMountPlan,
    editorDocumentMountChunks,
    LARGE_MARKDOWN_DOCUMENT_BYTES,
    markdownPresentationStagePlan,
} from '../../../frontend/js/core/editorDocumentMountModel.js';

describe('editor document mount policy', () => {
    test('defers presentation only for large Markdown sources', () => {
        expect(editorDocumentMountPlan({
            languageKind: 'markdown',
            contentLength: LARGE_MARKDOWN_DOCUMENT_BYTES,
        }).deferMarkdownPresentation).toBe(true);
        expect(editorDocumentMountPlan({
            languageKind: 'markdown',
            contentLength: LARGE_MARKDOWN_DOCUMENT_BYTES - 1,
        }).deferMarkdownPresentation).toBe(false);
        expect(editorDocumentMountPlan({
            languageKind: 'code',
            contentLength: LARGE_MARKDOWN_DOCUMENT_BYTES * 2,
        }).deferMarkdownPresentation).toBe(false);
    });

    test('splits a large Markdown source at one line boundary without changing it', () => {
        const source = `# Large\n${'content line\n'.repeat(24000)}`;
        const chunks = editorDocumentMountChunks(source, 'markdown');
        expect(chunks).toHaveLength(2);
        expect(chunks[0].endsWith('\n')).toBe(true);
        expect(chunks.join('')).toBe(source);
        expect(editorDocumentMountChunks(source, 'code')).toEqual([source]);
    });

    test('prioritizes only presentation features present in a large document', () => {
        expect(markdownPresentationStagePlan([
            '# Report',
            '```mermaid',
            'flowchart LR; A --> B',
            '```',
            '$x^2$',
        ].join('\n'))).toEqual({
            ready: ['frontmatter', 'diagram', 'math'],
            deferred: ['image', 'table'],
        });
        expect(markdownPresentationStagePlan('# Plain note')).toEqual({
            ready: ['frontmatter'],
            deferred: ['image', 'diagram', 'table', 'math'],
        });
    });
});
