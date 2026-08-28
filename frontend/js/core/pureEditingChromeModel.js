/**
 * Decide whether the shell can yield all non-document chrome to the edges.
 * Keep this rule independent from DOM layout so every workspace transition is
 * deterministic and can be covered without a browser.
 */
export function pureEditingChromeModel({
    enabled = false,
    sidebarCollapsed = false,
    activeTabId = null,
    openTabs = [],
    detailsPaneOpen = false,
} = {}) {
    const activeTab = Array.isArray(openTabs)
        ? openTabs.find(tab => tab?.id === activeTabId)
        : null;
    const active = Boolean(
        enabled
        && sidebarCollapsed
        && activeTab?.type === 'file'
        && !detailsPaneOpen
    );

    return {
        active,
        activeTabType: activeTab?.type || null,
    };
}
