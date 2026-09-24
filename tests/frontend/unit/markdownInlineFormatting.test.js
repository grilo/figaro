import { markdownInlineFormatPlan } from '../frontend/js/core/markdownInlineFormatting.js';

function apply(source, from, to, format) {
    const plan = markdownInlineFormatPlan({ source, from, to, format });
    return {
        ...plan,
        result: source.slice(0, plan.from) + plan.insert + source.slice(plan.to),
    };
}

describe('conventional Markdown inline formatting', () => {
    test.each([
        ['bold', '**word**'],
        ['italic', '*word*'],
        ['strikethrough', '~~word~~'],
        ['code', '`word`'],
    ])('wraps and keeps the selected text selected for %s', (format, expected) => {
        const plan = apply('word', 0, 4, format);
        expect(plan.result).toBe(expected);
        expect([plan.anchor, plan.head]).toEqual([
            expected.indexOf('word'),
            expected.indexOf('word') + 4,
        ]);
    });

    test('toggles formatting off when markers surround the selection', () => {
        const plan = apply('Before **word** after', 9, 13, 'bold');
        expect(plan.result).toBe('Before word after');
        expect([plan.anchor, plan.head]).toEqual([7, 11]);
    });

    test.each([
        ['bold', 'First **paragraph**: next'],
        ['italic', 'First *paragraph*: next'],
        ['strikethrough', 'First ~~paragraph~~: next'],
    ])('keeps selected leading whitespace outside %s markers', (format, expected) => {
        const plan = apply('First paragraph: next', 5, 15, format);
        expect(plan.result).toBe(expected);
        expect(plan.result.slice(plan.anchor, plan.head)).toBe('paragraph');
    });

    test('preserves both whitespace boundaries when applying and removing emphasis', () => {
        const plan = apply('\t word \n', 0, 8, 'bold');
        expect(plan.result).toBe('\t **word** \n');
        expect(apply(plan.result, 0, plan.result.length, 'bold').result).toBe('\t word \n');
    });

    test('does not insert invalid emphasis around a whitespace-only selection', () => {
        expect(markdownInlineFormatPlan({ source: ' \t\n', from: 0, to: 3, format: 'bold' })).toBeNull();
    });

    test('uses enough backticks to preserve inline code containing a backtick', () => {
        expect(apply('a`b', 0, 3, 'code').result).toBe('``a`b``');
    });

    test('uses selected prose as a link label and leaves the cursor in the destination', () => {
        const plan = apply('Figaro', 0, 6, 'link');
        expect(plan.result).toBe('[Figaro]()');
        expect([plan.anchor, plan.head]).toEqual([9, 9]);
    });

    test('inserts empty portable markers at an empty cursor', () => {
        const plan = apply('ab', 1, 1, 'italic');
        expect(plan.result).toBe('a**b');
        expect([plan.anchor, plan.head]).toEqual([2, 2]);
    });
});
