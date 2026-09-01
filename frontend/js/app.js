import { backend, waitForBackend } from './backend.js';
/**
 * figaro - Main Application Entry Point
 * Initializes all modules and orchestrates the application
 */

import { log } from './log.js';
import { state, initState, subscribe, setState, getState } from './state.js';
import { configureEditorWorkspace, initEditor, getEditorContent, getEditorDocumentTabId, openEditorSearch } from './editor.js';
import { preloadLanguageSupport } from './languageSupport.js';
import { initializeDiagramRenderers } from './diagramRenderer.js';
import {
    initTabManager,
    openTab,
    closeTab,
    switchTab,
    getActiveTab,
    markTabDirty,
    updateTabTitle,
    saveActiveFile as saveActiveTabFile,
    saveFileSnapshot,
    showWorkspaceHome,
    prepareTabsForVaultLinkRewrite,
    refreshTabsForUpdatedLinks,
    replaceActiveFileTab,
    closeTabsForDeletedPath,
    prepareTabsForPathCopy,
    prepareTabsForPathDelete,
    prepareTabsForPathMove,
    updateTabsForMovedPath,
} from './tabManager.js';
import { addExternalFileTreeEntry, configureFileTreeWorkspace, createInboxNote, initFileTree, refreshFileTree, scheduleFileTreeRefresh } from './fileTree.js';
import { configureCalendarWorkspace, initCalendar, navigateCalendarMonth, invalidateCalendarCache, loadCalendarMonthAppearance, refreshCalendarIfVisible } from './calendar.js';
import { configureKanbanWorkspace, initKanban, refreshKanbanData } from './kanban.js';
import { configureDatePickerCalendarSource } from './datePicker.js';
import { initStatusBarPresentation, statusBar } from './statusBar.js';
import { confirmDialog, promptDialog } from './dialogs.js';
import { configureSearchWorkspace, initSearch, performGlobalSearch, clearGlobalSearch, handleSearchKeydown } from './search.js';
import { configureBacklinksWorkspace, initBacklinks } from './backlinks.js';
import { loadSession, saveSession } from './session.js';
import { restoredWorkspacePlan } from './sessionTabs.js';
import { openExternalLaunchFiles, openLaunchExternalFiles } from './externalFiles.js';
import { initTheme, initThemeAppearance } from './theme.js';
import { initTabSizePreference } from './tabSizePreference.js';
import { applySidebarLayout, initSidebarResizer } from './sidebarResizer.js';
import { sidebarLayoutPlan } from './core/sidebarLayoutModel.js';
import { globalShortcutAction } from './core/globalShortcutModel.js';
import { localISODate } from './core/dueDateModel.js';
import { configureHistoryWorkspace, initHistoryPanel } from './historyPanel.js';
import { closePDFPreview, configurePDFPreviewWorkspace, initPDFPreview, openPDFPreview } from './pdfPreview.js';
import { closeRawTextPreview, initRawTextPreview, openRawTextPreview } from './rawTextPreview.js';
import { initOutlinePanel } from './outline.js';
import { initEditorPreviewLaunchers } from './editorPreviewLaunchers.js';
import { registerVaultChangeEvents } from './vaultEvents.js';
import { configureLinkStyleWorkspace, initLinkStylePreference } from './linkStyle.js';
import { setAutoCommitEnabled } from './automation.js';
import { initWindowChrome, closeNativeWindow, setWindowCloseRequestHandler } from './windowChrome.js';
import { initEditorBreadcrumb } from './editorBreadcrumb.js';
import { initPureEditingChrome } from './pureEditingChrome.js';
import { setRightSidebarOpen } from './rightSidebarState.js';
import { createVaultLoadingSession } from './usecases/vaultLoading.js';
import { createStartupHydration } from './usecases/startupHydration.js';
import { renderVaultLoading, removeVaultLoading } from './views/vaultLoadingView.js';
import { revealStartupWorkspace } from './views/startupView.js';
import { saveDirtyDocumentsBeforeExit } from './usecases/windowClose.js';
import { initSettingsNavigation } from './settingsNavigation.js';
import { configureClipboardImageWorkspace } from './clipboardImage.js';
import { configureDrawioWorkspace } from './drawio.js';
import { configureHomeWorkspace } from './home.js';
import { configureVaultHealthWorkspace } from './vaultHealth.js';

// Keep composed workspace operations available through the public app facade.
export { openTab, closeTab, switchTab, getActiveTab, markTabDirty, updateTabTitle };

configureBacklinksWorkspace({
    openTab,
    prepareTabsForVaultLinkRewrite,
    refreshTabsForUpdatedLinks,
});
configureCalendarWorkspace({ openTab });
configureClipboardImageWorkspace({ refreshFileTree });
configureDrawioWorkspace({ markTabDirty, saveFileSnapshot, refreshFileTree });
configureEditorWorkspace({
    closeTab,
    getActiveTab,
    markTabDirty,
    openFile: handleFileOpen,
    openPDFPreview,
    openRawTextPreview,
    openTab,
    refreshFileTree,
    replaceActiveFileTab,
    saveActiveFile: saveActiveTabFile,
    saveFileSnapshot,
    switchTab,
});
configureFileTreeWorkspace({
    closeTab,
    closeTabsForDeletedPath,
    openFile: handleFileOpen,
    openTab,
    prepareTabsForPathCopy,
    prepareTabsForPathDelete,
    prepareTabsForPathMove,
    refreshTabsForUpdatedLinks,
    updateTabsForMovedPath,
});
configureHistoryWorkspace({ saveFileSnapshot });
configureHomeWorkspace({ openTab });
configureKanbanWorkspace({ openTab, openFile: handleFileOpen });
configureLinkStyleWorkspace({ prepareTabsForVaultLinkRewrite, refreshTabsForUpdatedLinks });
configurePDFPreviewWorkspace({ openFile: handleFileOpen, saveFileSnapshot });
configureSearchWorkspace({ openTab });
configureVaultHealthWorkspace({ openTab });

// Make dialogs globally accessible for other modules
window.confirmDialog = confirmDialog;
window.promptDialog = promptDialog;

let autoSaveTimer = null;
let vaultEventsInitialized = false;
let externalLaunchHandlingReady = false;
let externalLaunchQueue = Promise.resolve();
let pendingExternalLaunchFiles = [];
const claimedExternalLaunchIDs = new Set();
const vaultLoadingSession = createVaultLoadingSession({
    readStatus: () => backend().GetVaultLoadStatus(),
    present: renderVaultLoading,
    remove: removeVaultLoading,
});
const startupHydration = createStartupHydration({
    loadSession,
    loadTabSize: initTabSizePreference,
    loadLinkStyle: initLinkStylePreference,
    loadAutomation: async () => {
        try {
            setAutoCommitEnabled(await backend().AutoCommitLoad());
        } catch (_) { /* keep the enabled-on-save default */ }
    },
    loadEditorPreferences: initTheme,
});

function claimExternalLaunchFile(file) {
    const id = String(file?.id || '');
    if (!id || claimedExternalLaunchIDs.has(id)) return false;
    claimedExternalLaunchIDs.add(id);
    return true;
}

function externalLaunchOptions() {
    return {
        closeTab,
        onExternalKept: addExternalFileTreeEntry,
        onImported: () => refreshFileTree(),
        onImportError: error => {
            log.warn('Could not import external launch note:', error);
            statusBar.set('Opened outside vault; import failed');
        },
        claimExternalFile: claimExternalLaunchFile,
    };
}

function enqueueExternalLaunchFiles(files) {
    const received = Array.isArray(files) ? files : [];
    if (!externalLaunchHandlingReady) {
        pendingExternalLaunchFiles.push(...received);
        return;
    }
    externalLaunchQueue = externalLaunchQueue
        .catch(() => {})
        .then(() => openExternalLaunchFiles(received, openTab, externalLaunchOptions()))
        .catch(error => {
            log.warn('Could not handle forwarded launch notes:', error);
            statusBar.set('Could not open forwarded note');
        });
}

async function initializeExternalLaunchHandling() {
    await openLaunchExternalFiles(openTab, externalLaunchOptions());
    externalLaunchHandlingReady = true;
    const pending = pendingExternalLaunchFiles;
    pendingExternalLaunchFiles = [];
    if (pending.length) {
        enqueueExternalLaunchFiles(pending);
        await externalLaunchQueue;
    }
}

function configureAutoSave(seconds) {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
    if (!Number.isFinite(seconds) || seconds <= 0) return;

    autoSaveTimer = setInterval(() => {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.dirty && activeTab.type === 'file') {
            void saveActiveTabFile().catch(() => {});
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
                refreshKanbanData().catch(() => {});
            }
            document.dispatchEvent(new CustomEvent('vault-filesystem-changed'));
        },
        onKanbanIndexed: () => {
            refreshKanbanData().catch(() => {});
        },
        onHistoryChanged: () => {
            document.dispatchEvent(new CustomEvent('vault-history-changed'));
        },
        onVaultLoadProgress: payload => {
            vaultLoadingSession.update(payload);
        },
        onExternalFilesOpened: enqueueExternalLaunchFiles,
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
        prevBtn.addEventListener('click', () => navigateCalendarMonth(-1));
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateCalendarMonth(1));
    }
}

/**
 * Initialize title-bar and persistent sidebar navigation controls.
 */
export function initTopBar() {
    initSettingsNavigation({
        openSettings: () => openTab('settings', 'Settings', 'settings', {}),
    });
    // Toggle sidebar
    const toggleBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    const setSidebarCollapsed = (collapsed) => {
        if (!sidebar) return;

        const requestedWidth = getState('sidebarWidth');
        const layout = sidebarLayoutPlan({
            collapsed,
            expandedWidth: requestedWidth,
        });
        if (requestedWidth !== layout.expandedWidth) {
            setState('sidebarWidth', layout.expandedWidth);
        }
        setState('sidebarCollapsed', collapsed);
        sidebar.classList.toggle('collapsed', collapsed);
        applySidebarLayout(sidebar, layout);
        toggleBtn?.setAttribute('aria-expanded', String(!collapsed));
        const sidebarResizer = document.getElementById('sidebar-resizer');
        sidebarResizer?.classList.toggle('sidebar-resizer-hidden', collapsed);
        if (sidebarResizer) {
            sidebarResizer.tabIndex = collapsed ? -1 : 0;
            sidebarResizer.setAttribute('aria-hidden', String(collapsed));
        }
        document.documentElement.removeAttribute('data-startup-sidebar-collapsed');

    };

    if (toggleBtn && sidebar) {
        setSidebarCollapsed(Boolean(getState('sidebarCollapsed')));
        toggleBtn.addEventListener('click', () => {
            setSidebarCollapsed(!getState('sidebarCollapsed'));
        });
    }

    // ── App name → workspace overview ──
    const homeBtn = document.getElementById('topbar-home');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            showWorkspaceHome();
        });
    }

    // ── Sidebar workspace destinations → persistent connected side tabs ──
    const calBtn = document.getElementById('sidebar-calendar');
    const rightSidebar = document.getElementById('right-sidebar');
    if (calBtn) {
        calBtn.addEventListener('click', () => {
            if (getActiveTab()?.type === 'calendar-workspace') return;
            openTab('calendar-workspace', 'Calendar', 'calendar-workspace');
        });
    }

    // The right pane is shared by History, Outline, and previews.
    const rsClose = document.getElementById('right-sidebar-close');
    if (rsClose && rightSidebar) {
        rsClose.addEventListener('click', () => {
            if (rightSidebar.dataset.mode === 'pdf-preview') closePDFPreview();
            else if (rightSidebar.dataset.mode === 'raw-text-preview') closeRawTextPreview();
            else if (rightSidebar.dataset.mode === 'history') document.dispatchEvent(new CustomEvent('close-history-panel'));
            else if (rightSidebar.dataset.mode === 'outline') document.dispatchEvent(new CustomEvent('close-outline-panel'));
            else {
                setRightSidebarOpen(rightSidebar, false);
                rightSidebar.style.width = '';
                rightSidebar.style.minWidth = '';
                document.getElementById('right-sidebar-resizer')?.classList.remove('visible');
                window.dispatchEvent(new Event('resize'));
            }
        });
    }

    // Settings remains a title-bar toggle; sidebar workspaces remain selected.
    const toggleWorkspaceTab = (id, title, type, data = {}) => {
        if (getState('activeTabId') === id) {
            closeTab(id, null, { animate: true });
            return;
        }
        openTab(id, title, type, data);
    };

    const kanbanBtn = document.getElementById('sidebar-kanban');
    if (kanbanBtn) {
        kanbanBtn.addEventListener('click', () => {
            if (getActiveTab()?.type === 'kanban') return;
            openTab('kanban', 'Kanban', 'kanban');
        });
    }

    const graphBtn = document.getElementById('sidebar-graph');
    if (graphBtn) {
        graphBtn.addEventListener('click', () => {
            if (getActiveTab()?.type === 'graph') return;
            openTab('graph', 'Graph', 'graph');
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
        const activeType = getActiveTab()?.type;
        for (const [button, type] of [
            [calBtn, 'calendar-workspace'],
            [kanbanBtn, 'kanban'],
            [graphBtn, 'graph'],
        ]) {
            const selected = activeType === type;
            button?.classList.toggle('ui-document-tab--active', selected);
            if (selected) button?.setAttribute('aria-current', 'page');
            else button?.removeAttribute('aria-current');
        }
        settingsBtn?.classList.toggle('active', activeTabId === 'settings');
        homeBtn?.classList.toggle('active', activeTabId === null);
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
                openTab('backlinks-' + activeTab.path, 'Relationships', 'backlinks', { targetPath: activeTab.path });
            }
        });
    }
}

/**
 * Initialize keyboard shortcuts
 */
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const shortcut = globalShortcutAction(e);
        if (shortcut) {
            if (shortcut === 'document-find' && getActiveTab()?.type !== 'file') return;
            e.preventDefault();
            e.stopPropagation();

            if (shortcut === 'quick-note') {
                void createInboxNote();
            } else if (shortcut === 'daily-note') {
                const today = localISODate();
                const path = `${today}.md`;
                openTab(path, today, 'file', { path });
            } else if (shortcut === 'toggle-sidebar') {
                document.getElementById('toggle-sidebar')?.click();
            } else if (shortcut === 'global-search') {
                document.getElementById('global-search-input')?.focus();
            } else if (shortcut === 'document-find') {
                openEditorSearch();
            }
            return;
        }
        
        // Ctrl/Cmd + S: Save current file
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            void saveActiveTabFile({ failurePrompt: 'always' }).catch(() => {});
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
    }, true);
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
                mtime: result.mtime,
                preparedFile: result,
            });
        }
    } catch (err) {
        log.error('Failed to open file:', err);
        statusBar.set('Failed to open file');
    }
}


/**
 * Restore previously open tabs from saved session
 * @returns {Promise<{restored: boolean, deferredActiveTabId: string|null}>}
 */
async function restoreOpenTabs() {
    const restoredTabs = state._restoredTabs;
    const restoredActiveId = state._restoredActiveTabId;
    
    if (!restoredTabs || !restoredTabs.length) {
        return { restored: false, deferredActiveTabId: null };
    }
    
    state._restoredTabs = null;
    state._restoredActiveTabId = null;

    const plan = restoredWorkspacePlan(restoredTabs, restoredActiveId);
    const openedIDs = new Set();
    for (const restored of plan.tabs) {
        openTab(restored.id, restored.title, restored.type, {
            ...restored.data,
            activate: false,
        });
        openedIDs.add(restored.id);
    }

    if (!openedIDs.size) {
        setState('pinnedTabs', []);
        state._restoredCursorStates = null;
        return { restored: false, deferredActiveTabId: null };
    }
    setState('pinnedTabs', (getState('pinnedTabs') || []).filter(id => openedIDs.has(id)));

    // Install cursor states before the restored active tab is mounted. The
    // file loader applies this snapshot during its document replacement.
    if (state._restoredCursorStates) {
        const tabs = getState('openTabs');
        for (const t of tabs) {
            if (t.type === 'file' && state._restoredCursorStates[t.id]) {
                t.cursorState = state._restoredCursorStates[t.id];
            }
        }
        state._restoredCursorStates = null;
    }

    const activePlan = plan.tabs.find(tab => tab.id === plan.activeTabId);
    const deferredActiveTabId = activePlan?.type === 'file' ? null : plan.activeTabId;
    if (activePlan?.type === 'file' && openedIDs.has(plan.activeTabId)) {
        await switchTab(plan.activeTabId);
    }

    return { restored: true, deferredActiveTabId };
}

/**
 * Initialize all application modules
 */
export async function initApp() {
    // Guard against double initialization
    if (window._appInitialized) return;
    window._appInitialized = true;
    window._appReady = false;
    configureDatePickerCalendarSource({ loadMonthData: loadCalendarMonthAppearance });

    initStatusBarPresentation();
    statusBar.set('Initializing...');
    const languageSupportReady = preloadLanguageSupport();
    initializeDiagramRenderers();
    
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
    initPureEditingChrome();
    initKeyboardShortcuts();
    initWindowChrome();
    
    // Wait until Wails has published the bound Go App object.
    statusBar.set('Connecting to backend...');
    await waitForBackend();

    // Apply the persisted shell appearance before exposing or starting vault
    // discovery. The loading surface therefore never flashes the bundled
    // default theme while a different saved theme is being read.
    await initThemeAppearance();

    // Subscribe before explicitly starting the backend work. Hydrate all
    // interaction- and geometry-affecting state concurrently with the portable
    // session, then expose the restored editor with one authoritative profile.
    initVaultChangeNotifications();
    statusBar.set('Restoring workspace...');
    await startupHydration.hydrate();
    
    // Initialize editor (CodeMirror 6)
    statusBar.set('Loading editor...');
    await initEditor();
    
    // Initialize tab manager
    initTabManager();
    initEditorBreadcrumb();
    initFileTree();

    // The backend has already pruned stale portable paths. Recreate inactive
    // tabs as metadata only, then await the single active file read before any
    // full-vault discovery can compete with it.
    const restoration = await restoreOpenTabs();
    await initializeExternalLaunchHandling();
    
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

    // Outline shares the right sidebar with History and PDF Preview.
    initOutlinePanel();

    // PDF and raw-text previews share the right sidebar with History and
    // Document outline; Calendar remains independent in the left sidebar.
    initPDFPreview();
    initRawTextPreview();
    initEditorPreviewLaunchers({
        getActiveTab,
        getEditorContent,
        getEditorDocumentTabId,
        openRawTextPreview,
        openPDFPreview,
        onError(error, kind) {
            log.error(`${kind === 'pdf' ? 'PDF' : 'Raw text'} preview failed:`, error);
            statusBar.set(`${kind === 'pdf' ? 'PDF' : 'Raw text'} preview couldn’t open`);
        },
    });

    // CodeMirror derives line-number width and restored scroll geometry from
    // the mounted document. Let those measurements settle while the editor is
    // concealed, then publish one stable first buffer frame.
    await revealStartupWorkspace();

    // The editor or launch document is now visible with its saved interaction
    // profile. Start background vault work without putting it on that barrier.
    vaultLoadingSession.start();
    await backend().StartVaultLoad();
    await vaultLoadingSession.connect();
    const vaultReady = vaultLoadingSession.waitUntilSettled();

    if (restoration.deferredActiveTabId) {
        switchTab(restoration.deferredActiveTabId).catch(error => {
            log.warn('Could not restore the previous workspace view:', error);
        });
    }

    const fileTreeReady = refreshFileTree();

    if (!restoration.restored && !getState('activeTabId')) {
        // A missing, empty, or pruned workspace begins at the overview rather
        // than opening an arbitrary note or manufacturing a fake tab.
        showWorkspaceHome();
    }

    const [vaultStatus] = await Promise.all([
        vaultReady,
        fileTreeReady,
        languageSupportReady,
    ]);
    // Persist the repaired workspace so the next launch cannot resurrect
    // removed paths or a legacy synthetic Welcome tab.
    saveSession();
    if (vaultStatus.phase === 'ready') vaultLoadingSession.finish();
    
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
            const saved = await saveDirtyDocumentsBeforeExit({
                tabs: dirty,
                activeId: getState('activeTabId'),
                activeContent: getEditorContent,
                save: saveFileSnapshot,
                currentTabs: () => getState('openTabs'),
            });
            if (saved) closeNativeWindow();
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
                if (typeof content === 'string') await saveFileSnapshot(tab, content).catch(() => {});
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

// index.html eagerly loads bootstrap.js, which starts initApp after the native
// backend is ready (or installs the explicit browser-development backend).
