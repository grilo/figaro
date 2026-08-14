import {
    RICH_PASTE_MAX_DOM_NODES,
    RICH_PASTE_MAX_HTML_CHARS,
    convertAIChatMathDelimiters,
    expandCollapsedCodeFences,
    fencedCodeMarkdown,
    normalizeRichClipboardMarkdown,
    richClipboardDecision,
    richMarkdownInsertion,
    richPastePlan,
    richPastePreflightPlan,
} from '../frontend/js/core/richPasteModel.js';

describe('rich paste policy', () => {
    test('requires semantic evidence and rejects bounded pathological HTML', () => {
        expect(richClipboardDecision({ htmlLength: 20, nodeCount: 2 })).toEqual({
            convert: false,
            reason: 'presentation-only-html',
            evidence: 0,
        });
        expect(richClipboardDecision({
            htmlLength: 20,
            nodeCount: 2,
            semanticElementCount: 1,
        })).toMatchObject({ convert: true, reason: 'semantic-html' });
        expect(richClipboardDecision({ htmlLength: RICH_PASTE_MAX_HTML_CHARS + 1 }).reason)
            .toBe('html-too-large');
        expect(richClipboardDecision({ htmlLength: 20, nodeCount: RICH_PASTE_MAX_DOM_NODES + 1 }).reason)
            .toBe('dom-too-large');
    });

    test('keeps internal/plain/image/table/rich/native paste priorities explicit', () => {
        expect(richPastePreflightPlan({ markdown: true })).toEqual({
            action: 'inspect',
            reason: 'conversion-candidate',
        });
        expect(richPastePlan({ internal: true, image: true }).action).toBe('native');
        expect(richPastePlan({ plainBypass: true, hasPlainText: true, image: true }).action).toBe('plain');
        expect(richPastePlan({ plainBypass: true, markdown: true, rich: true })).toEqual({
            action: 'native',
            reason: 'plain-bypass-unavailable',
        });
        expect(richPastePlan({ image: true, markdown: true, table: true }).action).toBe('image');
        expect(richPastePlan({ markdown: false, rich: true }).action).toBe('native');
        expect(richPastePlan({ markdown: true, protectedContext: true, hasPlainText: true }).action).toBe('plain');
        expect(richPastePlan({ markdown: true, table: true, rich: true }).action).toBe('table');
        expect(richPastePlan({ markdown: true, rich: true }).action).toBe('rich');
        expect(richPastePlan({ markdown: true }).action).toBe('native');
    });

    test('adds boundaries only for converted block structures', () => {
        expect(richMarkdownInsertion('Before selected after', { from: 7, to: 15 }, '**rich**'))
            .toEqual({ insert: '**rich**', cursorOffset: 8 });
        expect(richMarkdownInsertion('Before\nselected\nAfter', { from: 7, to: 15 }, '## Rich', true))
            .toEqual({ insert: '\n## Rich\n', cursorOffset: 8 });
        expect(richMarkdownInsertion('Before selected after', { from: 7, to: 15 }, '## Rich', true))
            .toEqual({ insert: '\n\n## Rich\n\n', cursorOffset: 9 });
    });

    test('uses a safe variable-length fence without changing code text', () => {
        expect(fencedCodeMarkdown('const value = `one`;', 'JavaScript')).toBe(
            '```javascript\nconst value = `one`;\n```'
        );
        expect(fencedCodeMarkdown('before ``` inside', 'not a language!')).toBe(
            '````\nbefore ``` inside\n````'
        );
        expect(fencedCodeMarkdown('\nline\n\n', 'text')).toBe(
            '```text\n\nline\n\n```'
        );
    });

    test('repairs AI math and collapsed fences outside every code form only', () => {
        const source = [
            '\\(x + y\\)',
            '`\\(inline code\\)`',
            '```text',
            '\\[block code\\]',
            '```',
            '```python print("hi") ```',
        ].join('\n');
        const expected = [
            '$x + y$',
            '`\\(inline code\\)`',
            '```text',
            '\\[block code\\]',
            '```',
            '```python',
            'print("hi")',
            '```',
        ].join('\n');

        expect(normalizeRichClipboardMarkdown(source)).toBe(expected);
        expect(convertAIChatMathDelimiters('`\\(x\\)` and \\(y\\)')).toBe('`\\(x\\)` and $y$');
        expect(convertAIChatMathDelimiters('Escaped \\\\\\(literal\\\\\\)')).toBe('Escaped \\\\\\(literal\\\\\\)');
        expect(expandCollapsedCodeFences('~~~text\n```js one() ```\n~~~'))
            .toBe('~~~text\n```js one() ```\n~~~');
        expect(expandCollapsedCodeFences('` ```shell echo ready ``` `')).toBe([
            '```shell',
            'echo ready',
            '```',
        ].join('\n'));
    });
});
