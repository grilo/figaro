import {
    DEFAULT_MERMAID_DIAGRAM_HEIGHT,
    authoredMermaidDiagramHeight,
    mermaidDiagramHeight,
    mermaidDiagramResizePlan,
    setMermaidDiagramHeight,
} from '../../../frontend/js/core/mermaidDiagramModel.js';

describe('Mermaid diagram height metadata', () => {
    test('defaults small diagrams to a useful canvas and clamps vertical resizing', () => {
        expect(mermaidDiagramHeight('flowchart TD\nA --> B')).toBe(DEFAULT_MERMAID_DIAGRAM_HEIGHT);
        expect(mermaidDiagramResizePlan({ startHeight: 300, deltaY: -999 })).toBe(180);
        expect(mermaidDiagramResizePlan({ startHeight: 300, deltaY: 999 })).toBe(900);
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
