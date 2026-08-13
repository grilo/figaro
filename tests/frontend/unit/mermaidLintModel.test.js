import {
    mermaidDocumentDiagnostic,
    mermaidLintBlocks,
} from '../../../frontend/js/core/mermaidLintModel.js';

describe('raw Markdown Mermaid lint model', () => {
    test('finds complete Mermaid bodies without treating other fenced code as Mermaid', () => {
        const source = [
            '# Diagrams',
            '```javascript',
            'const sample = "```mermaid";',
            '```',
            '```mermaid',
            'flowchart TD',
            '  A --> B',
            '```',
        ].join('\n');

        const blocks = mermaidLintBlocks(source);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].source).toBe('flowchart TD\n  A --> B');
        expect(source.slice(blocks[0].contentFrom, blocks[0].contentTo))
            .toBe('flowchart TD\n  A --> B\n');
    });

    test('maps parser positions into the Mermaid fence body and empty errors onto its language', () => {
        const invalidSource = 'Before\n```mermaid\nflowchart TD\n  A -->\n```\nAfter';
        const invalidBlock = mermaidLintBlocks(invalidSource)[0];
        const diagnostic = mermaidDocumentDiagnostic({
            hash: { loc: { first_line: 2, first_column: 4, last_column: 7 } },
        }, invalidBlock);
        expect(invalidSource.slice(diagnostic.from, diagnostic.to)).toBe('-->');
        expect(diagnostic).toMatchObject({ severity: 'error', source: 'Mermaid' });

        const emptySource = '```mermaid\n```';
        const emptyBlock = mermaidLintBlocks(emptySource)[0];
        const emptyDiagnostic = mermaidDocumentDiagnostic(new Error('Enter a diagram'), emptyBlock);
        expect(emptySource.slice(emptyDiagnostic.from, emptyDiagnostic.to)).toBe('mermaid');
    });

    test('matches the live preview recovery for a shorter Mermaid closing fence', () => {
        const source = '``````mermaid\nflowchart TD\n  A --> B\n```\nAfter';
        expect(mermaidLintBlocks(source)).toEqual([
            expect.objectContaining({ source: 'flowchart TD\n  A --> B' }),
        ]);
    });
});
