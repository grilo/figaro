import { sidebarLayoutPlan } from '../../../frontend/js/core/sidebarLayoutModel.js';

describe('sidebar title-bar layout model', () => {
    test('uses the expanded sidebar width as the visible title-bar boundary', () => {
        expect(sidebarLayoutPlan({ expandedWidth: 344 })).toEqual({
            collapsed: false,
            expandedWidth: 344,
            visibleWidth: 344,
            minimumVisibleWidth: 225,
        });
    });

    test('keeps the expanded width while exposing the compact rail boundary', () => {
        expect(sidebarLayoutPlan({ collapsed: true, expandedWidth: 344 })).toEqual({
            collapsed: true,
            expandedWidth: 344,
            visibleWidth: 44,
            minimumVisibleWidth: 44,
        });
    });

    test.each([
        [120, 225],
        [800, 500],
        [Number.NaN, 280],
    ])('normalizes an expanded width of %s to %s', (requested, expected) => {
        expect(sidebarLayoutPlan({ expandedWidth: requested }).expandedWidth).toBe(expected);
    });
});
