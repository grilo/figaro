/**
 * figaro - Main Application Entry Point
 * Initializes all modules and orchestrates the application
 */

import { log } from './log.js';
import { state, initState, subscribe, setState, getState } from './state.js';
import { initEditor, getEditorContent } from './editor.js';
import { initTabManager, openTab, closeTab, switchTab, getActiveTab, markTabDirty, updateTabTitle, saveActiveFile as saveActiveTabFile, saveFileSnapshot } from './tabManager.js';
import { initFileTree, refreshFileTree } from './fileTree.js';
import { initCalendar, renderCalendar } from './calendar.js';
import { initKanban } from './kanban.js';
import { statusBar } from './statusBar.js';
import { confirmDialog, promptDialog } from './dialogs.js';
import { initSearch, performGlobalSearch, clearGlobalSearch, handleSearchKeydown } from './search.js';
import { initBacklinks } from './backlinks.js';
import { loadSession, saveSession } from './session.js';
import { restoredTabOpenArgs } from './sessionTabs.js';
import { initTheme } from './theme.js';
import { initSidebarResizer } from './sidebarResizer.js';
import { initHistoryPanel } from './historyPanel.js';

// Re-export tab manager functions for other modules to import from app.js
export { openTab, closeTab, switchTab, getActiveTab, markTabDirty, updateTabTitle };

// Make dialogs globally accessible for other modules
window.confirmDialog = confirmDialog;
window.promptDialog = promptDialog;

let autoSaveTimer = null;

function configureAutoSave(seconds) {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
    if (!Number.isFinite(seconds) || seconds <= 0) return;

    autoSaveTimer = setInterval(() => {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.dirty && activeTab.type === 'file') {
            saveActiveTabFile();
        }
    }, seconds * 1000);
}

/**
 * Wait for pywebview API to be available
 */
function waitForBackendBridge() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.pywebview?.api?.get_file_tree) {
                resolve();
            } else {
                setTimeout(check, 15);
            }
        };
        // Also listen for pywebviewready event
        if (window.pywebviewready) {
            window.addEventListener('pywebviewready', check);
        }
        check();
    });
}

/**
 * Initialize calendar navigation buttons
 */
function initCalendarNav() {
    const prevBtn = document.getElementById('cal-prev-month');
    const nextBtn = document.getElementById('cal-next-month');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            const current = getState('currentCalDate');
            current.setMonth(current.getMonth() - 1);
            setState('currentCalDate', new Date(current));
            renderCalendar();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const current = getState('currentCalDate');
            current.setMonth(current.getMonth() + 1);
            setState('currentCalDate', new Date(current));
            renderCalendar();
        });
    }
}

/**
 * Initialize top bar buttons
 */
function initTopBar() {
    // Toggle sidebar
    const toggleBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.setAttribute('aria-expanded', String(!getState('sidebarCollapsed')));
        toggleBtn.addEventListener('click', () => {
            const collapsed = getState('sidebarCollapsed');
            const nextCollapsed = !collapsed;
            setState('sidebarCollapsed', nextCollapsed);
            sidebar.classList.toggle('collapsed', nextCollapsed);
            sidebar.style.width = nextCollapsed ? '0px' : 'var(--sidebar-width, 280px)';
            sidebar.style.minWidth = nextCollapsed ? '0px' : '225px';
            toggleBtn.setAttribute('aria-expanded', String(!nextCollapsed));
            const resizer = document.getElementById('sidebar-resizer');
            if (resizer) resizer.classList.toggle('sidebar-resizer-hidden', nextCollapsed);
        });
    }

    // ── App name → Home tab ──
    const homeBtn = document.getElementById('topbar-home');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            openTab('home', 'Welcome', 'home');
        });
    }

    // ── Calendar button → toggle right pane ──
    const calBtn = document.getElementById('topbar-calendar');
    const rightSidebar = document.getElementById('right-sidebar');
    const rightTitle = document.getElementById('right-sidebar-title');
    if (calBtn && rightSidebar) {
        calBtn.addEventListener('click', () => {
            const isOpen = rightSidebar.classList.contains('open');
            if (isOpen) {
                rightSidebar.classList.remove('open');
                calBtn.classList.remove('active');
            } else {
                // Show calendar content, hide history
                const calGrid = document.getElementById('calendar-grid');
                const calLinks = document.getElementById('cal-linked-notes');
                const calToolbar = rightSidebar.querySelector('.calendar-toolbar');
                const histContent = document.getElementById('history-content');
                if (calGrid) calGrid.style.display = '';
                if (calLinks) calLinks.style.display = '';
                if (calToolbar) calToolbar.style.display = '';
                if (histContent) histContent.style.display = 'none';
                if (rightTitle) rightTitle.textContent = 'Calendar';
                rightSidebar.classList.add('open');
                calBtn.classList.add('active');
                import('./calendar.js').then(m => m.renderCalendar());
            }
        });
    }
    // Close button
    const rsClose = document.getElementById('right-sidebar-close');
    if (rsClose && rightSidebar) {
        rsClose.addEventListener('click', () => {
            rightSidebar.classList.remove('open');
            if (calBtn) calBtn.classList.remove('active');
        });
    }

    // ── Kanban button → toggle tab ──
    const kanbanBtn = document.getElementById('topbar-kanban');
    if (kanbanBtn) {
        kanbanBtn.addEventListener('click', () => {
            const tabs = getState('openTabs');
            const existing = tabs.find(t => t.id === 'kanban');
            if (existing) {
                closeTab('kanban');
                kanbanBtn.classList.remove('active');
            } else {
                openTab('kanban', 'Kanban', 'kanban', {});
                kanbanBtn.classList.add('active');
            }
        });
    }

    // ── Settings button → toggle tab ──
    const settingsBtn = document.getElementById('topbar-settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const tabs = getState('openTabs');
            const existing = tabs.find(t => t.id === 'settings');
            if (existing) {
                closeTab('settings');
                settingsBtn.classList.remove('active');
            } else {
                openTab('settings', 'Settings', 'settings', {});
                settingsBtn.classList.add('active');
            }
        });
    }

    // Keep button active states in sync with tabs
    subscribe('openTabs', () => {
        const tabs = getState('openTabs');
        if (kanbanBtn) kanbanBtn.classList.toggle('active', !!tabs.find(t => t.id === 'kanban'));
        if (settingsBtn) settingsBtn.classList.toggle('active', !!tabs.find(t => t.id === 'settings'));
        if (homeBtn) homeBtn.classList.toggle('active', getState('activeTabId') === 'home');
    });
    subscribe('activeTabId', () => {
        if (homeBtn) homeBtn.classList.toggle('active', getState('activeTabId') === 'home');
    });

    // ── Sidebar search ──
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (searchInput.value.trim()) {
                    performGlobalSearch(searchInput.value.trim());
                } else {
                    clearGlobalSearch(false);
                }
            }, 200);
        });
        searchInput.addEventListener('keydown', (e) => {
            handleSearchKeydown(e);
        });
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim()) {
                performGlobalSearch(searchInput.value.trim());
            }
        });
    }

    // Backlinks status bar
    const backlinksEl = document.getElementById('backlinks-status');
    if (backlinksEl) {
        backlinksEl.addEventListener('click', () => {
            const activeTab = getActiveTab();
            if (activeTab && activeTab.type === 'file' && activeTab.path) {
                openTab('backlinks-' + activeTab.path, 'Backlinks', 'backlinks', { targetPath: activeTab.path });
            }
        });
    }
}

/**
 * Initialize keyboard shortcuts
 */
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        
        // Ctrl/Cmd + Shift + N: New daily note
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'n') {
            e.preventDefault();
            const today = new Date().toISOString().split('T')[0];
            const path = `${today}.md`;
            openTab(path, today, 'file', { path });
        }
        
        // Ctrl/Cmd + B: Toggle sidebar
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            const toggleSidebar = document.getElementById('toggle-sidebar');
            if (toggleSidebar) toggleSidebar.click();
        }
        
        // Ctrl/Cmd + Shift + F: Focus global search
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
            e.preventDefault();
            const input = document.getElementById('global-search-input');
            if (input) input.focus();
        }
        
        // Ctrl/Cmd + S: Save current file
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveActiveTabFile();
        }
        
        // Ctrl/Cmd + W: Close current tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            const activeTab = getActiveTab();
            if (activeTab) closeTab(activeTab.id);
        }
        
        // Escape: Close modals, search, etc.
        if (e.key === 'Escape') {
            // Close context menu
            document.querySelectorAll('.context-menu').forEach(m => m.remove());
            // Close search suggestions
            document.querySelectorAll('.cm-tooltip-autocomplete').forEach(t => t.remove());
        }
    });
}

/**
 * Handle file opening from file tree
 */
export async function handleFileOpen(filePath) {
    try {
        const result = await window.pywebview.api.read_file(filePath);
        if (result) {
            if (result.binary) {
                statusBar.set('Cannot edit binary file');
                return;
            }
            openTab(filePath, result.path.split('/').pop() || filePath, 'file', {
                path: filePath,
                mtime: result.mtime
            });
        }
    } catch (err) {
        log.error('Failed to open file:', err);
        statusBar.set('Failed to open file');
    }
}


/**
 * Restore previously open tabs from saved session
 * @returns {boolean} true if tabs were restored
 */
function restoreOpenTabs() {
    const restoredTabs = state._restoredTabs;
    const restoredActiveId = state._restoredActiveTabId;
    
    if (!restoredTabs || !restoredTabs.length) return false;
    
    state._restoredTabs = null;
    state._restoredActiveTabId = null;

    const filePaths = new Set();
    const directoryPaths = new Set();
    const collectTreePaths = items => {
        for (const item of items || []) {
            if (item?.type === 'file' && item.path) filePaths.add(item.path);
            if (item?.type === 'directory' && item.path) {
                directoryPaths.add(item.path);
                collectTreePaths(item.children);
            }
        }
    };
    collectTreePaths(getState('fileTreeData'));
    if (state.selectedFilePath && !filePaths.has(state.selectedFilePath)) {
        setState('selectedFilePath', null);
    }
    if (state.expandedDirs instanceof Set) {
        state.expandedDirs = new Set([...state.expandedDirs].filter(path => directoryPaths.has(path)));
    }
    
    const openedIDs = new Set();
    for (const t of restoredTabs) {
        const restored = restoredTabOpenArgs(t);
        if (!restored) continue;
        if ((restored.type === 'file' || restored.type === 'drawio') && !filePaths.has(restored.data.path)) continue;
        openTab(restored.id, restored.title, restored.type, restored.data);
        openedIDs.add(restored.id);
    }

    if (!openedIDs.size) {
        setState('pinnedTabs', []);
        state._restoredCursorStates = null;
        return false;
    }
    setState('pinnedTabs', (getState('pinnedTabs') || []).filter(id => openedIDs.has(id)));
    
    if (restoredActiveId && openedIDs.has(restoredActiveId)) {
        switchTab(restoredActiveId);
    }

    // Restore cursor states
    if (state._restoredCursorStates) {
        const tabs = getState('openTabs');
        for (const t of tabs) {
            if (t.type === 'file' && state._restoredCursorStates[t.id]) {
                t.cursorState = state._restoredCursorStates[t.id];
            }
        }
        state._restoredCursorStates = null;
    }

    // Force-save session after restore
    saveSession();
    
    return true;
}

/**
 * Initialize all application modules
 */
export async function initApp() {
    // Guard against double initialization
    if (window._appInitialized) return;
    window._appInitialized = true;
    
    statusBar.set('Initializing...');
    
    // Initialize persistent state
    initState();
    
    // Initialize UI components that don't need backend
    try {
        initSidebarResizer();
    } catch (e) {
        console.error('❌ APP: initSidebarResizer crashed:', e);
    }
    initCalendarNav();
    initTopBar();
    initKeyboardShortcuts();
    
    // Wait for backend bridge
    statusBar.set('Connecting to backend...');
    await waitForBackendBridge();

    // Load saved session from vault/.config/session.json
    await loadSession();
    
    // Initialize editor (CodeMirror 6)
    statusBar.set('Loading editor...');
    await initEditor();
    
    // Initialize tab manager
    initTabManager();
    
    // Initialize file tree
    statusBar.set('Loading file tree...');
    await refreshFileTree();
    initFileTree();

    // Periodic file tree refresh (every 3 seconds)
    setInterval(() => { refreshFileTree().catch(() => {}); }, 3000);

    // Restore previously open tabs (after file tree is available)
    const didRestore = restoreOpenTabs();
    
    // Initialize calendar
    initCalendar();
    renderCalendar();
    
    // Initialize kanban
    initKanban();
    
    // Initialize search
    initSearch();
    
    // Initialize backlinks
    initBacklinks();

    // Initialize history panel
    initHistoryPanel();

    await initTheme();
    
    if (!didRestore) {
        // A missing, empty, or pruned workspace starts from the real Welcome
        // surface instead of opening an arbitrary note or a phantom file tab.
        openTab('home', 'Welcome', 'home');
    }
    // Persist the repaired workspace, including the Welcome fallback, so the
    // next launch cannot try to resurrect removed paths.
    saveSession();
    
    statusBar.set('Ready');

    window.addEventListener('figaro:auto-save-interval', (event) => {
        configureAutoSave(Number(event.detail?.seconds) || 0);
    });

    // ── Auto-save timer (frequent, content-only, no git commit) ──
    (async () => {
        try {
            const interval = await window.pywebview.api.auto_save_load();
            configureAutoSave(interval);
        } catch (_) { /* noop */ }
    })();

    // ── Exit prompt: warn about unsaved changes ──
    const originalWindowClose = window.__wailsCompat?.windowClose;
    if (originalWindowClose) {
        window.__wailsCompat.windowClose = async () => {
            const tabs = getState('openTabs');
            const dirty = tabs.filter(t => t.dirty && t.type === 'file');
            if (dirty.length > 0) {
                const names = dirty.map(t => t.title).join(', ');
                const choice = await window.confirmDialog?.(
                    'Unsaved Changes',
                    `<p>You have unsaved changes in: <b>${names}</b></p><p>How would you like to proceed?</p>`,
                    false, true, { confirmLabel: 'Save & Exit', cancelLabel: 'Cancel', extraLabel: 'Exit without saving' }
                );
                if (choice === 'confirm') {
                    // Save all dirty, then quit
                    const activeId = getState('activeTabId');
                    for (const tab of dirty) {
                        const content = tab.id === activeId ? getEditorContent() : tab._content;
                        if (typeof content !== 'string') continue;
                        try { await saveFileSnapshot(tab, content); } catch (_) { /* noop */ }
                    }
                    originalWindowClose();
                } else if (choice === 'extra') {
                    // Exit without saving
                    originalWindowClose();
                }
                // 'cancel' or dialog closed → do nothing
            } else {
                originalWindowClose();
            }
        };
    }

    // Handle window close - save dirty tabs and persist session
    window.addEventListener('beforeunload', async (_e) => {
        if (autoSaveTimer) clearInterval(autoSaveTimer);
        const tabs = getState('openTabs');
        const activeId = getState('activeTabId');
        for (const tab of tabs) {
            if (tab.dirty && tab.type === 'file') {
                const content = tab.id === activeId ? getEditorContent() : tab._content;
                if (typeof content === 'string') await saveFileSnapshot(tab, content);
            }
        }
        // Save session state via backend API
        saveSession();
    });
    
    // Expose API for debugging
    window.app = {
        state,
        openTab,
        closeTab,
        switchTab,
        saveActiveFile: saveActiveTabFile,
        handleFileOpen
    };
}

// initApp() is called from index.html's bootWhenReady() — the Wails bridge
// must be live before initialization starts.
