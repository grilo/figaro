import { collectMarkdownDocumentDiagnostics, createMarkdownDocumentLinter } from '../../../frontend/js/usecases/markdownDocumentLint.js';
import { createMermaidValidationReuse } from '../../../frontend/js/usecases/mermaidValidationReuse.js';

describe('raw Markdown document lint use case', () => {
    test('cached parser failures retain current diagnostic offsets after prose edits', async () => {
        const validate = jest.fn().mockRejectedValue({ hash: { loc: { first_line: 2, first_column: 4, last_column: 7 } } });
        const reuse = createMermaidValidationReuse(validate);
        const fence = '```mermaid\nflowchart TD\n  A -->\n```';
        const first = await collectMarkdownDocumentDiagnostics(fence, reuse);
        const shifted = await collectMarkdownDocumentDiagnostics('More prose.\n\n' + fence, reuse);
        expect(validate).toHaveBeenCalledTimes(1);
        expect(shifted[0].from).toBe(first[0].from + 13);
        expect(shifted[0].to).toBe(first[0].to + 13);
    });
    test.each(['edit', 'destroy'])('obsolete lint stops before enqueueing more parser work after %s', async action => {
        let finish;
        const validate = jest.fn(() => new Promise(resolve => { finish = resolve; }));
        const document = { toString: () => '```mermaid\ngraph LR; A-->B\n```\n```mermaid\ngraph LR; C-->D\n```' };
        const view = { state: { doc: document }, isDestroyed: false };
        const lint = createMarkdownDocumentLinter(validate);
        const pending = lint(view);
        if (action === 'edit') view.state = { doc: { toString: () => 'Current prose.' } };
        else view.isDestroyed = true;
        finish(true);
        await expect(pending).resolves.toEqual([]);
        expect(validate).toHaveBeenCalledTimes(1);
        if (action === 'edit') await expect(lint(view)).resolves.toEqual([]);
    });
    test('combines prose warnings with injected Mermaid validation failures', async () => {
        const source = [
            '# Overview',
            '### Skipped level',
            '```mermaid',
            'flowchart TD',
            '  A -->',
            '```',
            '```mermaid',
            'flowchart LR',
            '  B --> C',
            '```',
            '```javascript',
            'throw new Error();',
            '```',
        ].join('\n');
        const validate = jest.fn(async mermaid => {
            if (mermaid.includes('A -->')) {
                throw { hash: { loc: { first_line: 2, first_column: 4, last_column: 7 } } };
            }
            return { diagramType: 'flowchart-v2' };
        });

        const diagnostics = await collectMarkdownDocumentDiagnostics(source, validate);

        expect(validate).toHaveBeenCalledTimes(2);
        expect(diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ source: 'Figaro Markdown', severity: 'warning' }),
            expect.objectContaining({ source: 'Mermaid', severity: 'error' }),
        ]));
        expect(source.slice(
            diagnostics.find(item => item.source === 'Mermaid').from,
            diagnostics.find(item => item.source === 'Mermaid').to,
        )).toBe('-->');
    });

    test('keeps valid Mermaid fences quiet', async () => {
        const validate = jest.fn().mockResolvedValue({ diagramType: 'flowchart-v2' });
        const diagnostics = await collectMarkdownDocumentDiagnostics(
            '```mermaid\nflowchart TD\n  A --> B\n```',
            validate,
        );

        expect(validate).toHaveBeenCalledWith('flowchart TD\n  A --> B');
        expect(diagnostics).toEqual([]);
    });
});
