import { backend, waitForBackend } from './backend.js';
/**
 * figaro - Main Application Entry Point
 * Initializes all modules and orchestrates the application
 */

import { log } from './log.js';
import { state, initState, subscribe, setState, getState } from './state.js';
import { initEditor, getEditorContent, openEditorSearch } from './editor.js';
import { initTabManager, openTab, closeTab, switchTab, getActiveTab, markTabDirty, updateTabTitle, saveActiveFile as saveActiveTabFile, saveFileSnapshot } from './tabManager.js';
import { initFileTree, refreshFileTree, scheduleFileTreeRefresh } from './fileTree.js';
import { initCalendar, renderCalendar, invalidateCalendarCache, refreshCalendarIfVisible } from './calendar.js';
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
import { closePDFPreview, initPDFPreview } from './pdfPreview.js';
import { registerVaultChangeEvents } from './vaultEvents.js';
import { initLinkStylePreference } from './linkStyle.js';
import { setAutoCommitMode } from './automation.js';
import { initWindowChrome, closeNativeWindow, setWindowCloseRequestHandler } from './windowChrome.js';

// Re-export tab manager functions for other modules to import from app.js
export { openTab, closeTab, switchTab, getActiveTab, markTabDirty, updateTabTitle };

// Make dialogs globally accessible for other modules
window.confirmDialog = confirmDialog;
window.promptDialog = promptDialog;

let autoSaveTimer = null;
let vaultEventsInitialized = false;

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

// Wails exposes the same event API on Linux/WebKit, Windows/WebView2, and
// macOS/WKWebView. A native backend watcher emits these notifications, so the
// UI can react to real filesystem changes without a full tree poll every few
// seconds.
export function initVaultChangeNotifications(runtime = window.runtime) {
    if (vaultEventsInitialized) return false;
    const registered = registerVaultChangeEvents(runtime, {
        onVaultChanged: (payload = {}) => {
            invalidateCalendarCache();
            if (payload.tree_changed !== false) scheduleFileTreeRefresh();
            refreshCalendarIfVisible();
            // Figaro already projected its own saved Markdown snapshot into
            // Kanban. A watcher acknowledgement for that write must not send
            // the complete board across the native bridge again. Older
            // backends omit this field, so retain their conservative refresh.
            if (payload.kanban_changed !== false) {
                import('./kanban.js').then(({ refreshKanbanData }) => refreshKanbanData()).catch(() => {});
            }
            document.dispatchEvent(new CustomEvent('vault-filesystem-changed'));
        },
        onKanbanIndexed: () => {
            import('./kanban.js').then(({ refreshKanbanData }) => refreshKanbanData()).catch(() => {});
        },
        onHistoryChanged: () => {
            document.dispatchEvent(new CustomEvent('vault-history-changed'));
        },
    });
    if (registered) vaultEventsInitialized = true;
    return registered;
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
 * Initialize title-bar and persistent sidebar navigation controls.
 */
export function initTopBar() {
    // Toggle sidebar
    const toggleBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    const setSidebarCollapsed = (collapsed) => {
        if (!sidebar) return;

        setState('sidebarCollapsed', collapsed);
        sidebar.classList.toggle('collapsed', collapsed);
        sidebar.style.width = collapsed
            ? 'var(--sidebar-rail-width, 44px)'
            : 'var(--sidebar-width, 300px)';
        sidebar.style.minWidth = collapsed
            ? 'var(--sidebar-rail-width, 44px)'
            : '225px';
        toggleBtn?.setAttribute('aria-expanded', String(!collapsed));
        document.getElementById('sidebar-resizer')?.classList.toggle('sidebar-resizer-hidden', collapsed);

        // The rail keeps the destination visible, but an expanded calendar has
        // no useful content at rail width. Closing it makes the next Calendar
        // click expand the sidebar and reveal the panel in one action.
        if (collapsed) {
            const calendarPanel = document.getElementById('sidebar-calendar-panel');
            const calendarButton = document.getElementById('sidebar-calendar');
            calendarPanel?.classList.remove('open');
            calendarPanel?.setAttribute('aria-hidden', 'true');
            calendarButton?.classList.remove('active');
            calendarButton?.setAttribute('aria-expanded', 'false');
            sidebar.classList.remove('calendar-open');
        }
    };

    if (toggleBtn && sidebar) {
        setSidebarCollapsed(Boolean(getState('sidebarCollapsed')));
        toggleBtn.addEventListener('click', () => {
            setSidebarCollapsed(!getState('sidebarCollapsed'));
        });
    }

    // ── App name → Home tab ──
    const homeBtn = document.getElementById('topbar-home');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            openTab('home', 'Welcome', 'home');
        });
    }

    // ── Calendar button → toggle an inline panel under the file tree ──
    const calBtn = document.getElementById('sidebar-calendar');
    const calendarPanel = document.getElementById('sidebar-calendar-panel');
    const rightSidebar = document.getElementById('right-sidebar');
    const closeCalendarPanel = () => {
        if (!calendarPanel) return;
        calendarPanel.classList.remove('open');
        calendarPanel.setAttribute('aria-hidden', 'true');
        calBtn?.classList.remove('active');
        calBtn?.setAttribute('aria-expanded', 'false');
        sidebar?.classList.remove('calendar-open');
        window.dispatchEvent(new Event('resize'));
    };
    const openCalendarPanel = () => {
        if (!calendarPanel) return;
        if (getState('sidebarCollapsed')) setSidebarCollapsed(false);
        calendarPanel.classList.add('open');
        calendarPanel.setAttribute('aria-hidden', 'false');
        calBtn?.classList.add('active');
        calBtn?.setAttribute('aria-expanded', 'true');
        sidebar?.classList.add('calendar-open');
        renderCalendar();
        window.dispatchEvent(new Event('resize'));
    };
    if (calBtn && calendarPanel) {
        calBtn.addEventListener('click', () => {
            if (calendarPanel.classList.contains('open')) closeCalendarPanel();
            else openCalendarPanel();
        });
    }

    // The right pane is now reserved for History and PDF preview.
    const rsClose = document.getElementById('right-sidebar-close');
    if (rsClose && rightSidebar) {
        rsClose.addEventListener('click', () => {
            if (rightSidebar.dataset.mode === 'pdf-preview') closePDFPreview();
            else if (rightSidebar.dataset.mode === 'history') document.dispatchEvent(new CustomEvent('close-history-panel'));
            else {
                rightSidebar.classList.remove('open');
                rightSidebar.style.width = '';
                rightSidebar.style.minWidth = '';
                document.getElementById('right-sidebar-resizer')?.classList.remove('visible');
                window.dispatchEvent(new Event('resize'));
            }
        });
    }

    // ── Kanban and Settings buttons → focus, open, or close their workspace tabs ──
    const toggleWorkspaceTab = (id, title, type) => {
        if (getState('activeTabId') === id) {
            closeTab(id, null, { animate: true });
            return;
        }
        openTab(id, title, type, {});
    };

    const kanbanBtn = document.getElementById('sidebar-kanban');
    if (kanbanBtn) {
        kanbanBtn.addEventListener('click', () => {
            toggleWorkspaceTab('kanban', 'Kanban', 'kanban');
        });
    }

    const settingsBtn = document.getElementById('topbar-settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            toggleWorkspaceTab('settings', 'Settings', 'settings');
        });
    }

    // Keep button active states in sync with tabs
    const syncNavigationState = () => {
        const activeTabId = getState('activeTabId');
        kanbanBtn?.classList.toggle('active', activeTabId === 'kanban');
        settingsBtn?.classList.toggle('active', activeTabId === 'settings');
        homeBtn?.classList.toggle('active', activeTabId === 'home');
    };
    subscribe('openTabs', syncNavigationState);
    subscribe('activeTabId', syncNavigationState);
    syncNavigationState();

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

        // Ctrl/Cmd + F: Find in the active document. Register this at the app
        // level as well as in CodeMirror so it remains reliable when focus is
        // briefly on a tab, rendered widget, or other editor-adjacent control.
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
            const activeTab = getActiveTab();
            if (activeTab?.type === 'file') {
                e.preventDefault();
                openEditorSearch();
            }
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
        const result = await backend().ReadFile(filePath);
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
    if (state.selectedTreePath && !filePaths.has(state.selectedTreePath) && !directoryPaths.has(state.selectedTreePath)) {
        setState('selectedTreePath', null);
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
    window._appReady = false;
    
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
    initWindowChrome();
    
    // Wait until Wails has published the bound Go App object.
    statusBar.set('Connecting to backend...');
    await waitForBackend();
    await initLinkStylePreference();
    try {
        setAutoCommitMode(await backend().AutoCommitLoad());
    } catch (_) { /* keep the one-hour default */ }

    // Load saved session from vault/.config/session.json
    await loadSession();
    
    // Initialize editor (CodeMirror 6)
    statusBar.set('Loading editor...');
    await initEditor();
    
    // Initialize tab manager
    initTabManager();

    // Register before the first vault request. If the background Kanban index
    // finishes while the initial tree is loading, the ready event is still
    // observed and the sidebar can refresh its derived data.
    initVaultChangeNotifications();
    
    // Initialize file tree
    statusBar.set('Loading file tree...');
    await refreshFileTree();
    initFileTree();

    // Restore previously open tabs (after file tree is available)
    const didRestore = restoreOpenTabs();
    
    // Initialize calendar
    initCalendar();
    
    // Initialize kanban
    initKanban();
    
    // Initialize search
    initSearch();
    
    // Initialize backlinks
    initBacklinks();

    // Initialize history panel
    initHistoryPanel();

    // PDF preview shares the right sidebar with History; Calendar is isolated
    // in the left sidebar and can remain open independently.
    initPDFPreview();

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
    window._appReady = true;

    window.addEventListener('figaro:auto-save-interval', (event) => {
        configureAutoSave(Number(event.detail?.seconds) || 0);
    });

    // ── Auto-save timer (frequent, content-only, no git commit) ──
    (async () => {
        try {
            const interval = await backend().AutoSaveLoad();
            configureAutoSave(interval);
        } catch (_) { /* noop */ }
    })();

    // ── Exit prompt: warn about unsaved changes ──
    setWindowCloseRequestHandler(async () => {
        const tabs = getState('openTabs');
        const dirty = tabs.filter(t => t.dirty && t.type === 'file');
        if (dirty.length === 0) {
            closeNativeWindow();
            return;
        }
        const names = dirty.map(t => t.title).join(', ');
        const choice = await window.confirmDialog?.(
            'Unsaved changes',
            `These files have unsaved changes: ${names}\n\nSave them before exiting?`,
            false,
            false,
            {
                tone: 'warning',
                icon: 'warning',
                confirmLabel: 'Save and exit',
                cancelLabel: 'Keep editing',
                extraLabel: 'Exit without saving',
                extraDanger: true,
            }
        );
        if (choice === 'confirm') {
            const activeId = getState('activeTabId');
            for (const tab of dirty) {
                const content = tab.id === activeId ? getEditorContent() : tab._content;
                if (typeof content !== 'string') continue;
                try { await saveFileSnapshot(tab, content); } catch (_) { /* noop */ }
            }
            closeNativeWindow();
        } else if (choice === 'extra') {
            closeNativeWindow();
        }
    });

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

// Native Wails startup calls initApp after DOM readiness; browser debugging
// starts it through bootstrap.js after installing its explicit debug backend.
