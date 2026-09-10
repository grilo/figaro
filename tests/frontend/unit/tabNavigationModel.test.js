import { boundedAdjacentTabId, tabCloseNavigationPlan } from '../frontend/js/core/tabNavigationModel.js';

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

describe('tab activation after closing or deleting a file', () => {
    test('workspace toggling can return Home without a history target even with other tabs open', () => {
        expect(tabCloseNavigationPlan({
            closingTabId: 'graph',
            remainingTabs: [{ id: 'graph', type: 'graph' }, { id: 'note', type: 'file' }],
            activationHistory: ['missing', 'graph'],
            useFallback: false,
        })).toEqual({ tabId: null, activationHistory: [] });
    });

    test('returns the most recent surviving ID and remaining history without mutating inputs', () => {
        const activationHistory = Object.freeze(['second', 'third', 'deleted-child', 'first']);
        const remainingTabs = Object.freeze([
            { id: 'second', type: 'file' }, { id: 'third', type: 'file' },
        ]);
        expect(tabCloseNavigationPlan({ closingTabId: 'first', remainingTabs, activationHistory }))
            .toEqual({ tabId: 'third', activationHistory: ['second'] });
        expect(activationHistory).toEqual(['second', 'third', 'deleted-child', 'first']);
    });

    test.each([
        [[{ id: 'settings', type: 'settings' }, { id: 'note', type: 'file' }], 'note'],
        [[{ id: 'settings', type: 'settings' }, { id: 'graph', type: 'graph' }], 'settings'],
        [[], null],
    ])('falls back to a surviving file, then another tab, then Home (%j)', (remainingTabs, tabId) => {
        expect(tabCloseNavigationPlan({
            closingTabId: 'deleted', remainingTabs, activationHistory: ['missing', 'deleted'],
        })).toEqual({ tabId, activationHistory: [] });
    });
});
