import { markdownProseEditPreservesBlocks, mapMarkdownBlockDescriptors, markdownTextEditMayStayInBlock, replaceMarkdownBlockRegions } from '../../../frontend/js/core/markdownProjectionModel.js';

test('changed-text policy accepts Unicode prose and rejects Markdown delimiters and newlines', () => {
    for (const text of ['', 'more prose', 'Café’s', '“Yes,”', '...']) {
        expect(markdownProseEditPreservesBlocks(text, '')).toBe(true);
        expect(markdownProseEditPreservesBlocks('', text)).toBe(true);
    }
    for (const text of ['#', '\n', '|', '[', ']', '!', '*', '$', '<', '>', '`', '_', '\\']) {
        expect(markdownProseEditPreservesBlocks('', text)).toBe(false);
        expect(markdownProseEditPreservesBlocks(text, '')).toBe(false);
    }
});

test('mapping retains source payloads, stable ownership and unmoved descriptors', () => {
    const blocks = [{ from: 0, to: 2, source: 'first' },
        { from: 10, to: 20, codeFrom: 13, lineStarts: [13, 17], source: 'cached code' }];
    expect(mapMarkdownBlockDescriptors(blocks, position => position)).toBe(blocks);
    const mapped = mapMarkdownBlockDescriptors(blocks, position => position >= 5 ? position + 3 : position);
    expect(mapped[0]).toBe(blocks[0]);
    expect(mapped[1]).toMatchObject({ from: 13, to: 23, codeFrom: 16, lineStarts: [16, 20], source: 'cached code', sourceIdentity: blocks[1] });
    expect(blocks[1]).toEqual({ from: 10, to: 20, codeFrom: 13, lineStarts: [13, 17], source: 'cached code' });
    expect(mapMarkdownBlockDescriptors(mapped, position => position + 1)[1].sourceIdentity).toBe(blocks[1]);
});

test('local block policy permits soft line changes and replaces only intersecting payloads', () => {
    expect(markdownTextEditMayStayInBlock('', '\n')).toBe(true);
    expect(markdownTextEditMayStayInBlock('\r\n', 'Café')).toBe(true);
    expect(markdownTextEditMayStayInBlock('', '#')).toBe(false);
    const blocks = [{ from: 0, to: 5 }, { from: 10, to: 15, source: 'old' }, { from: 20, to: 25 }];
    const replacement = { from: 10, to: 18, source: 'new' };
    const result = replaceMarkdownBlockRegions(blocks, [{ from: 8, to: 17 }], [replacement], pos => pos > 15 ? pos + 3 : pos);
    expect(result.removed).toEqual([blocks[1]]);
    expect(result.blocks[0]).toBe(blocks[0]);
    expect(result.blocks[1]).toBe(replacement);
    expect(result.blocks[2]).toMatchObject({ from: 23, to: 28, sourceIdentity: blocks[2] });
});
