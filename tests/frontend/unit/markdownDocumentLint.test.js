import { collectMarkdownDocumentDiagnostics } from '../../../frontend/js/usecases/markdownDocumentLint.js';

describe('raw Markdown document lint use case', () => {
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
