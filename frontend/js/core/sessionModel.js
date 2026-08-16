/**
 * Pure portable-session model.
 *
 * This module accepts and returns plain application values. It deliberately
 * knows nothing about Wails, the DOM, localStorage, timers, or mutable global
 * state.
 */

const PERSISTED_TAB_TYPES = new Set(['file', 'drawio', 'calendar']);

export function serializeSessionTabs(tabs) {
    return (Array.isArray(tabs) ? tabs : [])
        .filter(tab => tab && PERSISTED_TAB_TYPES.has(tab.type) && !tab.externalFileId)
        .map(tab => {
            const base = { id: tab.id, type: tab.type, title: tab.title };
            if (tab.type === 'file' || tab.type === 'drawio') base.path = tab.path;
            if (tab.type === 'calendar') base.dateStr = tab.dateStr;
            return base;
        });
}

/**
 * Legacy sessions may still contain the old synthetic Welcome tab. Ignore it:
 * the workspace overview is a view, not a serializable tab.
 */
export function restoreSessionTabs(tabs, pinnedTabs) {
    void pinnedTabs;
    return (Array.isArray(tabs) ? tabs : [])
        .filter(Boolean)
        .filter(tab => tab.id !== 'home' && tab.type !== 'home')
        .map(tab => ({ ...tab }));
}

export function restoredTabOpenArgs(tab) {
    if (!tab || typeof tab !== 'object') return null;

    if ((tab.type === 'file' || tab.type === 'drawio') && tab.path) {
        return {
            id: tab.id || tab.path,
            title: tab.title || tab.path.split('/').pop(),
            type: tab.type,
            data: { path: tab.path },
        };
    }
    if (tab.type === 'calendar' && tab.dateStr) {
        return {
            id: tab.id || `calendar-${tab.dateStr}`,
            title: tab.title || `Calendar: ${tab.dateStr}`,
            type: 'calendar',
            data: { dateStr: tab.dateStr },
        };
    }
    return null;
}

// Build the effect-free restoration plan used by startup. Tabs are recreated
// as metadata first, then exactly one selected tab is activated and read. A
// legacy session without a valid active id retains the established fallback
// of selecting its last restorable tab.
export function restoredWorkspacePlan(tabs, requestedActiveTabId) {
    const restoredTabs = restoreSessionTabs(tabs)
        .map(restoredTabOpenArgs)
        .filter(Boolean);
    const restoredIds = new Set(restoredTabs.map(tab => tab.id));
    const activeTabId = restoredIds.has(requestedActiveTabId)
        ? requestedActiveTabId
        : (restoredTabs.at(-1)?.id || null);
    return { tabs: restoredTabs, activeTabId };
}

export function normalizeSessionPayload(payload) {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object' || !Object.keys(payload).length) {
        return null;
    }

    const openTabs = restoreSessionTabs(payload.openTabs, payload.pinnedTabs);
    const restoredTabIds = new Set(openTabs.map(tab => tab.id));
    const selectedFilePath = payload.selectedFilePath || null;

    return {
        expandedDirs: Array.isArray(payload.expandedDirs) ? [...payload.expandedDirs] : [],
        selectedFilePath,
        selectedTreePath: payload.selectedTreePath || selectedFilePath,
        openTabs,
        pinnedTabs: Array.isArray(payload.pinnedTabs)
            ? payload.pinnedTabs.filter(tabId => restoredTabIds.has(tabId))
            : [],
        activeTabId: payload.activeTabId && restoredTabIds.has(payload.activeTabId)
            ? payload.activeTabId
            : null,
        cursorStates: payload.cursorStates && typeof payload.cursorStates === 'object'
            ? { ...payload.cursorStates }
            : null,
    };
}

export function buildSessionSnapshot(workspace) {
    const openTabs = serializeSessionTabs(workspace?.openTabs);
    const cursorStates = {};
    for (const tab of (Array.isArray(workspace?.openTabs) ? workspace.openTabs : [])) {
        if (tab?.type === 'file' && tab.cursorState) {
            cursorStates[tab.id] = tab.cursorState;
        }
    }

    return {
        openTabs,
        activeTabId: workspace?.activeTabId === 'home' ? null : (workspace?.activeTabId || null),
        selectedFilePath: workspace?.selectedFilePath || null,
        selectedTreePath: workspace?.selectedTreePath || null,
        expandedDirs: Array.isArray(workspace?.expandedDirs) ? [...workspace.expandedDirs] : [],
        pinnedTabs: (Array.isArray(workspace?.pinnedTabs) ? workspace.pinnedTabs : [])
            .filter(tabId => openTabs.some(tab => tab.id === tabId)),
        cursorStates,
        theme: workspace?.theme || 'default',
    };
}
