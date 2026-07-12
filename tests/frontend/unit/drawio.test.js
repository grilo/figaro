import { decodeDrawioSVG, encodeDrawioSVG, isDrawioDiagramPath } from '../frontend/js/drawio.js';

describe('draw.io SVG integration', () => {
    test('recognizes only the canonical editable SVG extension', () => {
        expect(isDrawioDiagramPath('Diagrams/architecture.drawio.svg')).toBe(true);
        expect(isDrawioDiagramPath('Diagrams/architecture.DRAWIO.SVG')).toBe(true);
        expect(isDrawioDiagramPath('Diagrams/architecture.svg')).toBe(false);
        expect(isDrawioDiagramPath('Diagrams/architecture.drawio')).toBe(false);
    });

    test('round-trips an editable SVG through a data URI', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Plan ✓</text></svg>';
        const dataURI = encodeDrawioSVG(svg);

        expect(dataURI).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(decodeDrawioSVG(dataURI)).toBe(svg);
    });

    test('accepts raw SVG returned by the embed protocol', () => {
        const svg = '<svg viewBox="0 0 10 10"></svg>';
        expect(decodeDrawioSVG(svg)).toBe(svg);
    });
});
