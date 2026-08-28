/**
 * Shared Reactive State Management
 * Single source of truth for application state
 */

import { log } from './log.js';
import { restoreSessionTabs, serializeSessionTabs } from './sessionTabs.js';
import { createLocalStateStorage } from './adapters/localStateStorage.js';

const stateStorage = createLocalStateStorage();
export const state = {
    // Editor
    editorView: null,           // CodeMirror EditorView instance
    activeFilePath: null,       // Currently open file path (vault-relative)
    activeFileMtime: null,      // File modification time for conflict detection
    isDirty: false,             // Unsaved changes flag
    
    // UI State
    sidebarWidth: 280,          // Left sidebar width
    rightSidebarWidth: 320,     // Right sidebar width
    sidebarCollapsed: false,    // Left sidebar collapsed state
    rightSidebarCollapsed: false, // Right sidebar collapsed state
    showEditorBreadcrumbs: false, // Optional vault-relative path above the editor
    pureTypewriterEnabled: true, // Smooth caret anchoring while typing in Pure mode
    pureFocusScope: 'off',       // off | phrase | paragraph
    pureAdaptiveTypographyEnabled: false, // Stable responsive type bands in Pure mode
    
    // Calendar
    currentCalDate: new Date(), // Current calendar month view
    selectedCalDateStr: null,   // Current-session selected date (YYYY-MM-DD)
    
    // Tabs
    openTabs: [],               // Array of tab objects: { id, type, path, title, dirty, data }
    activeTabId: null,          // Currently active tab ID
    nextTabId: 1,               // Auto-incrementing tab ID
    
    // File Tree
    fileTreeData: null,         // Cached file tree structure
    expandedDirs: new Set(),    // Set of expanded directory paths
    selectedFilePath: null,     // Active file/Draw.io tab; owns non-visual tree aria-current
    selectedTreePath: null,     // Independent roving-focus path (file or directory)
    selectedTreePaths: [],      // Selected internal file-tree paths (for actions/merge)
    externalFileTreeEntries: [], // Process-local launch documents kept outside the vault
    
    // Search
    searchQuery: '',            // Current search query
    searchCaseSensitive: false, // Case sensitive search flag
    searchResults: [],          // Current search results
    searchActiveFile: null,     // Currently expanded search result file
    searchFilters: {            // Search view options, retained while navigating
        titleOnly: false,
        recentOnly: false,
        caseSensitive: false
    },
    
    // Kanban
    kanbanColumns: [],          // Available Kanban columns, including dirty-buffer discoveries
    kanbanCompletionColumns: ['todo', 'wip', 'done'], // Stable saved vocabulary for hashtag completion
    kanbanBoardData: {},        // Kanban board data by column
    kanbanFocusColumn: null,    // Column to highlight on render
    kanbanDensity: 'comfortable', // Comfortable | compact card density
    kanbanLayout: 'side-by-side', // Side-by-side | stacked board columns

    // Backlinks
    backlinksData: [],          // Backlinks for current file
    backlinksTargetPath: null,  // Target file path for backlinks
    
    // Context Menu
    contextTargetType: 'root',  // 'file' | 'directory' | 'root'
    contextTargetPath: '',      // Path for context menu target
    contextTargetExternalFileId: '', // Opaque launch capability for an external root entry

    // Pinned Tabs
    pinnedTabs: [],             // Array of pinned tab IDs (persisted)
    recentFiles: [],            // Recently visited notes for the workspace overview
    _restoredTabs: null,
    _restoredActiveTabId: null,
    _restoredCursorStates: null,
    
    // Global Search
    globalSearchQuery: '',      // Global search query
    globalSearchResults: [],    // Global search results
    globalSearchActiveFile: null, // Expanded file in global search
    searchSuggestion: '',       // Optional low-result query correction
};

// Reactive subscribers
const subscribers = new Map();

/**
 * Subscribe to state changes
 * @param {string} key - State key to watch
 * @param {Function} callback - Called with (newValue, oldValue)
 * @returns {Function} Unsubscribe function
 */
export function subscribe(key, callback) {
    if (!subscribers.has(key)) {
        subscribers.set(key, new Set());
    }
    subscribers.get(key).add(callback);
    return () => subscribers.get(key).delete(callback);
}

/**
 * Notify subscribers of state change
 * @param {string} key - State key
 * @param {*} newValue - New value
 * @param {*} oldValue - Old value
 */
function notify(key, newValue, oldValue) {
    if (subscribers.has(key)) {
        subscribers.get(key).forEach(cb => {
            try {
                cb(newValue, oldValue);
            } catch (e) {
                log.error(`State subscriber error for ${key}:`, e);
            }
        });
    }
}

/**
 * Set state value with notification
 * @param {string} key - State key
 * @param {*} value - New value
 */
export function setState(key, value) {
    const oldValue = state[key];
    if (oldValue !== value) {
        state[key] = value;
        notify(key, value, oldValue);
    }
}

/**
 * Get state value
 * @param {string} key - State key
 * @returns {*} Current value
 */
export function getState(key) {
    return state[key];
}

/**
 * Keep a compact, de-duplicated list of recently visited notes.
 */
export function recordRecentFile(path, title = '') {
    if (!path) return;

    const current = Array.isArray(state.recentFiles) ? state.recentFiles : [];
    const next = [
        { path, title: title || path.split('/').pop() || path },
        ...current.filter(item => item.path !== path)
    ].slice(0, 8);

    setState('recentFiles', next);
}

/**
 * Update nested state property
 * @param {string} key - State key (object)
 * @param {string} prop - Property name
 * @param {*} value - New value
 */
export function setStateProp(key, prop, value) {
    const obj = state[key];
    if (obj && typeof obj === 'object') {
        const newObj = { ...obj, [prop]: value };
        setState(key, newObj);
    }
}

/**
 * Toggle boolean state
 * @param {string} key - State key
 */
export function toggleState(key) {
    setState(key, !state[key]);
}

/**
 * Initialize state with persisted values (if any)
 */
export function initState() {
    if (!stateStorage.available()) {
        log.warn('localStorage not available, skipping state persistence');
        return;
    }

    // Restore sidebar widths from localStorage
    const savedSidebar = stateStorage.read('sidebarWidth');
    if (savedSidebar) state.sidebarWidth = parseInt(savedSidebar, 10);
    
    const savedRightSidebar = stateStorage.read('rightSidebarWidth');
    if (savedRightSidebar) state.rightSidebarWidth = parseInt(savedRightSidebar, 10);

    state.sidebarCollapsed = stateStorage.read('sidebarCollapsed') === 'true';
    state.showEditorBreadcrumbs = stateStorage.read('showEditorBreadcrumbs') === 'true';
    stateStorage.remove('pureEditingChromeEnabled');
    const savedPureTypewriter = stateStorage.read('pureTypewriterEnabled');
    state.pureTypewriterEnabled = savedPureTypewriter === null
        ? true
        : savedPureTypewriter === 'true';
    const savedPureFocusScope = stateStorage.read('pureFocusScope');
    state.pureFocusScope = ['off', 'phrase', 'paragraph'].includes(savedPureFocusScope)
        ? savedPureFocusScope
        : 'off';
    state.pureAdaptiveTypographyEnabled = stateStorage.read('pureAdaptiveTypographyEnabled') === 'true';
    
    // Restore expanded directories
    const savedExpanded = stateStorage.read('expandedDirs');
    if (savedExpanded) {
        try {
            state.expandedDirs = new Set(JSON.parse(savedExpanded));
        } catch (e) {
            log.warn('Failed to parse expanded dirs:', e);
        }
    }
    
    // Calendar selection is intentionally process-local. Remove the legacy
    // cross-session value so every new app session begins on Today.
    stateStorage.remove('selectedCalDate');

    // Restore pinned tabs. Stale pins are pruned after the tab snapshot is
    // normalized below.
    const savedPinned = stateStorage.read('pinnedTabs');
    if (savedPinned) {
        try {
            const pinnedTabs = JSON.parse(savedPinned);
            if (Array.isArray(pinnedTabs)) state.pinnedTabs = pinnedTabs;
        } catch (e) { /* noop */ }
    }

    const savedRecentFiles = stateStorage.read('recentFiles');
    if (savedRecentFiles) {
        try {
            const recentFiles = JSON.parse(savedRecentFiles);
            if (Array.isArray(recentFiles)) state.recentFiles = recentFiles.slice(0, 8);
        } catch (e) { /* noop */ }
    }

    const savedSearchFilters = stateStorage.read('searchFilters');
    if (savedSearchFilters) {
        try {
            state.searchFilters = { ...state.searchFilters, ...JSON.parse(savedSearchFilters) };
        } catch (e) { /* noop */ }
    }

    const savedKanbanDensity = stateStorage.read('kanbanDensity');
    if (savedKanbanDensity === 'compact' || savedKanbanDensity === 'comfortable') {
        state.kanbanDensity = savedKanbanDensity;
    }
    const savedKanbanLayout = stateStorage.read('kanbanLayout');
    if (savedKanbanLayout === 'side-by-side' || savedKanbanLayout === 'stacked') {
        state.kanbanLayout = savedKanbanLayout;
    }

    // Restore last selected file
    const savedSelectedFile = stateStorage.read('selectedFilePath');
    if (savedSelectedFile) {
        state.selectedFilePath = savedSelectedFile;
    }
    const savedSelectedTreePath = stateStorage.read('selectedTreePath');
    if (savedSelectedTreePath) {
        state.selectedTreePath = savedSelectedTreePath;
    }

    // Store open tabs for later restoration (after file tree is loaded)
    const savedOpenTabs = stateStorage.read('openTabs');
    if (savedOpenTabs) {
        try { state._restoredTabs = restoreSessionTabs(JSON.parse(savedOpenTabs), state.pinnedTabs); } catch (e) { /* noop */ }
    } else {
        const restoredTabs = restoreSessionTabs([], state.pinnedTabs);
        if (restoredTabs.length) state._restoredTabs = restoredTabs;
    }
    const restoredTabIds = new Set((state._restoredTabs || []).map(tab => tab.id));
    state.pinnedTabs = state.pinnedTabs.filter(tabId => restoredTabIds.has(tabId));
    const savedActiveTabId = stateStorage.read('activeTabId');
    if (savedActiveTabId && restoredTabIds.has(savedActiveTabId)) {
        state._restoredActiveTabId = savedActiveTabId;
    }
}

/**
 * Persist state to localStorage
 */
export function persistState() {
    if (!stateStorage.available()) {
        log.warn('localStorage not available, skipping persist');
        return;
    }
    
    stateStorage.write('sidebarWidth', state.sidebarWidth.toString());
    stateStorage.write('rightSidebarWidth', state.rightSidebarWidth.toString());
    stateStorage.write('sidebarCollapsed', String(state.sidebarCollapsed));
    stateStorage.write('showEditorBreadcrumbs', String(state.showEditorBreadcrumbs));
    stateStorage.write('pureTypewriterEnabled', String(state.pureTypewriterEnabled));
    stateStorage.write('pureFocusScope', state.pureFocusScope);
    stateStorage.write('pureAdaptiveTypographyEnabled', String(state.pureAdaptiveTypographyEnabled));
    stateStorage.write('expandedDirs', JSON.stringify([...state.expandedDirs]));
    const serializable = serializeSessionTabs(state.openTabs);
    stateStorage.write('pinnedTabs', JSON.stringify(state.pinnedTabs.filter(tabId => serializable.some(tab => tab.id === tabId))));
    stateStorage.write('recentFiles', JSON.stringify(state.recentFiles));
    stateStorage.write('searchFilters', JSON.stringify(state.searchFilters));
    stateStorage.write('kanbanDensity', state.kanbanDensity);
    stateStorage.write('kanbanLayout', state.kanbanLayout);
    stateStorage.write('openTabs', JSON.stringify(serializable));
    if (state.activeTabId && serializable.some(tab => tab.id === state.activeTabId)) {
        stateStorage.write('activeTabId', state.activeTabId);
    } else {
        stateStorage.remove('activeTabId');
    }
    stateStorage.remove('selectedCalDate');
    if (state.selectedTreePath) {
        stateStorage.write('selectedTreePath', state.selectedTreePath);
    } else {
        stateStorage.remove('selectedTreePath');
    }
}

// Auto-persist on changes
subscribe('sidebarWidth', persistState);
subscribe('rightSidebarWidth', persistState);
subscribe('sidebarCollapsed', () => {
    try { stateStorage.write('sidebarCollapsed', String(state.sidebarCollapsed)); } catch (e) { /* noop */ }
});
subscribe('showEditorBreadcrumbs', () => {
    try { stateStorage.write('showEditorBreadcrumbs', String(state.showEditorBreadcrumbs)); } catch (e) { /* noop */ }
});
subscribe('pureTypewriterEnabled', () => {
    try { stateStorage.write('pureTypewriterEnabled', String(state.pureTypewriterEnabled)); } catch (e) { /* noop */ }
});
subscribe('pureFocusScope', () => {
    try { stateStorage.write('pureFocusScope', state.pureFocusScope); } catch (e) { /* noop */ }
});
subscribe('pureAdaptiveTypographyEnabled', () => {
    try { stateStorage.write('pureAdaptiveTypographyEnabled', String(state.pureAdaptiveTypographyEnabled)); } catch (e) { /* noop */ }
});
subscribe('expandedDirs', () => {
    try { stateStorage.write('expandedDirs', JSON.stringify([...state.expandedDirs])); } catch (e) { /* noop */ }
});
subscribe('pinnedTabs', () => {
    try {
        const serializable = serializeSessionTabs(state.openTabs);
        stateStorage.write('pinnedTabs', JSON.stringify(state.pinnedTabs.filter(tabId => serializable.some(tab => tab.id === tabId))));
    } catch (e) { /* noop */ }
});
subscribe('recentFiles', () => {
    try { stateStorage.write('recentFiles', JSON.stringify(state.recentFiles)); } catch (e) { /* noop */ }
});
subscribe('searchFilters', () => {
    try { stateStorage.write('searchFilters', JSON.stringify(state.searchFilters)); } catch (e) { /* noop */ }
});
subscribe('kanbanDensity', () => {
    try { stateStorage.write('kanbanDensity', state.kanbanDensity); } catch (e) { /* noop */ }
});
subscribe('kanbanLayout', () => {
    try { stateStorage.write('kanbanLayout', state.kanbanLayout); } catch (e) { /* noop */ }
});
subscribe('selectedFilePath', () => {
    try {
        if (state.selectedFilePath) {
            stateStorage.write('selectedFilePath', state.selectedFilePath);
        } else {
            stateStorage.remove('selectedFilePath');
        }
    } catch (e) { /* noop */ }
});
subscribe('selectedTreePath', () => {
    try {
        if (state.selectedTreePath) {
            stateStorage.write('selectedTreePath', state.selectedTreePath);
        } else {
            stateStorage.remove('selectedTreePath');
        }
    } catch (e) { /* noop */ }
});
subscribe('openTabs', () => {
    try {
        const serializable = serializeSessionTabs(state.openTabs);
        stateStorage.write('openTabs', JSON.stringify(serializable));
        if (state.activeTabId) {
            stateStorage.write('activeTabId', state.activeTabId);
        } else {
            stateStorage.remove('activeTabId');
        }
    } catch (e) { /* noop */ }
});
subscribe('activeTabId', () => {
    try {
        if (state.activeTabId) {
            stateStorage.write('activeTabId', state.activeTabId);
        } else {
            stateStorage.remove('activeTabId');
        }
    } catch (e) { /* noop */ }
});

export default state;
