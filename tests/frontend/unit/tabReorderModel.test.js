import { hasTabDragStarted, reorderedTabs } from '../../../frontend/js/core/tabReorderModel.js';

describe('tab reorder model', () => {
    const tabs = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];

    test('starts a drag only after the pointer clears the movement threshold', () => {
        expect(hasTabDragStarted({ startX: 10, startY: 10, currentX: 14, currentY: 13 })).toBe(false);
        expect(hasTabDragStarted({ startX: 10, startY: 10, currentX: 16, currentY: 10 })).toBe(true);
    });

    test('moves a tab before or after another tab', () => {
        expect(reorderedTabs({ tabs, pinnedTabIds: [], tabId: 'three', targetTabId: 'one' }))
            .toEqual([{ id: 'three' }, { id: 'one' }, { id: 'two' }]);
        expect(reorderedTabs({ tabs, pinnedTabIds: [], tabId: 'one', targetTabId: 'three', placeAfter: true }))
            .toEqual([{ id: 'two' }, { id: 'three' }, { id: 'one' }]);
    });

    test('rejects no-op moves and cross-pin-group moves', () => {
        expect(reorderedTabs({ tabs, pinnedTabIds: [], tabId: 'one', targetTabId: 'one' })).toBeNull();
        expect(reorderedTabs({ tabs, pinnedTabIds: ['one'], tabId: 'two', targetTabId: 'one' })).toBeNull();
    });
});
