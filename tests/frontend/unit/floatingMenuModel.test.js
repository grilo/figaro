import { planFloatingMenuPlacement } from '../../../frontend/js/core/floatingMenuModel.js';

describe('floating menu placement', () => {
    test('lens help prefers the editor side, clamps height and falls back above or below in narrow windows', () => {
        const dimensions = { trigger: { top: 290, bottom: 318, left: 800, right: 828, width: 28 }, menuWidth: 360, menuHeight: 620, maximumHeight: 620, viewportWidth: 900, viewportHeight: 400, preferredPlacement: 'left' };
        expect(planFloatingMenuPlacement(dimensions)).toEqual({ top: 8, left: 434, width: 360, maxHeight: 384, placement: 'left' });
        expect(planFloatingMenuPlacement({ ...dimensions, viewportWidth: 360, trigger: { top: 290, bottom: 318, left: 304, right: 332, width: 28 } })).toEqual({ top: 8, left: 8, width: 344, maxHeight: 276, placement: 'top' });
    });
    test('opens below when the complete menu fits and clamps it to the viewport sides', () => {
        expect(planFloatingMenuPlacement({
            trigger: { top: 40, right: 230, bottom: 70, left: 180, width: 80 },
            menuHeight: 160,
            viewportWidth: 240,
            viewportHeight: 400,
        })).toEqual({
            top: 76,
            left: 152,
            width: 80,
            maxHeight: 160,
            placement: 'bottom',
        });
    });

    test('opens upward and limits its height when the trigger is near the bottom edge', () => {
        expect(planFloatingMenuPlacement({
            trigger: { top: 300, right: 220, bottom: 330, left: 120, width: 100 },
            menuHeight: 360,
            viewportWidth: 240,
            viewportHeight: 350,
        })).toEqual({
            top: 8,
            left: 120,
            width: 100,
            maxHeight: 286,
            placement: 'top',
        });
    });

    test('positions a popup wider than its trigger without crossing the viewport edge', () => {
        expect(planFloatingMenuPlacement({
            trigger: { top: 40, right: 220, bottom: 68, left: 192, width: 28 },
            menuWidth: 210,
            menuHeight: 84,
            viewportWidth: 240,
            viewportHeight: 300,
        })).toMatchObject({
            top: 74,
            left: 22,
            width: 210,
            maxHeight: 84,
            placement: 'bottom',
        });
    });
});
