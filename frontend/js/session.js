/**
 * Session Persistence - saves/loads UI state through the Wails backend API
 * Stores to vault/.config/session.json
 */

import { log } from './log.js';
import { state } from './state.js';
import { restoreSessionTabs, serializeSessionTabs } from './sessionTabs.js';

let sessionSaveQueue = Promise.resolve();

/**
 * Load session state from backend and apply to app state
 * Called once after backend bridge is ready
 */
export async function loadSession() {
    try {
        const session = await window.pywebview.api.load_session();
        if (!session || !Object.keys(session).length) return false;

        // Restore expanded directories
        if (session.expandedDirs && Array.isArray(session.expandedDirs)) {
            state.expandedDirs = new Set(session.expandedDirs);
        }

        // Restore selected file
        if (session.selectedFilePath) {
            state.selectedFilePath = session.selectedFilePath;
        }

        // Restore pinned tabs
        if (session.pinnedTabs && Array.isArray(session.pinnedTabs)) {
            state.pinnedTabs = session.pinnedTabs;
        }

        // Store tabs for restore after file tree loads. The normalizer also
        // repairs legacy sessions that pinned Welcome before home tabs were
        // included in the serialized tab list.
        const restoredTabs = restoreSessionTabs(session.openTabs, state.pinnedTabs);
        if (restoredTabs.length) state._restoredTabs = restoredTabs;
        if (session.activeTabId) {
            state._restoredActiveTabId = session.activeTabId;
        }

        // Store cursor states
        if (session.cursorStates) {
            state._restoredCursorStates = session.cursorStates;
        }

        return true;
    } catch (e) {
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
        activeTabId: state.activeTabId || null,
        selectedFilePath: state.selectedFilePath || null,
        expandedDirs,
        pinnedTabs: state.pinnedTabs || [],
        cursorStates,
        theme: state._currentTheme || 'default',
    };

    // Tab changes deliberately fire this without awaiting it. Queue snapshots
    // so the backend never receives an older write after a newer one.
    sessionSaveQueue = sessionSaveQueue
        .then(() => window.pywebview.api.save_session(data))
        .catch((e) => {
            log.warn('Failed to save session:', e);
        });
    return sessionSaveQueue;
}

export default { loadSession, saveSession };
