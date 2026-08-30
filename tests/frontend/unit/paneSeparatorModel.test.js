import { paneSeparatorKeyboardPlan } from '../frontend/js/core/paneSeparatorModel.js';

describe('pane separator keyboard model', () => {
    test('moves in quiet and accelerated steps while clamping to pane bounds', () => {
        expect(paneSeparatorKeyboardPlan({
            key: 'ArrowRight', width: 280, minimum: 225, maximum: 500,
        })).toEqual({ handled: true, width: 288 });
        expect(paneSeparatorKeyboardPlan({
            key: 'ArrowLeft', width: 280, minimum: 225, maximum: 500, shiftKey: true,
        })).toEqual({ handled: true, width: 248 });
        expect(paneSeparatorKeyboardPlan({
            key: 'Home', width: 280, minimum: 225, maximum: 500,
        })).toEqual({ handled: true, width: 225 });
        expect(paneSeparatorKeyboardPlan({
            key: 'End', width: 280, minimum: 225, maximum: 500,
        })).toEqual({ handled: true, width: 500 });
    });

    test('inverts horizontal arrows for a pane mounted on the right', () => {
        expect(paneSeparatorKeyboardPlan({
            key: 'ArrowLeft', width: 320, minimum: 240, maximum: 480,
            increaseOnArrowRight: false,
        })).toEqual({ handled: true, width: 328 });
        expect(paneSeparatorKeyboardPlan({
            key: 'ArrowRight', width: 320, minimum: 240, maximum: 480,
            increaseOnArrowRight: false,
        })).toEqual({ handled: true, width: 312 });
    });

    test('leaves unrelated keys to their normal behavior', () => {
        expect(paneSeparatorKeyboardPlan({
            key: 'Enter', width: 280, minimum: 225, maximum: 500,
        })).toEqual({ handled: false, width: 280 });
    });
});
