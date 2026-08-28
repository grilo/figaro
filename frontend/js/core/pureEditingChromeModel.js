/**
 * Decide whether the shell can yield all non-document chrome to the edges.
 * Keep this rule independent from DOM layout so every workspace transition is
 * deterministic and can be covered without a browser.
 */
export function pureEditingChromeModel({
    sidebarCollapsed = false,
    activeTabId = null,
    openTabs = [],
} = {}) {
    const activeTab = Array.isArray(openTabs)
        ? openTabs.find(tab => tab?.id === activeTabId)
        : null;
    const active = Boolean(
        sidebarCollapsed
        && activeTab?.type === 'file'
    );

    return {
        active,
        activeTabType: activeTab?.type || null,
    };
}
