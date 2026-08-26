import { calendarWheelNavigationPlan } from '../frontend/js/core/calendarWheelModel.js';

describe('calendar wheel navigation model', () => {
    test('maps vertical wheel direction to adjacent months', () => {
        expect(calendarWheelNavigationPlan({ deltaY: 1, deltaMode: 1 }).monthOffset).toBe(1);
        expect(calendarWheelNavigationPlan({ deltaY: -1, deltaMode: 1 }).monthOffset).toBe(-1);
    });

    test('accumulates small trackpad deltas and resets on a direction change', () => {
        const first = calendarWheelNavigationPlan({ deltaY: 18 });
        expect(first).toEqual({ handled: true, accumulatedDeltaY: 18, monthOffset: 0 });
        expect(calendarWheelNavigationPlan({
            deltaY: 22,
            accumulatedDeltaY: first.accumulatedDeltaY,
        }).monthOffset).toBe(1);
        expect(calendarWheelNavigationPlan({
            deltaY: -20,
            accumulatedDeltaY: 18,
        }).accumulatedDeltaY).toBe(-20);
    });

    test('leaves horizontal and modified gestures to their native handlers', () => {
        expect(calendarWheelNavigationPlan({ deltaX: 80, deltaY: 10 }).handled).toBe(false);
        expect(calendarWheelNavigationPlan({ deltaY: 100, modified: true }).handled).toBe(false);
    });
});
