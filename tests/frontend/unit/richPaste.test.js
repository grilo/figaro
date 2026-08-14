import {
    richClipboardHTMLSignals,
    richMarkdownFromClipboard,
} from '../frontend/js/richPaste.js';

describe('rich clipboard HTML conversion', () => {
    test('converts semantic headings, emphasis, links, lists, quotes, and highlights', () => {
        const result = richMarkdownFromClipboard({
            html: [
                '<h2>Problems</h2>',
                '<p><strong>Database</strong> is <em>slow</em> and <mark>important</mark>.</p>',
                '<ul><li><a href="https://example.com/docs">Read the docs</a></li><li>Retry</li></ul>',
                '<blockquote>Keep the original wording.</blockquote>',
            ].join(''),
            text: 'Problems\nDatabase is slow and important.\nRead the docs\nRetry\nKeep the original wording.',
        });

        expect(result).toMatchObject({ converted: true, block: true, reason: 'semantic-html' });
        expect(result.markdown).toContain('## Problems');
        expect(result.markdown).toContain('**Database** is *slow* and ==important==.');
        expect(result.markdown).toContain('- [Read the docs](https://example.com/docs)');
        expect(result.markdown).toContain('> Keep the original wording.');
    });

    test('emits portable Markdown destinations for links containing spaces and parentheses', () => {
        const result = richMarkdownFromClipboard({
            html: [
                '<p><a href="Guides/My File (draft).md">Draft guide</a></p>',
                '<p><a href="Guides/Exact File.md">Guides/Exact File.md</a></p>',
            ].join(''),
            text: 'Draft guide\nGuides/Exact File.md',
        });
        expect(result.markdown).toBe([
            '[Draft guide](<Guides/My File (draft).md>)',
            '',
            '[Guides/Exact File.md](<Guides/Exact File.md>)',
        ].join('\n'));
    });

    test('leaves presentation-only wrappers and external Markdown plaintext untouched', () => {
        const inspected = richClipboardHTMLSignals('<div><span>## Existing Markdown</span></div>');
        expect(inspected.decision).toMatchObject({
            convert: false,
            reason: 'presentation-only-html',
        });
        expect(richMarkdownFromClipboard({
            html: '<div><span>## Existing Markdown</span></div>',
            text: '## Existing Markdown',
        })).toMatchObject({ converted: false, markdown: '' });
    });

    test('fails closed to plaintext when rich parsing is unavailable or beyond its input cap', () => {
        const parser = globalThis.DOMParser;
        globalThis.DOMParser = undefined;
        try {
            expect(richMarkdownFromClipboard({
                html: '<strong>Rich</strong>',
                text: 'Rich',
            })).toMatchObject({ converted: false, reason: 'invalid-html', markdown: '' });
        } finally {
            globalThis.DOMParser = parser;
        }

        expect(richMarkdownFromClipboard({
            html: `<strong>${'x'.repeat(1_000_000)}</strong>`,
            text: 'x',
        })).toMatchObject({ converted: false, reason: 'html-too-large', markdown: '' });
    });

    test('promotes only semantic inline styles and supports inline-only table cells', () => {
        const styled = richMarkdownFromClipboard({
            html: '<span style="font-weight: 700; font-style: italic">Important</span>',
            text: 'Important',
        }, { inlineOnly: true });
        expect(styled).toMatchObject({ converted: true, block: false });
        expect(styled.markdown).toBe('***Important***');

        expect(richMarkdownFromClipboard({
            html: '<h3>Block heading</h3>',
            text: 'Block heading',
        }, { inlineOnly: true })).toMatchObject({
            converted: false,
            reason: 'block-in-inline-context',
        });
    });

    test('converts rectangular rich tables and preserves surrounding prose', () => {
        const result = richMarkdownFromClipboard({
            html: [
                '<p><strong>Inventory</strong></p>',
                '<table>',
                '<tr><th>Name</th><th>State</th></tr>',
                '<tr><td><em>Alpha</em></td><td><a href="https://example.com/a">Ready</a></td></tr>',
                '</table>',
                '<p>After the table.</p>',
            ].join(''),
            text: 'Inventory\nName State\nAlpha Ready\nAfter the table.',
        });

        expect(result.converted).toBe(true);
        expect(result.markdown).toContain('**Inventory**');
        expect(result.markdown).toContain('| Name | State |');
        expect(result.markdown).toContain('| *Alpha* | [Ready](https://example.com/a) |');
        expect(result.markdown).toContain('After the table.');
    });

    test('repairs structural AI code quirks without applying opinionated cleanup', () => {
        const gemini = richMarkdownFromClipboard({
            html: [
                '<code-block>',
                '<span>Python</span><div class="buttons"></div>',
                '<pre>print("one")<br>print("two")</pre>',
                '</code-block>',
            ].join(''),
            text: 'Python\nprint("one")\nprint("two")',
        });
        expect(gemini).toMatchObject({ converted: true, block: true, aiRepairCount: 1 });
        expect(gemini.markdown).toBe('```python\nprint("one")\nprint("two")\n```');

        const duplicate = richMarkdownFromClipboard({
            html: '<div class="code-language-label">JavaScript</div><pre><code class="language-javascript">one();</code></pre>',
            text: 'JavaScript\none();',
        });
        expect(duplicate.markdown).toBe('```javascript\none();\n```');

        const adjacentHeader = richMarkdownFromClipboard({
            html: '<div class="code-header"><span>TypeScript</span></div><pre><code>const ready = true;</code></pre>',
            text: 'TypeScript\nconst ready = true;',
        });
        expect(adjacentHeader.markdown).toBe('```typescript\nconst ready = true;\n```');

        const exactCodeWhitespace = richMarkdownFromClipboard({
            html: '<pre><code class="language-customlang">\n\u00a0value\n\n</code></pre>',
            text: '\n\u00a0value\n\n',
        });
        expect(exactCodeWhitespace.markdown).toBe('```customlang\n\n\u00a0value\n\n```');
    });

    test('keeps task state and AI math but never rewrites fenced or inline code', () => {
        const result = richMarkdownFromClipboard({
            html: [
                '<ul><li><input type="checkbox" checked>Done</li></ul>',
                '<p><strong>Math:</strong> \\(x + y\\) and <code>\\(literal\\)</code></p>',
            ].join(''),
            text: 'Done\nMath: \\(x + y\\) and \\(literal\\)',
        });
        expect(result.markdown).toContain('- [x] Done');
        expect(result.markdown).toContain('$x + y$');
        expect(result.markdown).toContain('`\\(literal\\)`');

        const literalBackslashes = richMarkdownFromClipboard({
            html: '<p><strong>Literal:</strong> \\\\(not math\\\\)</p>',
            text: 'Literal: \\\\(not math\\\\)',
        });
        expect(literalBackslashes.markdown).toContain('\\\\\\\\(not math\\\\\\\\)');
    });

    test('drops executable markup, unsafe link targets, and remote image loading', () => {
        const result = richMarkdownFromClipboard({
            html: [
                '<script>steal()</script>',
                '<p><strong>Safe</strong> <a href="javascript:steal()">link</a> ',
                '<img src="https://tracker.example/pixel" alt="Diagram"></p>',
            ].join(''),
            text: 'Safe link Diagram',
        });
        expect(result.markdown).toBe('**Safe** link Diagram');
        expect(result.markdown).not.toMatch(/javascript|tracker|steal/);

        const remoteImage = richMarkdownFromClipboard({
            html: '<img src="https://tracker.example/standalone" alt="Standalone diagram">',
            text: 'Standalone diagram',
        });
        expect(remoteImage.markdown).toBe('Standalone diagram');
    });

    test('keeps a 100 KB semantic paste within the interactive fallback budget', () => {
        const paragraph = '<p><strong>Alpha</strong> beta gamma delta.</p>';
        const html = paragraph.repeat(Math.ceil(100_000 / paragraph.length));
        const started = performance.now();
        const result = richMarkdownFromClipboard({ html, text: 'Alpha beta gamma delta.' });
        const elapsed = performance.now() - started;

        expect(result.converted).toBe(true);
        // Wide enough for shared CI, but catches accidental repeated whole-DOM
        // passes that would turn this bounded conversion into multi-second work.
        expect(elapsed).toBeLessThan(2_000);
    });
});
