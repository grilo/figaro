import { backend } from './backend.js';
/**
 * Session Persistence - saves/loads UI state through the Wails backend API
 * Stores to vault/.config/session.json
 */

import { log } from './log.js';
import { state, setState } from './state.js';
import { createSessionPersistence } from './usecases/sessionPersistence.js';

let scheduledSessionSave = null;

function resetPortableWorkspaceState() {
    // localStorage is only a webview-local recovery cache. The vault session
    // is authoritative for tabs and file-tree state, so a missing or repaired
    // session must not resurrect stale paths from an older vault view.
    setState('expandedDirs', new Set());
    setState('selectedFilePath', null);
    setState('selectedTreePath', null);
    setState('selectedTreePaths', []);
    setState('pinnedTabs', []);
    setState('activeTabId', null);
    setState('openTabs', []);
    state._restoredTabs = null;
    state._restoredActiveTabId = null;
    state._restoredCursorStates = null;
}

function readWorkspace() {
    return {
        openTabs: state.openTabs,
        activeTabId: state.activeTabId,
        selectedFilePath: state.selectedFilePath,
        selectedTreePath: state.selectedTreePath,
        expandedDirs: state.expandedDirs instanceof Set ? [...state.expandedDirs] : [],
        pinnedTabs: state.pinnedTabs,
        theme: state._currentTheme,
    };
}

function applyPortableSession(session) {
    setState('expandedDirs', new Set(session.expandedDirs));
    setState('selectedFilePath', session.selectedFilePath);
    setState('selectedTreePath', session.selectedTreePath);
    setState('pinnedTabs', session.pinnedTabs);
    if (session.openTabs.length) state._restoredTabs = session.openTabs;
    if (session.activeTabId) state._restoredActiveTabId = session.activeTabId;
    if (session.cursorStates) state._restoredCursorStates = session.cursorStates;
}

const persistence = createSessionPersistence({
    readSession: () => backend().LoadSession(),
    writeSession: data => backend().SaveSession(data),
    readWorkspace,
    applySession: applyPortableSession,
    resetWorkspace: resetPortableWorkspaceState,
    reportFailure(operation, error) {
        log.warn(`Failed to ${operation} session:`, error);
    },
});

/**
 * Load session state from backend and apply to app state.
 * Called once after backend bridge is ready.
 */
export function loadSession() {
    return persistence.load();
}

/**
 * Save current session state to backend.
 */
export function saveSession() {
    return persistence.save();
}

/**
 * Cursor movement is frequent, but its current position must still survive a
 * restart. Coalesce nearby movements into one portable session write.
 */
export function scheduleSessionSave(delay = 350) {
    if (scheduledSessionSave !== null) clearTimeout(scheduledSessionSave);
    scheduledSessionSave = setTimeout(() => {
        scheduledSessionSave = null;
        saveSession();
    }, delay);
}
