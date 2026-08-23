import { wheelTabNavigationPlan } from '../frontend/js/core/tabWheelModel.js';

describe('tab wheel navigation model', () => {
    const tabIds = ['one', 'two', 'three'];

    test('cycles in wheel direction and stops at both ends', () => {
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'three',
            deltaY: 100,
        }).targetTabId).toBeNull();
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'one',
            deltaY: -100,
        }).targetTabId).toBeNull();
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'two',
            deltaY: 100,
        }).targetTabId).toBe('three');
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'two',
            deltaY: -100,
        }).targetTabId).toBe('one');
    });

    test('accumulates small pixel deltas and resets when direction changes', () => {
        const first = wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'one',
            deltaY: 18,
        });
        expect(first).toEqual({
            handled: true,
            accumulatedDeltaY: 18,
            targetTabId: null,
        });
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'one',
            deltaY: 22,
            accumulatedDeltaY: first.accumulatedDeltaY,
        }).targetTabId).toBe('two');
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'two',
            deltaY: -20,
            accumulatedDeltaY: 18,
        }).accumulatedDeltaY).toBe(-20);
    });

    test('advances on one line-mode notch and ignores horizontal or modified input', () => {
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'two',
            deltaY: 1,
            deltaMode: 1,
        }).targetTabId).toBe('three');
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'two',
            deltaX: 80,
            deltaY: 10,
        }).handled).toBe(false);
        expect(wheelTabNavigationPlan({
            tabIds,
            activeTabId: 'two',
            deltaY: 100,
            modified: true,
        }).handled).toBe(false);
    });
});
