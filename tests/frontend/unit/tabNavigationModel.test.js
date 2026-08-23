import { boundedAdjacentTabId } from '../frontend/js/core/tabNavigationModel.js';

describe('bounded tab navigation model', () => {
    const tabIds = ['one', 'two', 'three'];

    test('moves one tab in either direction and stops at both ends', () => {
        expect(boundedAdjacentTabId({
            tabIds,
            activeTabId: 'two',
            direction: 1,
        })).toBe('three');
        expect(boundedAdjacentTabId({
            tabIds,
            activeTabId: 'two',
            direction: -1,
        })).toBe('one');
        expect(boundedAdjacentTabId({
            tabIds,
            activeTabId: 'three',
            direction: 1,
        })).toBeNull();
        expect(boundedAdjacentTabId({
            tabIds,
            activeTabId: 'one',
            direction: -1,
        })).toBeNull();
    });

    test('enters from the requested boundary when no active tab is represented', () => {
        expect(boundedAdjacentTabId({
            tabIds,
            activeTabId: 'missing',
            direction: 1,
        })).toBe('one');
        expect(boundedAdjacentTabId({
            tabIds,
            activeTabId: null,
            direction: -1,
        })).toBe('three');
        expect(boundedAdjacentTabId({ tabIds: [], direction: 1 })).toBeNull();
    });
});
