import {
    diagramFileName,
    diagramMarkdownReference,
    diagramNameError,
    editableDiagramKind,
    editableDiagramKinds,
    editableDiagramSpec,
    isDiagramTabType,
    isEditableDiagramPath,
    isPathTabType,
} from '../frontend/js/core/editableDiagramModel.js';

describe('editable diagram kinds', () => {
    test('recognizes Draw.io and Excalidraw SVGs by their complete suffix', () => {
        expect(editableDiagramKinds).toEqual(['drawio', 'excalidraw']);
        expect(editableDiagramKind('Diagrams/FLOW.DRAWIO.SVG')).toBe('drawio');
        expect(editableDiagramKind('Sketches/board.Excalidraw.svg')).toBe('excalidraw');
        for (const path of ['flow.svg', 'board.excalidraw', 'board.excalidraw.png', 'notes.md', '', null]) {
            expect(editableDiagramKind(path)).toBeNull();
            expect(isEditableDiagramPath(path)).toBe(false);
        }
    });

    test('treats both kinds as path-backed tab types beside notes', () => {
        expect(isDiagramTabType('drawio')).toBe(true);
        expect(isDiagramTabType('excalidraw')).toBe(true);
        expect(isDiagramTabType('file')).toBe(false);
        expect(isDiagramTabType('toString')).toBe(false);
        expect(['file', 'drawio', 'excalidraw', 'calendar'].map(isPathTabType)).toEqual([true, true, true, false]);
    });

    test('describes each kind for prompts and labels', () => {
        expect(editableDiagramSpec('excalidraw')).toMatchObject({
            editorName: 'Excalidraw', noun: 'drawing', defaultName: 'drawing1', suffix: '.excalidraw.svg',
        });
        expect(editableDiagramSpec('drawio')).toMatchObject({
            editorName: 'Draw.io', noun: 'diagram', defaultName: 'diagram1', suffix: '.drawio.svg',
        });
        expect(editableDiagramSpec('unknown')).toBeNull();
    });
});

describe('editable diagram names', () => {
    test('normalizes stems, .svg and bare-kind names to the complete suffix', () => {
        expect(diagramFileName('drawio', 'system map')).toBe('system map.drawio.svg');
        expect(diagramFileName('drawio', 'system.drawio')).toBe('system.drawio.svg');
        expect(diagramFileName('drawio', 'system.drawio.svg')).toBe('system.drawio.svg');
        expect(diagramFileName('excalidraw', 'whiteboard')).toBe('whiteboard.excalidraw.svg');
        expect(diagramFileName('excalidraw', 'whiteboard.svg')).toBe('whiteboard.excalidraw.svg');
        expect(diagramFileName('excalidraw', 'whiteboard.excalidraw')).toBe('whiteboard.excalidraw.svg');
        expect(diagramFileName('excalidraw', 'Board.Excalidraw.SVG')).toBe('Board.Excalidraw.SVG');
        // A name typed for the other kind is kept as a stem, never mislabelled.
        expect(diagramFileName('excalidraw', 'flow.drawio.svg')).toBe('flow.drawio.excalidraw.svg');
    });

    test('rejects paths, dots, control characters and empty stems', () => {
        expect(diagramNameError('drawio', '../system')).toMatch(/name, not a path/i);
        expect(diagramNameError('excalidraw', 'a\\b')).toMatch(/name, not a path/i);
        expect(diagramNameError('excalidraw', '..')).toMatch(/other than dots/i);
        expect(diagramNameError('excalidraw', 'a\u0001b')).toMatch(/control character/i);
        expect(diagramNameError('drawio', '.drawio.svg')).toBe('Enter a name before the .drawio.svg extension.');
        expect(diagramNameError('excalidraw', '.excalidraw.svg')).toBe('Enter a name before the .excalidraw.svg extension.');
        expect(diagramNameError('excalidraw', '   ')).toBe('Enter a drawing name.');
        expect(diagramFileName('excalidraw', '../escape')).toBe('');
    });

    test('builds an encoded sibling image reference with a kind-specific alt text', () => {
        expect(diagramMarkdownReference('drawio', 'system map')).toBe('![Diagram](./system%20map.drawio.svg)');
        expect(diagramMarkdownReference('excalidraw', 'white board')).toBe('![Drawing](./white%20board.excalidraw.svg)');
        expect(diagramMarkdownReference('excalidraw', '')).toBe('');
    });
});
