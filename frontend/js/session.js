import { deferEditorWork, countEditorWork } from './editorDiagnostics.js';
import { backend } from './backend.js';
/**
 * Session Persistence - saves/loads UI state through the Wails backend API.
 * The backend keeps it in machine-local application data, outside the vault.
 */

import { log } from './log.js';
import { state, setState } from './state.js';
import { createSessionPersistence } from './usecases/sessionPersistence.js';
import { isDiskFullError } from './core/saveModel.js';
import { recordRuntimeFileIssue, resolveRuntimeFileIssue } from './fileIssues.js';

let scheduledSessionSave = null;
const sessionIssuePath = 'Workspace session';

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
        tabCursorStates: state.tabCursorStates,
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
    writeSession: async data => {
        countEditorWork('io.sessionWrite');
        const result = await backend().SaveSession(data);
        resolveRuntimeFileIssue(sessionIssuePath, ['disk_full']);
        return result;
    },
    readWorkspace,
    applySession: applyPortableSession,
    resetWorkspace: resetPortableWorkspaceState,
    reportFailure(operation, error) {
        log.warn(`Failed to ${operation} session:`, error);
        if (operation === 'save' && isDiskFullError(error)) {
            recordRuntimeFileIssue({
                path: sessionIssuePath,
                code: 'disk_full',
                severity: 'danger',
                title: 'Disk full — workspace state cannot be saved',
                detail: 'Figaro could not save its workspace state because the storage device is full. Note saves and Git history may fail too.',
                guidance: 'Free storage space before closing Figaro. Keep any notes with unsaved changes open until their saves succeed.',
            });
        }
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
 * Save the session, but never let a slow disk hold up quitting for longer
 * than `budgetMs`. Session state is recoverable; note saves are not affected.
 */
export function flushSessionWithin(budgetMs = 1500) {
    let timer;
    const expired = new Promise(resolve => { timer = setTimeout(resolve, budgetMs); });
    return Promise.race([saveSession(), expired]).finally(() => clearTimeout(timer));
}

/**
 * Cursor positions live in memory while navigating. Persist them when the
 * window loses focus or is hidden; tab changes and quitting save separately.
 */
export function installSessionFlush(target = window, doc = document) {
    const flush = () => { void saveSession(); };
    const onVisibility = () => { if (doc.visibilityState === 'hidden') flush(); };
    target.addEventListener('blur', flush);
    doc.addEventListener('visibilitychange', onVisibility);
    return () => {
        target.removeEventListener('blur', flush);
        doc.removeEventListener('visibilitychange', onVisibility);
    };
}

/**
 * File-tree navigation changes are infrequent; coalesce them into one write.
 */
export function scheduleSessionSave(delay = 350) {
    if (scheduledSessionSave !== null) clearTimeout(scheduledSessionSave);
    scheduledSessionSave = setTimeout(deferEditorWork('session', 'cursor persistence', () => {
        scheduledSessionSave = null;
        saveSession();
    }, 'debounce'), delay);
}
