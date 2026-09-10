/**
 * Return the next tab in one direction without crossing either end of the
 * visible tab order. A missing active tab enters from the nearest boundary.
 */
export function boundedAdjacentTabId({
    tabIds = [],
    activeTabId = null,
    direction = 0,
} = {}) {
    const ids = Array.isArray(tabIds) ? tabIds.filter(Boolean) : [];
    const step = Math.sign(Number(direction) || 0);
    if (!ids.length || step === 0) return null;

    const activeIndex = ids.indexOf(activeTabId);
    if (activeIndex < 0) return ids[step > 0 ? 0 : ids.length - 1];

    const targetIndex = activeIndex + step;
    if (targetIndex < 0 || targetIndex >= ids.length) return null;
    return ids[targetIndex];
}

/** Choose the surviving tab and consume activation history without effects. */
export function tabCloseNavigationPlan({ closingTabId, remainingTabs, activationHistory, useFallback = true }) {
    if (!remainingTabs.length) return { tabId: null, activationHistory: [] };
    const history = [...activationHistory];
    const openIds = new Set(remainingTabs.map(tab => tab.id));
    while (history.length) {
        const tabId = history.pop();
        if (tabId !== closingTabId && openIds.has(tabId)) {
            return { tabId, activationHistory: history };
        }
    }
    return {
        tabId: useFallback ? (remainingTabs.find(tab => tab.type === 'file')?.id || remainingTabs[0].id) : null,
        activationHistory: history,
    };
}
