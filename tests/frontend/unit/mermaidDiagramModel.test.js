import {
    DEFAULT_MERMAID_DIAGRAM_HEIGHT,
    authoredMermaidDiagramHeight,
    mermaidDiagramDisplaySize,
    mermaidDiagramHeight,
    mermaidDiagramResizePlan,
    mermaidSourceWithoutHeight,
    setMermaidDiagramHeight,
} from '../../../frontend/js/core/mermaidDiagramModel.js';

describe('Mermaid diagram height metadata', () => {
    test('defaults small diagrams to a useful canvas and clamps vertical resizing', () => {
        expect(mermaidDiagramHeight('flowchart TD\nA --> B')).toBe(DEFAULT_MERMAID_DIAGRAM_HEIGHT);
        expect(mermaidDiagramResizePlan({ startHeight: 300, deltaY: -999 })).toBe(60);
        expect(mermaidDiagramResizePlan({ startHeight: 300, deltaY: 999 })).toBe(900);
    });

    test('stops a resize where the column width would cap the drawing', () => {
        expect(mermaidDiagramResizePlan({ startHeight: 200, deltaY: 400, maxHeight: 412.7 })).toBe(412);
        expect(mermaidDiagramResizePlan({ startHeight: 200, deltaY: -50, maxHeight: 412.7 })).toBe(150);
        expect(mermaidDiagramResizePlan({ startHeight: 200, deltaY: 0, maxHeight: 20 })).toBe(60);
    });

    test('draws at the natural size, or at an authored height with proportional width', () => {
        const natural = { width: 329, height: 70 };
        expect(mermaidDiagramDisplaySize({ natural })).toEqual({ width: 329, height: 70 });
        expect(mermaidDiagramDisplaySize({ natural, authoredHeight: 210 })).toEqual({ width: 987, height: 210 });
        expect(mermaidDiagramDisplaySize({ natural: null, authoredHeight: 210 })).toBeNull();
        expect(mermaidDiagramDisplaySize({ natural: { width: 0, height: 70 } })).toBeNull();
    });

    test('identifies the drawing independently of the editor-only height directive', () => {
        const source = 'flowchart TD\n  A --> B';
        expect(mermaidSourceWithoutHeight(setMermaidDiagramHeight(source, 420))).toBe(source);
        expect(mermaidSourceWithoutHeight('flowchart TD\r\n%% figaro:height 300\r\n  A --> B')).toBe(source);
    });

    test('writes one portable Mermaid comment while preserving authored source order', () => {
        const source = 'flowchart TD\n  A --> B';
        const resized = setMermaidDiagramHeight(source, 420);
        expect(resized).toBe(`${source}\n%% figaro:height 420`);
        expect(authoredMermaidDiagramHeight(resized)).toBe(420);
        expect(setMermaidDiagramHeight(`${resized}\n%% figaro:height 500`, 360))
            .toBe(`${source}\n%% figaro:height 360`);
    });
});
