import { markdownDiagnostics } from '../frontend/js/markdownLint.js';

describe('Markdown lint diagnostics', () => {
    test('reports unclosed frontmatter and code fences with actionable hover messages', () => {
        const frontmatter = markdownDiagnostics('---\ntitle: Draft');
        expect(frontmatter).toEqual([expect.objectContaining({
            severity: 'error',
            source: 'Figaro Markdown',
            message: expect.stringMatching(/closing --- or \.\.\./i),
        })]);

        const fence = markdownDiagnostics('```js\nconst draft = true;');
        expect(fence).toEqual([expect.objectContaining({
            severity: 'error',
            source: 'Figaro Markdown',
            message: expect.stringMatching(/matching closing fence/i),
        })]);
    });

    test('reports skipped headings and non-semantic trailing whitespace outside structured regions', () => {
        const source = [
            '---',
            'title: metadata   ',
            '---',
            '# Overview',
            '### Detail',
            'Accidental padding   ',
            'Intentional break  ',
            '```text',
            '### Not a heading   ',
            '```',
        ].join('\n');

        const diagnostics = markdownDiagnostics(source);
        expect(diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringMatching(/jumps from level 1 to level 3/i),
            }),
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringMatching(/remove trailing whitespace/i),
            }),
        ]));
        expect(diagnostics).toHaveLength(2);
    });

    test('keeps valid Markdown hard breaks and complete structures quiet', () => {
        const source = [
            '---',
            'title: Complete',
            '---',
            '# Overview',
            '## Detail',
            'A deliberate hard break  ',
            '```js',
            'const heading = "### not prose";   ',
            '```',
        ].join('\n');

        expect(markdownDiagnostics(source)).toEqual([]);
    });
});
