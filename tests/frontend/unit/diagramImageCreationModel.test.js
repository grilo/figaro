import {
    diagramImageCreationTarget,
    diagramImageStateForRead,
    diagramImageVaultURL,
    localDiagramMarkdownImageKind,
    parseMarkdownImageSyntax,
} from '../frontend/js/core/diagramImageCreationModel.js';

describe('missing editable diagram image target resolution', () => {
    test('resolves same-folder, parent-folder, root, and encoded destinations', () => {
        expect(diagramImageCreationTarget({
            imageSource: 'flow.drawio.svg',
            notePath: 'Projects/plan.md',
        })).toEqual({ kind: 'drawio', path: 'Projects/flow.drawio.svg', title: 'flow.drawio.svg' });
        expect(diagramImageCreationTarget({
            imageSource: '../Diagrams/system.drawio.svg',
            notePath: 'Projects/Notes/plan.md',
        })).toEqual({ kind: 'drawio', path: 'Projects/Diagrams/system.drawio.svg', title: 'system.drawio.svg' });
        expect(diagramImageCreationTarget({
            imageSource: '/Diagrams/system%20map.drawio.svg',
            notePath: 'Projects/plan.md',
        })).toEqual({ kind: 'drawio', path: 'Diagrams/system map.drawio.svg', title: 'system map.drawio.svg' });
        expect(diagramImageCreationTarget({
            imageSource: '<flow%20chart.drawio.svg>',
            notePath: 'plan.md',
        })).toEqual({ kind: 'drawio', path: 'flow chart.drawio.svg', title: 'flow chart.drawio.svg' });
    });

    test('resolves Excalidraw drawings with their kind', () => {
        expect(diagramImageCreationTarget({
            imageSource: './Sketches/Board.Excalidraw.svg',
            notePath: 'Projects/plan.md',
        })).toEqual({ kind: 'excalidraw', path: 'Projects/Sketches/Board.Excalidraw.svg', title: 'Board.Excalidraw.svg' });
        expect(diagramImageCreationTarget({ imageSource: 'board.excalidraw', notePath: 'plan.md' })).toBeNull();
    });

    test('rejects non-diagrams, remote URLs, fragments, malformed encoding, and vault escapes', () => {
        for (const imageSource of [
            'picture.svg',
            'https://example.test/flow.drawio.svg',
            '<https://example.test/flow.drawio.svg>',
            'https%3A%2F%2Fexample.test%2Fflow.drawio.svg',
            '//example.test/flow.drawio.svg',
            'flow.drawio.svg#page-1',
            'flow%ZZ.drawio.svg',
            '../../flow.drawio.svg',
            '%2e%2e/%2e%2e/flow.drawio.svg',
        ]) {
            expect(diagramImageCreationTarget({ imageSource, notePath: 'Notes/plan.md' })).toBeNull();
        }
    });

    test('encodes a validated target as the matching vault image route', () => {
        expect(diagramImageVaultURL({ path: 'Diagrams/system map.drawio.svg' }))
            .toBe('/vault/Diagrams/system%20map.drawio.svg');
        expect(diagramImageVaultURL({ path: 'Diagrams/system map.drawio.svg' }, 7))
            .toBe('/vault/Diagrams/system%20map.drawio.svg?figaro-preview=7');
        expect(diagramImageVaultURL(null)).toBeNull();
    });

    test('recognizes only complete local Draw.io Markdown images', () => {
        expect(parseMarkdownImageSyntax('![Flow](flow.drawio.svg "System")')).toEqual({
            alt: 'Flow',
            src: 'flow.drawio.svg',
            title: 'System',
        });
        expect(localDiagramMarkdownImageKind('![Flow](flow.drawio.svg)')).toBe('drawio');
        expect(localDiagramMarkdownImageKind('![Flow](<Diagrams/flow.drawio.svg>)')).toBe('drawio');
        expect(localDiagramMarkdownImageKind('![Board](./Sketches/board.excalidraw.svg)')).toBe('excalidraw');
        expect(localDiagramMarkdownImageKind('![Flow](https://example.test/flow.drawio.svg)')).toBeNull();
        expect(localDiagramMarkdownImageKind('prefix ![Flow](flow.drawio.svg)')).toBeNull();
        expect(localDiagramMarkdownImageKind('![Flow](flow.svg)')).toBeNull();
    });

    test('distinguishes previewable, empty, missing, and unreadable diagrams', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
        expect(diagramImageStateForRead(null)).toEqual({ kind: 'create' });
        expect(diagramImageStateForRead({ path: 'flow.drawio.svg', content: '' }))
            .toEqual({ kind: 'open' });
        expect(diagramImageStateForRead({ path: 'flow.drawio.svg', content: svg }))
            .toEqual({
                kind: 'preview',
                source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
            });
        expect(diagramImageStateForRead(null, new Error('unreadable')))
            .toEqual({ kind: 'error' });
    });
});
