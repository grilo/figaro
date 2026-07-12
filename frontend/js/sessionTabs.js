/**
 * Serializable workspace-tab helpers shared by localStorage and the vault
 * session. Keeping this contract in one place prevents the two persistence
 * layers from restoring different workspaces.
 */

const PERSISTED_TAB_TYPES = new Set(['file', 'drawio', 'calendar', 'home']);

export function serializeSessionTabs(tabs) {
    return (Array.isArray(tabs) ? tabs : [])
        .filter(tab => tab && PERSISTED_TAB_TYPES.has(tab.type))
        .map(tab => {
            const base = { id: tab.id, type: tab.type, title: tab.title };
            if (tab.type === 'file' || tab.type === 'drawio') base.path = tab.path;
            if (tab.type === 'calendar') base.dateStr = tab.dateStr;
            return base;
        });
}

/**
 * Older sessions omitted non-file tabs. If Welcome was pinned, restore it
 * even from one of those legacy sessions instead of leaving a dangling pin.
 */
export function restoreSessionTabs(tabs, pinnedTabs) {
    const restored = (Array.isArray(tabs) ? tabs : [])
        .filter(Boolean)
        .map(tab => ({ ...tab }));
    const hasWelcome = restored.some(tab => tab.id === 'home' || tab.type === 'home');

    if (Array.isArray(pinnedTabs) && pinnedTabs.includes('home') && !hasWelcome) {
        restored.unshift({ id: 'home', type: 'home', title: 'Welcome' });
    }

    return restored;
}

/**
 * Convert a persisted tab into the arguments needed by tabManager.openTab.
 * Keeping this mapping next to the persistence schema prevents a newly
 * serialized tab type (such as Draw.io) from being silently dropped during
 * startup restoration.
 */
export function restoredTabOpenArgs(tab) {
    if (!tab || typeof tab !== 'object') return null;

    if (tab.type === 'home') {
        return { id: 'home', title: tab.title || 'Welcome', type: 'home', data: {} };
    }
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
