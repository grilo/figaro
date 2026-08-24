import { tablePreviewOwnsInteraction } from '../frontend/js/core/tablePreviewInteractionModel.js';

const overflowingTable = {
    targetKind: 'content',
    rect: { top: 10, left: 20, right: 150, bottom: 100, width: 130, height: 90 },
    clientWidth: 120,
    clientHeight: 80,
    scrollWidth: 220,
    scrollHeight: 240,
};

describe('rendered table interaction policy', () => {
    test('keeps scroll gestures and the surface outside CodeMirror', () => {
        expect(tablePreviewOwnsInteraction({ ...overflowingTable, type: 'wheel', deltaY: 40 })).toBe(true);
        expect(tablePreviewOwnsInteraction({ ...overflowingTable, type: 'touchmove' })).toBe(true);
        expect(tablePreviewOwnsInteraction({
            ...overflowingTable,
            type: 'pointerdown',
            pointerType: 'touch',
        })).toBe(true);
        expect(tablePreviewOwnsInteraction({ ...overflowingTable, targetKind: 'surface' })).toBe(true);
        expect(tablePreviewOwnsInteraction({ ...overflowingTable, targetKind: 'root' })).toBe(true);
        expect(tablePreviewOwnsInteraction({
            ...overflowingTable,
            type: 'wheel',
            deltaY: 40,
            targetKind: 'surface',
            scrollWidth: 120,
            scrollHeight: 80,
        })).toBe(false);
    });

    test('protects both scrollbar strips while leaving cell content editable', () => {
        expect(tablePreviewOwnsInteraction({
            ...overflowingTable,
            type: 'mousedown',
            clientX: 146,
            clientY: 40,
        })).toBe(true);
        expect(tablePreviewOwnsInteraction({
            ...overflowingTable,
            type: 'mousedown',
            clientX: 60,
            clientY: 96,
        })).toBe(true);
        expect(tablePreviewOwnsInteraction({
            ...overflowingTable,
            type: 'mousedown',
            clientX: 60,
            clientY: 40,
        })).toBe(false);
        expect(tablePreviewOwnsInteraction({
            ...overflowingTable,
            targetKind: 'outside',
            type: 'wheel',
        })).toBe(false);
    });
});
