import {
    editorModalResizeKeyboardDelta,
    editorModalResizePlan,
    editorModalViewportPlan,
} from '../../../frontend/js/core/editorModalResizeModel.js';

describe('editor modal resize model', () => {
    test('clamps pointer-driven width and height independently', () => {
        expect(editorModalResizePlan({
            startWidth: 700,
            startHeight: 500,
            deltaX: 300,
            deltaY: -300,
            minimumWidth: 480,
            minimumHeight: 360,
            maximumWidth: 900,
            maximumHeight: 700,
        })).toEqual({ width: 900, height: 360 });
    });

    test('keeps a user-sized modal inside the viewport and yields to tiny windows', () => {
        expect(editorModalViewportPlan({
            left: 900,
            top: 700,
            width: 700,
            height: 500,
            viewportWidth: 1200,
            viewportHeight: 800,
        })).toEqual({ left: 476, top: 276, width: 700, height: 500 });

        expect(editorModalViewportPlan({
            left: 100,
            top: 100,
            width: 700,
            height: 500,
            viewportWidth: 400,
            viewportHeight: 300,
        })).toEqual({ left: 24, top: 24, width: 352, height: 252 });
    });

    test('maps only supported Arrow keys to resize deltas', () => {
        expect(editorModalResizeKeyboardDelta('ArrowLeft')).toEqual({ deltaX: -24, deltaY: 0 });
        expect(editorModalResizeKeyboardDelta('ArrowDown', 8)).toEqual({ deltaX: 0, deltaY: 8 });
        expect(editorModalResizeKeyboardDelta('Enter')).toBeNull();
    });
});
