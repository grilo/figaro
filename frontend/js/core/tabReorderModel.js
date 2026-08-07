/**
 * Pure tab-reorder decisions. Pointer and persistence effects stay in the
 * tab-manager adapter so the ordering rules can be proved without a DOM.
 */

export function hasTabDragStarted({ startX, startY, currentX, currentY, threshold = 6 }) {
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    return (deltaX * deltaX) + (deltaY * deltaY) >= threshold * threshold;
}

export function reorderedTabs({ tabs = [], pinnedTabIds = [], tabId, targetTabId, placeAfter = false }) {
    const sourceIndex = tabs.findIndex(tab => tab.id === tabId);
    const targetIndex = tabs.findIndex(tab => tab.id === targetTabId);

    if (sourceIndex < 0 || targetIndex < 0 || tabId === targetTabId) return null;
    if (pinnedTabIds.includes(tabId) !== pinnedTabIds.includes(targetTabId)) return null;

    const reordered = [...tabs];
    const [moved] = reordered.splice(sourceIndex, 1);
    const targetAfterRemoval = reordered.findIndex(tab => tab.id === targetTabId);
    reordered.splice(targetAfterRemoval + (placeAfter ? 1 : 0), 0, moved);

    return reordered.every((tab, index) => tab.id === tabs[index].id) ? null : reordered;
}
