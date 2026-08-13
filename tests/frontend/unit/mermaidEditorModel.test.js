import { diagramData } from '../../../frontend/vendored/mermaid-examples/index.js';
import {
    mermaidBlockReplacement,
    mermaidCatalogueType,
    mermaidDiagnostic,
    mermaidPreviewPanBy,
    mermaidPreviewWheelZoom,
    mermaidPreviewZoomAt,
    mermaidRenderDelay,
    initialMermaidTemplateState,
    mermaidTemplateForSource,
    mermaidTemplateCatalog,
    normalizeMermaidDiagramType,
} from '../../../frontend/js/core/mermaidEditorModel.js';

describe('Mermaid Editor model', () => {
    test('exposes the complete versioned Mermaid examples catalogue with defaults first', () => {
        const catalog = mermaidTemplateCatalog(diagramData);
        expect(catalog).toHaveLength(32);
        expect(catalog.reduce((count, diagram) => count + diagram.examples.length, 0)).toBe(76);
        expect(catalog[0]).toMatchObject({ id: 'flowchart-v2', name: 'Flowchart' });
        expect(catalog[0].examples[0]).toMatchObject({ title: 'Basic Flowchart', isDefault: true });
        expect(catalog.at(-1).id).toBe('railroadPeg');
    });

    test('matches Mermaid parser aliases to their catalogue type', () => {
        const catalog = mermaidTemplateCatalog(diagramData);
        expect(normalizeMermaidDiagramType('graph')).toBe('flowchart-v2');
        expect(normalizeMermaidDiagramType('stateDiagram-v2')).toBe('stateDiagram');
        expect(mermaidCatalogueType(catalog, 'classDiagram-v2').name).toBe('Class Diagram');
    });

    test('starts empty fences in browse mode but protects every existing block', () => {
        const catalog = mermaidTemplateCatalog(diagramData);
        const empty = initialMermaidTemplateState(catalog, '');
        expect(empty).toMatchObject({
            diagram: { id: 'flowchart-v2' },
            example: { title: 'Basic Flowchart' },
            protectedSource: false,
        });
        expect(empty.source).toBe(catalog[0].examples[0].code);

        const whitespaceOnly = initialMermaidTemplateState(catalog, ' \n\t  ');
        expect(whitespaceOnly).toMatchObject({
            source: catalog[0].examples[0].code,
            protectedSource: false,
        });

        const existingTemplate = catalog[5].examples[1];
        const existing = initialMermaidTemplateState(catalog, existingTemplate.code);
        expect(existing).toMatchObject({
            diagram: { id: catalog[5].id },
            example: { id: existingTemplate.id },
            source: existingTemplate.code,
            protectedSource: true,
        });
        expect(mermaidTemplateForSource(catalog, existingTemplate.code))
            .toMatchObject({ diagram: { id: catalog[5].id }, example: { id: existingTemplate.id } });

        expect(initialMermaidTemplateState(catalog, 'custom source')).toMatchObject({
            diagram: { id: 'flowchart-v2' },
            example: { title: 'Basic Flowchart' },
            source: 'custom source',
            protectedSource: true,
        });
    });

    test('keeps preview zoom under the pointer, clamps it, and pans independently', () => {
        expect(mermaidPreviewZoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 50, y: 30 }))
            .toEqual({ scale: 2, x: -50, y: -30 });
        expect(mermaidPreviewZoomAt({ scale: 1, x: 0, y: 0 }, 99, { x: 0, y: 0 }).scale).toBe(4);
        expect(mermaidPreviewWheelZoom({ scale: 1, x: 0, y: 0 }, 100000, { x: 0, y: 0 }).scale)
            .toBe(0.25);
        expect(mermaidPreviewPanBy({ scale: 2, x: -50, y: -30 }, { x: 12, y: -8 }))
            .toEqual({ scale: 2, x: -38, y: -38 });
    });

    test('maps parser locations to a concise hover diagnostic', () => {
        const source = 'flowchart TD\n  A -->\n  B --> C';
        const diagnostic = mermaidDiagnostic({
            hash: {
                token: 'NEWLINE',
                expected: ["'NODE'", "'TEXT'"],
                loc: { first_line: 2, first_column: 6, last_column: 7 },
            },
        }, source);
        expect(source.slice(diagnostic.from, diagnostic.to)).toBe('>');
        expect(diagnostic).toMatchObject({
            severity: 'error',
            source: 'Mermaid',
            message: 'Mermaid syntax error on line 2: expected NODE, TEXT; found NEWLINE.',
        });
    });

    test('preserves fence markers and exact body spacing in one replacement', () => {
        expect(mermaidBlockReplacement({ contentFrom: 11, contentTo: 20 }, 'A --> B\n\n'))
            .toEqual({ from: 11, to: 20, insert: 'A --> B\n\n' });
        expect(mermaidBlockReplacement({ contentFrom: 11, contentTo: 20 }, 'A --> B'))
            .toEqual({ from: 11, to: 20, insert: 'A --> B\n' });
        expect(mermaidBlockReplacement(null, 'A')).toBeNull();
    });

    test('delays only diagrams whose previous render was expensive', () => {
        expect(mermaidRenderDelay(149)).toBe(0);
        expect(mermaidRenderDelay(151)).toBe(1000);
        expect(mermaidRenderDelay(751)).toBe(2000);
    });
});
