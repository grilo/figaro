import {
    activeTabScrollTarget,
    tabOverflowState,
} from '../frontend/js/core/tabOverflowModel.js';

describe('tab overflow model', () => {
    test('reports only the scroll directions that still contain hidden tabs', () => {
        expect(tabOverflowState({
            scrollSize: 600,
            viewportSize: 240,
            scrollOffset: 0,
        })).toEqual({
            overflow: true,
            canScrollStart: false,
            canScrollEnd: true,
            maxScroll: 360,
        });

        expect(tabOverflowState({
            scrollSize: 600,
            viewportSize: 240,
            scrollOffset: 360,
        })).toEqual({
            overflow: true,
            canScrollStart: true,
            canScrollEnd: false,
            maxScroll: 360,
        });
    });

    test('does not advertise overflow when every tab fits', () => {
        expect(tabOverflowState({
            scrollSize: 239,
            viewportSize: 240,
            scrollOffset: 0,
        })).toEqual({
            overflow: false,
            canScrollStart: false,
            canScrollEnd: false,
            maxScroll: 0,
        });
    });

    test('chooses the nearest offset that fully reveals the active tab', () => {
        expect(activeTabScrollTarget({
            currentScroll: 0,
            viewportStart: 10,
            viewportEnd: 250,
            tabStart: 330,
            tabEnd: 450,
            maxScroll: 360,
        })).toBe(200);

        expect(activeTabScrollTarget({
            currentScroll: 200,
            viewportStart: 10,
            viewportEnd: 250,
            tabStart: -190,
            tabEnd: -70,
            maxScroll: 360,
        })).toBe(0);
    });

    test('includes inverse tab junctions in the fully visible bounds', () => {
        expect(activeTabScrollTarget({
            currentScroll: 0,
            viewportStart: 0,
            viewportEnd: 200,
            tabStart: 300,
            tabEnd: 420,
            junctionInset: 8,
            maxScroll: 228,
        })).toBe(228);

        expect(activeTabScrollTarget({
            currentScroll: 220,
            viewportStart: 0,
            viewportEnd: 200,
            tabStart: -80,
            tabEnd: 60,
            junctionInset: 8,
            maxScroll: 220,
        })).toBe(132);
    });
});
