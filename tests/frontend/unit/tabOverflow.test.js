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
});
