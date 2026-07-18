import { backend } from './backend.js';
/**
 * Session Persistence - saves/loads UI state through the Wails backend API
 * Stores to vault/.config/session.json
 */

import { log } from './log.js';
import { state, setState } from './state.js';
import { restoreSessionTabs, serializeSessionTabs } from './sessionTabs.js';

let sessionSaveQueue = Promise.resolve();

function resetPortableWorkspaceState() {
    // localStorage is only a webview-local recovery cache. The vault session
    // is authoritative for tabs and file-tree state, so a missing or repaired
    // session must not resurrect stale paths from an older vault view.
    setState('expandedDirs', new Set());
    setState('selectedFilePath', null);
    setState('selectedTreePath', null);
    setState('selectedFilePaths', []);
    setState('pinnedTabs', []);
    setState('activeTabId', null);
    setState('openTabs', []);
    state._restoredTabs = null;
    state._restoredActiveTabId = null;
    state._restoredCursorStates = null;
}

/**
 * Load session state from backend and apply to app state
 * Called once after backend bridge is ready
 */
export async function loadSession() {
    try {
        const session = await backend().LoadSession();
        resetPortableWorkspaceState();
        if (!session || Array.isArray(session) || !Object.keys(session).length) return false;

        // Restore expanded directories
        if (session.expandedDirs && Array.isArray(session.expandedDirs)) {
            setState('expandedDirs', new Set(session.expandedDirs));
        }

        // Restore selected file
        if (session.selectedFilePath) {
            setState('selectedFilePath', session.selectedFilePath);
        }
        // Older sessions only stored the active file. Use it as the initial
        // tree focus until a dedicated file-or-folder selection is saved.
        if (session.selectedTreePath || session.selectedFilePath) {
            setState('selectedTreePath', session.selectedTreePath || session.selectedFilePath);
        }

        // Restore pinned tabs
        // Store tabs for restore after file tree loads. The normalizer drops
        // legacy synthetic Welcome tabs because the overview is un-tabbed.
        const restoredTabs = restoreSessionTabs(session.openTabs, session.pinnedTabs);
        const restoredTabIds = new Set(restoredTabs.map(tab => tab.id));
        if (session.pinnedTabs && Array.isArray(session.pinnedTabs)) {
            setState('pinnedTabs', session.pinnedTabs.filter(tabId => restoredTabIds.has(tabId)));
        }
        if (restoredTabs.length) state._restoredTabs = restoredTabs;
        if (session.activeTabId && restoredTabIds.has(session.activeTabId)) {
            state._restoredActiveTabId = session.activeTabId;
        }

        // Store cursor states
        if (session.cursorStates) {
            state._restoredCursorStates = session.cursorStates;
        }

        return true;
    } catch (e) {
        resetPortableWorkspaceState();
        log.warn('Failed to load session:', e);
        return false;
    }
}

/**
 * Save current session state to backend
 */
export function saveSession() {
    const expandedDirs = state.expandedDirs instanceof Set
        ? [...state.expandedDirs]
        : [];
    const openTabs = serializeSessionTabs(state.openTabs);

    // Collect cursor states from open tabs
    const cursorStates = {};
    for (const t of (state.openTabs || [])) {
        if (t.type === 'file' && t.cursorState) {
            cursorStates[t.id] = t.cursorState;
        }
    }

    const data = {
        openTabs,
        activeTabId: state.activeTabId === 'home' ? null : (state.activeTabId || null),
        selectedFilePath: state.selectedFilePath || null,
        selectedTreePath: state.selectedTreePath || null,
        expandedDirs,
        pinnedTabs: (state.pinnedTabs || []).filter(tabId => openTabs.some(tab => tab.id === tabId)),
        cursorStates,
        theme: state._currentTheme || 'default',
    };

    // Tab changes deliberately fire this without awaiting it. Queue snapshots
    // so the backend never receives an older write after a newer one.
    sessionSaveQueue = sessionSaveQueue
        .then(() => backend().SaveSession(data))
        .catch((e) => {
            log.warn('Failed to save session:', e);
        });
    return sessionSaveQueue;
}

export default { loadSession, saveSession };
