import {
    diagramRenderCacheKey,
    rebaseDiagramSvgIds,
} from '../frontend/js/core/diagramRenderCacheModel.js';

describe('diagram render cache model', () => {
    test('keys source content by normalized diagram language', () => {
        expect(diagramRenderCacheKey(' Mermaid ', 'flowchart TD\n  A --> B'))
            .toBe('mermaid\u0000flowchart TD\n  A --> B');
        expect(diagramRenderCacheKey('mermaid', 'flowchart TD\n  A --> B'))
            .toBe(diagramRenderCacheKey('MERMAID', 'flowchart TD\n  A --> B'));
        expect(diagramRenderCacheKey('mermaid', 'flowchart TD\n  A --> C'))
            .not.toBe(diagramRenderCacheKey('mermaid', 'flowchart TD\n  A --> B'));
    });

    test('rebases generated ids and their references without changing other content', () => {
        const svg = '<svg id="source-1"><use href="#source-1"/><text>source-1 label</text></svg>';

        expect(rebaseDiagramSvgIds(svg, 'source-1', 'target-2'))
            .toBe('<svg id="target-2"><use href="#target-2"/><text>target-2 label</text></svg>');
        expect(rebaseDiagramSvgIds(svg, '', 'target-2')).toBe(svg);
        expect(rebaseDiagramSvgIds(svg, 'source-1', 'source-1')).toBe(svg);
    });
});
