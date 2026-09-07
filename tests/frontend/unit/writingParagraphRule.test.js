import { localWritingParagraph } from '../../../frontend/js/core/writingParagraphModel.js';
import { localParagraphRule } from '../../../frontend/js/writingParagraphRule.js';

test('long-note punctuation localizes paragraph offsets and locations without changing the authored tree', () => {
    const node = { type: 'Paragraph', raw: '😀 (open\r\nnext', range: [100000, 100014], loc: { start: { line: 4000, column: 3 }, end: { line: 4001, column: 4 } },
        children: [{ type: 'Str', raw: 'next', range: [100010, 100014], loc: { start: { line: 4001, column: 0 }, end: { line: 4001, column: 4 } } }] };
    const before = JSON.stringify(node), local = localWritingParagraph(node);
    expect(local.range).toEqual([0, 14]); expect(local.loc.start).toEqual({ line: 1, column: 0 });
    expect(local.children[0].range).toEqual([10, 14]); expect(local.children[0].loc.start).toEqual({ line: 2, column: 0 });
    expect(local.raw).toBe(node.raw); expect(JSON.stringify(node)).toBe(before);
    const report = jest.fn(), rule = jest.fn(context => ({ Paragraph(value) { expect(value.range[0]).toBe(0); context.report(value, { index: 3 }); } }));
    const visitor = localParagraphRule(rule)({ Syntax: { Paragraph: 'Paragraph' }, RuleError: Error, report });
    visitor.Paragraph(node); visitor.Paragraph(node);
    expect(report).toHaveBeenCalledWith(node, { index: 3 }); expect(rule).toHaveBeenCalledTimes(2);
});
