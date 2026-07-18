/**
 * Shared Reactive State Management
 * Single source of truth for application state
 */

import { log } from './log.js';
import { restoreSessionTabs, serializeSessionTabs } from './sessionTabs.js';
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
    
    // Calendar
    currentCalDate: new Date(), // Current calendar month view
    selectedCalDateStr: null,   // Selected date string (YYYY-MM-DD)
    
    // Tabs
    openTabs: [],               // Array of tab objects: { id, type, path, title, dirty, data }
    activeTabId: null,          // Currently active tab ID
    nextTabId: 1,               // Auto-incrementing tab ID
    
    // File Tree
    fileTreeData: null,         // Cached file tree structure
    expandedDirs: new Set(),    // Set of expanded directory paths
    selectedFilePath: null,     // File currently active in an editor tab
    selectedTreePath: null,     // Focused tree item (file or directory)
    selectedFilePaths: [],      // Multi-selected file paths (for merge)
    
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
    kanbanColumns: [],          // Available kanban columns (hashtags)
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
    // Check if localStorage is available (some embedded webviews disable it).
    const hasLocalStorage = (() => {
        try {
            const test = '__localStorage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    })();

    if (!hasLocalStorage) {
        log.warn('localStorage not available, skipping state persistence');
        return;
    }

    // Restore sidebar widths from localStorage
    const savedSidebar = localStorage.getItem('sidebarWidth');
    if (savedSidebar) state.sidebarWidth = parseInt(savedSidebar, 10);
    
    const savedRightSidebar = localStorage.getItem('rightSidebarWidth');
    if (savedRightSidebar) state.rightSidebarWidth = parseInt(savedRightSidebar, 10);
    
    // Restore expanded directories
    const savedExpanded = localStorage.getItem('expandedDirs');
    if (savedExpanded) {
        try {
            state.expandedDirs = new Set(JSON.parse(savedExpanded));
        } catch (e) {
            log.warn('Failed to parse expanded dirs:', e);
        }
    }
    
    // Restore last selected date
    const savedDate = localStorage.getItem('selectedCalDate');
    if (savedDate) {
        state.selectedCalDateStr = savedDate;
    }

    // Restore pinned tabs. Stale pins are pruned after the tab snapshot is
    // normalized below.
    const savedPinned = localStorage.getItem('pinnedTabs');
    if (savedPinned) {
        try {
            const pinnedTabs = JSON.parse(savedPinned);
            if (Array.isArray(pinnedTabs)) state.pinnedTabs = pinnedTabs;
        } catch (e) { /* noop */ }
    }

    const savedRecentFiles = localStorage.getItem('recentFiles');
    if (savedRecentFiles) {
        try {
            const recentFiles = JSON.parse(savedRecentFiles);
            if (Array.isArray(recentFiles)) state.recentFiles = recentFiles.slice(0, 8);
        } catch (e) { /* noop */ }
    }

    const savedSearchFilters = localStorage.getItem('searchFilters');
    if (savedSearchFilters) {
        try {
            state.searchFilters = { ...state.searchFilters, ...JSON.parse(savedSearchFilters) };
        } catch (e) { /* noop */ }
    }

    const savedKanbanDensity = localStorage.getItem('kanbanDensity');
    if (savedKanbanDensity === 'compact' || savedKanbanDensity === 'comfortable') {
        state.kanbanDensity = savedKanbanDensity;
    }
    const savedKanbanLayout = localStorage.getItem('kanbanLayout');
    if (savedKanbanLayout === 'side-by-side' || savedKanbanLayout === 'stacked') {
        state.kanbanLayout = savedKanbanLayout;
    }

    // Restore last selected file
    const savedSelectedFile = localStorage.getItem('selectedFilePath');
    if (savedSelectedFile) {
        state.selectedFilePath = savedSelectedFile;
    }
    const savedSelectedTreePath = localStorage.getItem('selectedTreePath');
    if (savedSelectedTreePath) {
        state.selectedTreePath = savedSelectedTreePath;
    }

    // Store open tabs for later restoration (after file tree is loaded)
    const savedOpenTabs = localStorage.getItem('openTabs');
    if (savedOpenTabs) {
        try { state._restoredTabs = restoreSessionTabs(JSON.parse(savedOpenTabs), state.pinnedTabs); } catch (e) { /* noop */ }
    } else {
        const restoredTabs = restoreSessionTabs([], state.pinnedTabs);
        if (restoredTabs.length) state._restoredTabs = restoredTabs;
    }
    const restoredTabIds = new Set((state._restoredTabs || []).map(tab => tab.id));
    state.pinnedTabs = state.pinnedTabs.filter(tabId => restoredTabIds.has(tabId));
    const savedActiveTabId = localStorage.getItem('activeTabId');
    if (savedActiveTabId && restoredTabIds.has(savedActiveTabId)) {
        state._restoredActiveTabId = savedActiveTabId;
    }
}

/**
 * Persist state to localStorage
 */
export function persistState() {
    // Check if localStorage is available
    try {
        const test = '__localStorage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
    } catch (e) {
        log.warn('localStorage not available, skipping persist');
        return;
    }
    
    localStorage.setItem('sidebarWidth', state.sidebarWidth.toString());
    localStorage.setItem('rightSidebarWidth', state.rightSidebarWidth.toString());
    localStorage.setItem('expandedDirs', JSON.stringify([...state.expandedDirs]));
    const serializable = serializeSessionTabs(state.openTabs);
    localStorage.setItem('pinnedTabs', JSON.stringify(state.pinnedTabs.filter(tabId => serializable.some(tab => tab.id === tabId))));
    localStorage.setItem('recentFiles', JSON.stringify(state.recentFiles));
    localStorage.setItem('searchFilters', JSON.stringify(state.searchFilters));
    localStorage.setItem('kanbanDensity', state.kanbanDensity);
    localStorage.setItem('kanbanLayout', state.kanbanLayout);
    localStorage.setItem('openTabs', JSON.stringify(serializable));
    if (state.activeTabId && serializable.some(tab => tab.id === state.activeTabId)) {
        localStorage.setItem('activeTabId', state.activeTabId);
    } else {
        localStorage.removeItem('activeTabId');
    }
    if (state.selectedCalDateStr) {
        localStorage.setItem('selectedCalDate', state.selectedCalDateStr);
    }
    if (state.selectedTreePath) {
        localStorage.setItem('selectedTreePath', state.selectedTreePath);
    } else {
        localStorage.removeItem('selectedTreePath');
    }
}

// Auto-persist on changes
subscribe('sidebarWidth', persistState);
subscribe('rightSidebarWidth', persistState);
subscribe('expandedDirs', () => {
    try { localStorage.setItem('expandedDirs', JSON.stringify([...state.expandedDirs])); } catch (e) { /* noop */ }
});
subscribe('selectedCalDateStr', () => {
    try {
        if (state.selectedCalDateStr) {
            localStorage.setItem('selectedCalDate', state.selectedCalDateStr);
        }
    } catch (e) { /* noop */ }
});
subscribe('pinnedTabs', () => {
    try {
        const serializable = serializeSessionTabs(state.openTabs);
        localStorage.setItem('pinnedTabs', JSON.stringify(state.pinnedTabs.filter(tabId => serializable.some(tab => tab.id === tabId))));
    } catch (e) { /* noop */ }
});
subscribe('recentFiles', () => {
    try { localStorage.setItem('recentFiles', JSON.stringify(state.recentFiles)); } catch (e) { /* noop */ }
});
subscribe('searchFilters', () => {
    try { localStorage.setItem('searchFilters', JSON.stringify(state.searchFilters)); } catch (e) { /* noop */ }
});
subscribe('kanbanDensity', () => {
    try { localStorage.setItem('kanbanDensity', state.kanbanDensity); } catch (e) { /* noop */ }
});
subscribe('kanbanLayout', () => {
    try { localStorage.setItem('kanbanLayout', state.kanbanLayout); } catch (e) { /* noop */ }
});
subscribe('selectedFilePath', () => {
    try {
        if (state.selectedFilePath) {
            localStorage.setItem('selectedFilePath', state.selectedFilePath);
        } else {
            localStorage.removeItem('selectedFilePath');
        }
    } catch (e) { /* noop */ }
});
subscribe('selectedTreePath', () => {
    try {
        if (state.selectedTreePath) {
            localStorage.setItem('selectedTreePath', state.selectedTreePath);
        } else {
            localStorage.removeItem('selectedTreePath');
        }
    } catch (e) { /* noop */ }
});
subscribe('openTabs', () => {
    try {
        const serializable = serializeSessionTabs(state.openTabs);
        localStorage.setItem('openTabs', JSON.stringify(serializable));
        if (state.activeTabId) {
            localStorage.setItem('activeTabId', state.activeTabId);
        } else {
            localStorage.removeItem('activeTabId');
        }
    } catch (e) { /* noop */ }
});
subscribe('activeTabId', () => {
    try {
        if (state.activeTabId) {
            localStorage.setItem('activeTabId', state.activeTabId);
        } else {
            localStorage.removeItem('activeTabId');
        }
    } catch (e) { /* noop */ }
});

export default state;
