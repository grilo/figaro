/**
 * Tab Manager - Handles tab creation, switching, closing, and state
 */

import { log } from './log.js';
import { fileIcon, calendarIcon, backlinksIcon, kanbanIcon, settingsIcon, homeIcon } from './icons.js';
import { setState, getState, subscribe, recordRecentFile } from './state.js';
import { saveSession } from './session.js';
import { getEditorView, getEditorContent, setEditorContent, focusEditor, saveCursorState, restoreCursorState, configureEditorForFile } from './editor.js';
import { statusBar } from './statusBar.js';
import { closeHistoryPanel, refreshHistoryIfOpen } from './historyPanel.js';
import { playEntranceAnimation } from './motion.js';

/**
 * View Manager — shows either the editor or tab panels, never both.
 */
export function setView(type) {
    const editor = document.getElementById('editor-container');
    const panels = document.getElementById('tab-panels');
    if (type === 'editor') {
        if (editor) { editor.classList.add('active'); editor.classList.remove('hidden'); }
        if (panels) { panels.classList.remove('active'); panels.classList.add('hidden'); }
    } else {
        if (editor) { editor.classList.remove('active'); editor.classList.add('hidden'); }
        if (panels) { panels.classList.add('active'); panels.classList.remove('hidden'); }
    }
}

let tabCounter = 1;
let tabContextMenu = null;
const saveQueues = new Map();
let draggedTabId = null;
let tabDropIndicator = null;
let suppressTabClick = false;

function openWelcomeTab() {
    return openTab('home', 'Welcome', 'home');
}

function isFileBackedTab(tab) {
    return Boolean(tab?.path) && (tab.type === 'file' || tab.type === 'drawio');
}

function normalizeTabPath(path) {
    return String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

/**
 * Return the new path for a tab affected by a move, or null when it is
 * unrelated. Both files and entire directory subtrees are supported.
 */
export function movedTabPath(path, oldPath, newPath) {
    const current = normalizeTabPath(path);
    const oldBase = normalizeTabPath(oldPath);
    const nextBase = normalizeTabPath(newPath);
    if (!current || !oldBase || !nextBase) return null;
    if (current === oldBase) return nextBase;
    if (current.startsWith(oldBase + '/')) return nextBase + current.slice(oldBase.length);
    return null;
}

/**
 * Save current tab state via backend API
 */
function saveTabsToStorage() {
    saveSession();
}

function sortTabsForDisplay(tabs, pinned) {
    return [...tabs].sort((a, b) => {
        const aPinned = pinned.includes(a.id) ? 0 : 1;
        const bPinned = pinned.includes(b.id) ? 0 : 1;
        return aPinned - bPinned;
    });
}

function clearTabDropIndicator() {
    if (!tabDropIndicator) return;
    tabDropIndicator.element.classList.remove('drop-before', 'drop-after');
    tabDropIndicator = null;
}

function setTabDropIndicator(element, placeAfter) {
    if (tabDropIndicator?.element === element && tabDropIndicator.placeAfter === placeAfter) return;
    clearTabDropIndicator();
    element.classList.add(placeAfter ? 'drop-after' : 'drop-before');
    tabDropIndicator = { element, placeAfter };
}

function finishTabDrag(tabStrip) {
    clearTabDropIndicator();
    tabStrip?.querySelectorAll('.tab.dragging').forEach(tab => tab.classList.remove('dragging'));
    tabStrip?.classList.remove('is-dragging');
    draggedTabId = null;
}

function getTabDropDestination(tabStrip, event) {
    if (!draggedTabId) return null;

    const tabs = getState('openTabs');
    const pinned = getState('pinnedTabs');
    const draggedPinned = pinned.includes(draggedTabId);
    const target = event.target.closest('.tab');

    if (target && tabStrip.contains(target)) {
        const targetId = target.dataset.tabId;
        if (!targetId || targetId === draggedTabId || pinned.includes(targetId) !== draggedPinned) return null;
        const bounds = target.getBoundingClientRect();
        return {
            targetId,
            placeAfter: event.clientX >= bounds.left + bounds.width / 2,
            element: target,
        };
    }

    const visibleTabs = sortTabsForDisplay(tabs, pinned)
        .filter(tab => tab.id !== draggedTabId && pinned.includes(tab.id) === draggedPinned);
    if (!visibleTabs.length) return null;

    const tabElements = visibleTabs
        .map(tab => tabStrip.querySelector(`.tab[data-tab-id="${tab.id}"]`))
        .filter(Boolean);
    if (!tabElements.length) return null;

    const first = tabElements[0];
    const last = tabElements[tabElements.length - 1];
    const firstBounds = first.getBoundingClientRect();
    if (event.clientX < firstBounds.left + firstBounds.width / 2) {
        return { targetId: first.dataset.tabId, placeAfter: false, element: first };
    }
    return { targetId: last.dataset.tabId, placeAfter: true, element: last };
}

/**
 * Move one tab before or after another tab in the same pin group.
 * Pinned tabs deliberately stay together at the left edge of the tab strip.
 */
export function reorderTab(tabId, targetTabId, placeAfter = false) {
    const tabs = getState('openTabs');
    const pinned = getState('pinnedTabs');
    const sourceIndex = tabs.findIndex(tab => tab.id === tabId);
    const targetIndex = tabs.findIndex(tab => tab.id === targetTabId);

    if (sourceIndex < 0 || targetIndex < 0 || tabId === targetTabId) return false;
    if (pinned.includes(tabId) !== pinned.includes(targetTabId)) return false;

    const reordered = [...tabs];
    const [moved] = reordered.splice(sourceIndex, 1);
    const targetAfterRemoval = reordered.findIndex(tab => tab.id === targetTabId);
    reordered.splice(targetAfterRemoval + (placeAfter ? 1 : 0), 0, moved);

    if (reordered.every((tab, index) => tab.id === tabs[index].id)) return false;

    setState('openTabs', reordered);
    saveTabsToStorage();
    renderTabBar();
    return true;
}

/**
 * Initialize tab manager
 */
export function initTabManager() {
    const tabStrip = document.getElementById('tab-strip');
    if (tabStrip) {
        tabStrip.addEventListener('click', (e) => {
            if (suppressTabClick) {
                e.preventDefault();
                return;
            }
            const tabBtn = e.target.closest('.tab');
            const closeBtn = e.target.closest('.tab-close');
            
            if (closeBtn) {
                e.stopPropagation();
                const tabId = closeBtn.closest('.tab').dataset.tabId;
                closeTab(tabId);
            } else if (tabBtn) {
                const tabId = tabBtn.dataset.tabId;
                switchTab(tabId);
            }
        });

        // Middle-click to close tab
        tabStrip.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                const tabEl = e.target.closest('.tab');
                if (tabEl) {
                    e.preventDefault();
                    closeTab(tabEl.dataset.tabId);
                }
            }
        });

        tabStrip.addEventListener('contextmenu', handleTabContextMenu);

        tabStrip.addEventListener('dragstart', (e) => {
            const tab = e.target.closest('.tab');
            if (!tab || e.target.closest('.tab-close')) {
                e.preventDefault();
                return;
            }

            draggedTabId = tab.dataset.tabId;
            tab.classList.add('dragging');
            tabStrip.classList.add('is-dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedTabId);
            }
        });

        tabStrip.addEventListener('dragover', (e) => {
            const destination = getTabDropDestination(tabStrip, e);
            if (!destination) {
                clearTabDropIndicator();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
                return;
            }

            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            setTabDropIndicator(destination.element, destination.placeAfter);
        });

        tabStrip.addEventListener('dragleave', (e) => {
            if (!tabStrip.contains(e.relatedTarget)) clearTabDropIndicator();
        });

        tabStrip.addEventListener('drop', (e) => {
            const destination = getTabDropDestination(tabStrip, e);
            if (!destination) return;

            e.preventDefault();
            const tabId = draggedTabId;
            finishTabDrag(tabStrip);
            if (tabId && reorderTab(tabId, destination.targetId, destination.placeAfter)) {
                suppressTabClick = true;
                setTimeout(() => { suppressTabClick = false; }, 0);
            }
        });

        tabStrip.addEventListener('dragend', () => {
            finishTabDrag(tabStrip);
            suppressTabClick = true;
            setTimeout(() => { suppressTabClick = false; }, 0);
        });

        tabStrip.addEventListener('keydown', (e) => {
            const tabEl = e.target.closest('.tab');
            if (!tabEl || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;

            const tabs = [...tabStrip.querySelectorAll('.tab')];
            const currentIndex = tabs.indexOf(tabEl);
            let nextIndex = currentIndex;
            if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
            if (e.key === 'Home') nextIndex = 0;
            if (e.key === 'End') nextIndex = tabs.length - 1;

            const nextTab = tabs[nextIndex];
            if (nextTab) {
                e.preventDefault();
                nextTab.focus();
                switchTab(nextTab.dataset.tabId);
            }
        });
    }

    // Close tab context menu on outside click
    document.addEventListener('click', (e) => {
        if (tabContextMenu && !e.target.closest('.tab-context-menu')) {
            tabContextMenu.remove();
            tabContextMenu = null;
        }
    });
    
    // Subscribe to tab changes
    subscribe('openTabs', renderTabBar);
    subscribe('activeTabId', renderTabBar);
    subscribe('pinnedTabs', renderTabBar);

    // All-tabs dropdown
    initAllTabsDropdown();
}

/**
 * Open a new tab or switch to existing
 */
export function openTab(id, title, type, data = {}, forceNew = false) {
    const tabs = getState('openTabs');
    
    if (!forceNew) {
        const existing = tabs.find(t => t.id === id);
        if (existing) {
            if (existing.type === 'file' && data.line) existing.searchLine = data.line;
            switchTab(existing.id);
            return existing;
        }
    }
    
    const tab = {
        id: id || `tab-${tabCounter++}`,
        title,
        type,
        dirty: false
    };
    
    switch (type) {
    case 'file':
        tab.path = data.path;
        tab.mtime = data.mtime;
        tab.isNew = data.isNew || false;
        tab.cursorState = null;
        tab.searchLine = data.line || null;
        break;
    case 'drawio':
        tab.path = data.path;
        tab.mtime = data.mtime;
        break;
    case 'calendar':
        tab.dateStr = data.dateStr;
        break;
    case 'backlinks':
        tab.targetPath = data.targetPath;
        break;
    case 'kanban':
        tab.focusCol = data.focusCol;
        break;
    case 'settings':
        break;
    case 'home':
        break;
    }
    
    const newTabs = [...tabs, tab];
    setState('openTabs', newTabs);
    setState('activeTabId', tab.id);
    saveTabsToStorage();
    
    renderTabBar();
    switchTab(tab.id);
    
    return tab;
}

export function switchTab(tabId) {
    const tabs = getState('openTabs');
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    const currentActiveId = getState('activeTabId');
    if (currentActiveId && currentActiveId !== tabId) {
        const currentTab = tabs.find(t => t.id === currentActiveId);
        if (currentTab && currentTab.type === 'file') {
            // Cache content in memory BEFORE switching away (survives even if save fails)
            const ed = getEditorView();
            if (ed && ed.state) {
                currentTab._content = ed.state.doc.toString();
            }
            currentTab.cursorState = saveCursorState(currentActiveId);
        }
    }
    
    if (currentActiveId && currentActiveId !== tabId) {
        const currentTab = tabs.find(t => t.id === currentActiveId);
        if (currentTab && currentTab.dirty && currentTab.type === 'file') {
            saveActiveFile();
        }
    }
    
    setState('activeTabId', tabId);
    saveTabsToStorage();

    if (tab.type === 'file' && tab.path) {
        recordRecentFile(tab.path, tab.title);
    }
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    renderTabContent(tab);
    renderTabBar();

    closeHistoryPanel();
    
    if (tab.type === 'file') {
        setTimeout(() => focusEditor(), 0);
        if (tab.cursorState && !tab.searchLine) {
            setTimeout(() => restoreCursorState(tabId, tab.cursorState), 50);
        }
    }
}

async function renderTabContent(tab) {
    if (tab.type === 'file') {
        setView('editor');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        if (!getEditorView()) {
            const { createEditorView } = await import('./editor.js');
            createEditorView();
        }
        renderFileTab(null, tab);
    } else {
        setView('panels');
        const panelsContainer = document.getElementById('tab-panels');
        
        let panel = panelsContainer.querySelector(`[data-tab-id="${tab.id}"]`);
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'tab-panel';
            panel.dataset.tabId = tab.id;
            panelsContainer.appendChild(panel);
        }
        panel.classList.add('active');

        if (['calendar', 'kanban', 'settings'].includes(tab.type)) {
            playEntranceAnimation(panel);
        }
        
        switch (tab.type) {
        case 'home': renderHomeTab(panel, tab); break;
        case 'calendar': renderCalendarTab(panel, tab); break;
        case 'backlinks': renderBacklinksTab(panel, tab); break;
        case 'kanban': renderKanbanTab(panel, tab); break;
        case 'settings': renderSettingsTab(panel, tab); break;
        case 'drawio': renderDrawioDiagramTab(panel, tab); break;
        }
    }
}

async function renderFileTab(panel, tab) {
    if (!tab.isNew && tab.path) loadFileContent(tab);
}

async function loadFileContent(tab) {
    const loadId = (tab._loadGeneration || 0) + 1;
    tab._loadGeneration = loadId;
    try {
        // If we have cached content from a previous switch-away and the tab
        // is still dirty, use the cache instead of re-reading from disk.
        // This prevents data loss if the auto-save on switch-away failed.
        if (tab._content != null && tab.dirty) {
            const configured = await configureEditorForFile(tab.path);
            if (!configured || tab.id !== getState('activeTabId') || tab._loadGeneration !== loadId) return;
            setEditorContent(tab._content);
            document.dispatchEvent(new CustomEvent('tab-switched', { detail: { path: tab.path } }));
            focusSearchLine(tab);
            return;
        }
        
        const result = await window.pywebview.api.read_file(tab.path);
        if (result) {
            if (result.binary) {
                statusBar.set('Cannot edit binary file');
                return;
            }
            if (tab.id !== getState('activeTabId') || tab._loadGeneration !== loadId || tab.dirty) return;
            const configured = await configureEditorForFile(tab.path);
            if (!configured || tab.id !== getState('activeTabId') || tab._loadGeneration !== loadId || tab.dirty) return;
            setEditorContent(result.content);
            tab._content = result.content;
            tab.mtime = result.mtime;
            document.dispatchEvent(new CustomEvent('tab-switched', { detail: { path: tab.path } }));
            tab.dirty = false;
            focusSearchLine(tab);
        }
    } catch (err) {
        log.error('Failed to load file:', err);
        statusBar.set('Failed to load file');
    }
}

function focusSearchLine(tab) {
    const lineNumber = Number(tab.searchLine);
    if (!Number.isInteger(lineNumber) || lineNumber < 1) return;
    tab.searchLine = null;

    setTimeout(() => {
        const editor = getEditorView();
        if (!editor?.state?.doc || tab.id !== getState('activeTabId')) return;

        const line = editor.state.doc.line(Math.min(lineNumber, editor.state.doc.lines));
        editor.dispatch?.({ selection: { anchor: line.from }, scrollIntoView: true });
    }, 0);
}

function renderHomeTab(panel, tab) {
    import('./home.js').then(({ renderHome }) => {
        if (tab.id === getState('activeTabId') && panel.isConnected) renderHome(panel);
    }).catch(error => {
        log.error('Failed to render Home tab:', error);
        panel.innerHTML = '<div class="home-view"><p class="home-empty">Home is unavailable right now.</p></div>';
    });
}

function renderCalendarTab(panel, tab) {
    panel.innerHTML = `<div class="calendar-view-wrapper"><div class="calendar-view-header"><h2>Mention of Date: [[${tab.dateStr}]]</h2></div><div class="results-list" id="calendar-results-${tab.dateStr}"></div></div>`;
    import('./calendar.js').then(({ loadCalendarResults }) => {
        loadCalendarResults(tab.dateStr, `calendar-results-${tab.dateStr}`);
    });
}

function renderBacklinksTab(panel, tab) {
    const fileName = tab.targetPath.split('/').pop().replace('.md', '');
    panel.innerHTML = `<div class="backlinks-view-wrapper"><div class="backlinks-view-header"><h2>Backlinks for [[${fileName}]]</h2><p class="backlinks-subtitle">Files that link to this note</p></div><div class="results-list" id="backlinks-results-${tab.id}"></div></div>`;
    import('./backlinks.js').then(({ loadBacklinksResults }) => {
        loadBacklinksResults(tab.targetPath, `backlinks-results-${tab.id}`);
    });
}

function renderKanbanTab(panel, tab) {
    panel.innerHTML = '<div class="kanban-view-wrapper"><div class="kanban-view-header"><h2>Kanban Task Board</h2><p class="kanban-instruction">Drag cards between columns. Click a card to open its source note. Columns are created from #tags in your notes.</p></div><div class="kanban-board" id="kanban-board-main"></div></div>';
    import('./kanban.js').then(({ renderKanbanBoard }) => {
        renderKanbanBoard('kanban-board-main', tab.focusCol);
    });
}

function renderDrawioDiagramTab(panel, tab) {
    import('./drawio.js').then(({ renderDrawioTab }) => {
        if (tab.id === getState('activeTabId') && panel.isConnected) renderDrawioTab(panel, tab);
    }).catch(error => {
        log.error('Failed to render draw.io tab:', error);
        panel.innerHTML = '<div class="drawio-view"><p class="drawio-error">Diagram editor is unavailable right now.</p></div>';
    });
}

export async function closeTab(tabId, event) {
    if (event) event.stopPropagation();
    const tabs = getState('openTabs');
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return false;
    if (tab.type === 'home' && tabs.length === 1) return false;
    
    if (tab.dirty && (tab.type === 'file' || tab.type === 'drawio')) {
        const shouldClose = await window.confirmDialog('Unsaved Changes', `"${tab.title}" has unsaved changes. Close anyway?`);
        if (!shouldClose) return false;
    }
    
    const panel = document.querySelector(`.tab-panel[data-tab-id="${tabId}"]`);
    if (panel) {
        panel._settingsPanelDisposed = tab.type === 'settings';
        panel._drawioSession?.dispose?.();
        panel.remove();
    }
    
    // Unpin if pinned
    const pinned = getState('pinnedTabs');
    if (pinned.includes(tabId)) {
        setState('pinnedTabs', pinned.filter(id => id !== tabId));
    }
    
    const newTabs = tabs.filter(t => t.id !== tabId);
    setState('openTabs', newTabs);
    saveTabsToStorage();
    
    const activeId = getState('activeTabId');
    if (newTabs.length === 0) {
        setState('activeTabId', null);
        openWelcomeTab();
    } else if (activeId === tabId) {
        const fileTab = newTabs.find(t => t.type === 'file');
        switchTab(fileTab ? fileTab.id : newTabs[0].id);
    }
    return true;
}

/**
 * Replace the active file tab after following a link. A dirty note is saved
 * first; if saving cannot complete, the destination opens in a new tab so the
 * source remains intact instead of being discarded.
 */
export async function replaceActiveFileTab(id, title, type, data = {}) {
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.type !== 'file') {
        openTab(id, title, type, data);
        return false;
    }

    if (activeTab.dirty) {
        try {
            const saved = await saveActiveFile();
            if (!saved?.success) {
                statusBar.set('Current note was not saved; opened link in a new tab');
                openTab(id, title, type, data);
                return false;
            }
        } catch (error) {
            log.warn('Could not save note before following link:', error);
            statusBar.set('Current note was not saved; opened link in a new tab');
            openTab(id, title, type, data);
            return false;
        }
    }

    // Saving is asynchronous. Do not remove a tab if the user switched tabs
    // or the destination was opened while the save was in flight.
    const tabs = getState('openTabs');
    const current = tabs.find(tab => tab.id === activeTab.id);
    if (getState('activeTabId') !== activeTab.id || current !== activeTab || tabs.some(tab => tab.id === id)) {
        openTab(id, title, type, data);
        return false;
    }

    const pinned = getState('pinnedTabs');
    const wasPinned = pinned.includes(activeTab.id);
    setState('openTabs', tabs.filter(tab => tab.id !== activeTab.id));
    if (wasPinned) {
        setState('pinnedTabs', [...new Set(pinned.filter(tabId => tabId !== activeTab.id).concat(id))]);
    }

    openTab(id, title, type, data);
    return true;
}

/**
 * Keep open file and Draw.io tabs, their panel identities, pin state, and the
 * persisted session in sync after a successful filesystem move.
 */
export function updateTabsForMovedPath(oldPath, newPath) {
    const tabs = getState('openTabs');
    const idChanges = new Map();
    let changed = false;

    for (const tab of tabs) {
        if (!isFileBackedTab(tab)) continue;
        const movedPath = movedTabPath(tab.path, oldPath, newPath);
        if (!movedPath) continue;

        const oldId = tab.id;
        tab.path = movedPath;
        tab.title = movedPath.split('/').pop() || tab.title;
        if (oldId === normalizeTabPath(oldPath) || oldId.startsWith(normalizeTabPath(oldPath) + '/')) {
            tab.id = movedPath;
            idChanges.set(oldId, movedPath);
        }
        changed = true;
    }

    if (!changed) return false;

    const pinned = getState('pinnedTabs');
    const nextPinned = [...new Set(pinned.map(tabId => idChanges.get(tabId) || tabId))];
    if (nextPinned.some((tabId, index) => tabId !== pinned[index]) || nextPinned.length !== pinned.length) {
        setState('pinnedTabs', nextPinned);
    }

    const activeId = getState('activeTabId');
    if (idChanges.has(activeId)) setState('activeTabId', idChanges.get(activeId));

    document.querySelectorAll('.tab-panel').forEach(panel => {
        const nextId = idChanges.get(panel.dataset.tabId);
        if (nextId) panel.dataset.tabId = nextId;
    });

    for (const tab of tabs) {
        if (tab.type !== 'drawio' || !tab.path) continue;
        const panel = [...document.querySelectorAll('.tab-panel')]
            .find(candidate => candidate.dataset.tabId === tab.id);
        if (!panel) continue;
        panel._drawioPath = tab.path;
        const title = panel.querySelector('.drawio-title');
        if (title) title.textContent = tab.title;
    }

    setState('openTabs', [...tabs]);
    saveTabsToStorage();
    renderTabBar();

    const activeTab = getActiveTab();
    if (activeTab?.type === 'file' && activeTab.path) {
        import('./editor.js').then(({ setImageBasePath }) => setImageBasePath(activeTab.path)).catch(() => {});
    }
    return true;
}

/**
 * Persist file-backed tabs before a filesystem move changes their paths.
 * Draw.io has an independent editor protocol, so a dirty diagram must be
 * explicitly saved from that editor rather than silently moving stale SVG.
 */
export async function prepareTabsForPathMove(path) {
    const normalized = normalizeTabPath(path);
    const affected = getState('openTabs').filter(tab => isFileBackedTab(tab) &&
        (normalizeTabPath(tab.path) === normalized || normalizeTabPath(tab.path).startsWith(normalized + '/')));
    // A move can rewrite links in any Markdown note, not just the file being
    // moved. Persist open Markdown edits first so the backend refactor sees
    // the latest content and no stale tab can later overwrite its rewrite.
    const dirtyMarkdownTabs = getState('openTabs').filter(tab =>
        tab?.type === 'file' && tab.dirty && /\.md$/i.test(tab.path || ''));
    const tabsToPrepare = [...new Map([...affected, ...dirtyMarkdownTabs]
        .map(tab => [tab.id, tab])).values()];

    for (const tab of tabsToPrepare) {
        if (tab.type === 'drawio') {
            const panel = [...document.querySelectorAll('.tab-panel')]
                .find(candidate => candidate.dataset.tabId === tab.id);
            if (tab.dirty || panel?._drawioSession?.saving) {
                return { success: false, error: `Save "${tab.title}" before moving it` };
            }
            continue;
        }
        if (!tab.dirty) continue;
        const content = tab.id === getState('activeTabId') ? getEditorContent() : tab._content;
        if (typeof content !== 'string') {
            return { success: false, error: `Could not save "${tab.title}" before moving it` };
        }
        try {
            const result = await saveFileSnapshot(tab, content);
            if (!result?.success) {
                return { success: false, error: result?.error || `Could not save "${tab.title}" before moving it` };
            }
        } catch (error) {
            log.warn('Could not save tab before move:', error);
            return { success: false, error: `Could not save "${tab.title}" before moving it` };
        }
    }

    await Promise.all(tabsToPrepare
        .map(tab => saveQueues.get(tab.path))
        .filter(Boolean)
        .map(save => save.catch(() => {})));
    return { success: true };
}

/**
 * Reload open Markdown tabs whose on-disk contents were changed by a move's
 * backlink rewrite. prepareTabsForPathMove has already persisted dirty notes,
 * so this only replaces clean snapshots with the backend's authoritative text.
 */
export async function refreshTabsForUpdatedLinks(paths) {
    const updatedPaths = new Set((Array.isArray(paths) ? paths : [])
        .map(normalizeTabPath)
        .filter(Boolean));
    if (!updatedPaths.size) return false;

    const tabs = getState('openTabs');
    let changed = false;

    for (const tab of tabs) {
        if (tab?.type !== 'file' || !updatedPaths.has(normalizeTabPath(tab.path)) || tab.dirty) continue;
        try {
            const file = await window.pywebview.api.read_file(tab.path);
            // A user edit or tab move while the read was in flight always wins
            // over a delayed reload.
            if (!file || file.binary || tab.dirty || !updatedPaths.has(normalizeTabPath(tab.path))) continue;
            tab._content = file.content;
            tab.mtime = file.mtime;
            if (tab.id === getState('activeTabId')) {
                setEditorContent(file.content);
            }
            changed = true;
        } catch (error) {
            log.warn('Could not refresh a link-updated tab:', error);
        }
    }

    if (changed) {
        setState('openTabs', [...tabs]);
        saveTabsToStorage();
    }
    return changed;
}

/**
 * Remove every file-backed tab whose file was deleted, including Draw.io
 * diagrams. This intentionally does not prompt: the filesystem deletion has
 * already been confirmed, and leaving a stale editor would be misleading.
 */
export function closeTabsForDeletedPath(deletedPath) {
    const normalized = normalizeTabPath(deletedPath);
    if (!normalized) return false;

    const tabs = getState('openTabs');
    const tabsToClose = tabs.filter(tab => isFileBackedTab(tab) &&
        (normalizeTabPath(tab.path) === normalized || normalizeTabPath(tab.path).startsWith(normalized + '/')));
    if (!tabsToClose.length) return false;

    const closingIds = new Set(tabsToClose.map(tab => tab.id));
    document.querySelectorAll('.tab-panel').forEach(panel => {
        if (!closingIds.has(panel.dataset.tabId)) return;
        panel._settingsPanelDisposed = false;
        panel._drawioSession?.dispose?.();
        panel.remove();
    });

    const newTabs = tabs.filter(tab => !closingIds.has(tab.id));
    setState('openTabs', newTabs);
    const pinned = getState('pinnedTabs');
    if (pinned.some(tabId => closingIds.has(tabId))) {
        setState('pinnedTabs', pinned.filter(tabId => !closingIds.has(tabId)));
    }

    const activeId = getState('activeTabId');
    if (closingIds.has(activeId)) {
        if (newTabs.length) {
            const preferred = newTabs.find(tab => tab.type === 'file') || newTabs[0];
            switchTab(preferred.id);
        } else {
            setState('activeTabId', null);
            openWelcomeTab();
        }
    } else {
        saveTabsToStorage();
        renderTabBar();
    }
    return true;
}

export function getActiveTab() {
    const activeId = getState('activeTabId');
    if (!activeId) return null;
    const tabs = getState('openTabs');
    return tabs.find(t => t.id === activeId) || null;
}

export function markTabDirty(tabId) {
    const tabs = getState('openTabs');
    const tab = tabs.find(t => t.id === tabId);
    if (tab && !tab.dirty) {
        tab.dirty = true;
        setState('openTabs', [...tabs]);
        renderTabBar();
    }
}

export function updateTabTitle(tabId, title) {
    const tabs = getState('openTabs');
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.title = title;
        setState('openTabs', [...tabs]);
        renderTabBar();
    }
}

function togglePinTab(tabId) {
    const pinned = [...getState('pinnedTabs')];
    const idx = pinned.indexOf(tabId);
    if (idx >= 0) {
        pinned.splice(idx, 1);
    } else {
        pinned.push(tabId);
    }
    setState('pinnedTabs', pinned);
    saveTabsToStorage();
}

/**
 * Render tab bar — pinned tabs sorted leftmost
 */
export function renderTabBar() {
    const tabStrip = document.getElementById('tab-strip');
    const activeId = getState('activeTabId');
    const tabs = getState('openTabs');
    const pinned = getState('pinnedTabs');
    
    if (!tabStrip) return;
    
    // Sort: pinned first, then unpinned.
    const sorted = sortTabsForDisplay(tabs, pinned);
    
    tabStrip.innerHTML = sorted.map(tab => {
        const isPinned = pinned.includes(tab.id);
        const canClose = tab.type !== 'home' || tabs.length > 1;
        return `
        <div class="tab ${tab.id === activeId ? 'active' : ''} ${tab.dirty ? 'dirty' : ''} ${isPinned ? 'pinned' : ''}" 
                data-tab-id="${tab.id}"
                role="tab"
                draggable="true"
                tabindex="${tab.id === activeId ? '0' : '-1'}"
                aria-selected="${tab.id === activeId}"
                title="${tab.title}${tab.dirty ? ' (unsaved)' : ''}${isPinned ? ' (pinned)' : ''}">
            <span class="tab-icon">${getTabIcon(tab.type)}</span>
            <span class="tab-title">${escapeHtml(tab.title)}</span>
            <button class="tab-close" aria-label="Close tab" title="${canClose ? 'Close tab' : 'Welcome stays open while it is the only tab'}"${canClose ? '' : ' disabled aria-disabled="true"'}>✕</button>
        </div>
    `;}).join('');
}

function getTabIcon(type) {
    switch (type) {
    case 'file': return fileIcon(14, 2);
    case 'drawio': return fileIcon(14, 2);
    case 'calendar': return calendarIcon(14, 2);
    case 'backlinks': return backlinksIcon(14, 2);
    case 'kanban': return kanbanIcon(14, 2);
    case 'settings': return settingsIcon(14, 2);
    case 'home': return homeIcon(14, 2);
    default: return '';
    }
}

function handleTabContextMenu(e) {
    e.preventDefault();
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;

    const tabId = tabEl.dataset.tabId;
    const tabs = getState('openTabs');
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (tabContextMenu) tabContextMenu.remove();

    const pinned = getState('pinnedTabs');
    const isPinned = pinned.includes(tabId);
    const canClose = tab.type !== 'home' || tabs.length > 1;

    tabContextMenu = document.createElement('div');
    tabContextMenu.className = 'context-menu tab-context-menu';
    tabContextMenu.style.left = `${e.clientX}px`;
    tabContextMenu.style.top = `${e.clientY}px`;

    tabContextMenu.innerHTML = `
        <div class="context-menu-item" data-action="toggle-pin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
            ${isPinned ? 'Unpin Tab' : 'Pin Tab'}
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item ${canClose ? '' : 'disabled'}" data-action="close-tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close Tab
        </div>
    `;
    document.body.appendChild(tabContextMenu);

    tabContextMenu.addEventListener('click', (ev) => {
        const menuItem = ev.target.closest('.context-menu-item');
        if (!menuItem) return;
        const action = menuItem.dataset.action;

        if (action === 'toggle-pin') {
            togglePinTab(tabId);
        } else if (action === 'close-tab') {
            closeTab(tabId);
        }
        tabContextMenu.remove();
        tabContextMenu = null;
    });
}

export function saveActiveFile() {
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.type !== 'file' || !getEditorView()) return Promise.resolve(null);
    return saveFileSnapshot(activeTab, getEditorContent());
}

// Queue saves by path. Every subsequent save reads the tab's latest mtime only
// after its predecessor finishes, turning the backend's optimistic check into
// a real per-file compare-and-swap sequence.
export function saveFileSnapshot(tab, content) {
    if (!tab?.path || typeof content !== 'string') return Promise.resolve(null);

    const path = tab.path;
    const generation = (tab._saveGeneration || 0) + 1;
    tab._saveGeneration = generation;
    const previous = saveQueues.get(path) || Promise.resolve();
    const queued = previous
        .catch(() => {})
        .then(() => persistFileSnapshot(tab, content, generation));

    saveQueues.set(path, queued);
    queued.finally(() => {
        if (saveQueues.get(path) === queued) saveQueues.delete(path);
    }).catch(() => {});
    return queued;
}

async function persistFileSnapshot(tab, content, generation) {
    const path = tab.path;
    const save = async (expectedMtime) => window.pywebview.api.save_file(path, content, expectedMtime || 0);

    try {
        const result = await save(tab.mtime);
        if (result.success) {
            applySaveSuccess(tab, result, generation, 'Saved', content);
            return result;
        }

        const shouldOverwrite = await window.confirmDialog('File Changed Externally', 'This file has been modified by another application. Overwrite with your changes?');
        if (shouldOverwrite) {
            const forceResult = await save(0);
            if (forceResult.success) {
                applySaveSuccess(tab, forceResult, generation, 'Saved (forced)', content);
                return forceResult;
            }
            return forceResult;
        }
        return result;
    } catch (err) {
        log.error('Save failed:', err);
        if (tab._saveGeneration === generation) statusBar.set('Save failed');
        throw err;
    }
}

function applySaveSuccess(tab, result, generation, message, content) {
    tab.mtime = result.mtime;
    const tabsForPath = getState('openTabs').filter(candidate => (candidate.type === 'file' || candidate.type === 'drawio') && candidate.path === tab.path);
    tabsForPath.forEach(candidate => {
        candidate.mtime = result.mtime;
    });
    if (tab._saveGeneration !== generation) return;

    tab.dirty = false;
    tab._content = null;
    updateTabTitle(tab.id, tab.title);
    document.dispatchEvent(new CustomEvent('vault-file-saved', {
        detail: { path: tab.path, content, mtime: result.mtime }
    }));
    statusBar.set(message);
    import('./calendar.js').then(m => m.renderCalendar()).catch(() => {});
    refreshHistoryIfOpen();
    setTimeout(() => statusBar.set('Ready'), 1000);
}

function initAllTabsDropdown() {
    const btn = document.getElementById('all-tabs-btn');
    const dropdown = document.getElementById('all-tabs-dropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !dropdown.classList.contains('hidden');
        if (open) {
            dropdown.classList.add('hidden');
        } else {
            renderAllTabsDropdown(dropdown);
            dropdown.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#all-tabs-dropdown') && !e.target.closest('#all-tabs-btn')) {
            dropdown.classList.add('hidden');
        }
    });

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.all-tabs-item');
        if (!item) return;
        dropdown.classList.add('hidden');
        switchTab(item.dataset.tabId);
    });

    subscribe('openTabs', () => {
        if (!dropdown.classList.contains('hidden')) renderAllTabsDropdown(dropdown);
    });
    subscribe('activeTabId', () => {
        if (!dropdown.classList.contains('hidden')) renderAllTabsDropdown(dropdown);
    });
}

function renderAllTabsDropdown(dropdown) {
    const tabs = getState('openTabs');
    const activeId = getState('activeTabId');
    dropdown.innerHTML = tabs.map(t => {
        const active = t.id === activeId ? ' active' : '';
        const dirty = t.dirty ? ' dirty' : '';
        return `<div class="all-tabs-item${active}${dirty}" data-tab-id="${t.id}">
            <span>${escapeHtml(t.title || t.id)}</span>
        </div>`;
    }).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default {
    initTabManager,
    openTab,
    closeTab,
    switchTab,
    getActiveTab,
    markTabDirty,
    updateTabTitle,
    reorderTab,
    movedTabPath,
    replaceActiveFileTab,
    updateTabsForMovedPath,
    prepareTabsForPathMove,
    refreshTabsForUpdatedLinks,
    closeTabsForDeletedPath,
    saveActiveFile,
    saveFileSnapshot,
    renderTabBar
};


function renderSettingsTab(panel, _tab) {
    // Only render content once while this tab remains open.
    if (panel.querySelector('.settings-panel-tab')) return;
    
    const container = document.createElement('div');
    container.className = 'settings-panel-tab';
    container.innerHTML = `<div class="settings-grid">
            <!-- Appearance -->
            <div class="settings-card">
                <div class="settings-card-title">Appearance</div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/><path d="M2 12h20"/></svg>
                        <span>Theme</span>
                    </div>
                    <div class="theme-picker">
                        <button class="theme-picker-btn" id="theme-picker-btn">
                            <span id="theme-current-name">Loading…</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="theme-picker-menu" id="theme-picker-menu"></div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                        <span>Font</span>
                    </div>
                    <div class="font-picker">
                        <button class="font-picker-btn" id="font-picker-btn">
                            <span id="font-current-name">Inter</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="font-picker-menu" id="font-picker-menu"></div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M4 9h11M4 13h16M4 17h11"/><path d="M17 17l2 2 3-4"/></svg>
                        <span>Code Font</span>
                    </div>
                    <div class="font-picker">
                        <button class="font-picker-btn" id="code-font-picker-btn" title="Used only for code files">
                            <span id="code-font-current-name">Theme default</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="font-picker-menu" id="code-font-picker-menu"></div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 8 12 4 20 8"/><polyline points="4 16 12 20 20 16"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                        <span>Font Size</span>
                    </div>
                    <div class="font-size-control">
                        <button class="font-size-btn" id="font-size-down" title="Decrease">−</button>
                        <span class="font-size-value" id="font-size-value">100%</span>
                        <button class="font-size-btn" id="font-size-up" title="Increase">+</button>
                    </div>
                </div>
            </div>
            <!-- Editor -->
            <div class="settings-card">
                <div class="settings-card-title">Editor</div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                        <span>Text Width</span>
                    </div>
                    <div class="text-width-control">
                        <button class="text-width-btn" id="text-width-down" title="Narrower">−</button>
                        <span class="text-width-value" id="text-width-value">100%</span>
                        <button class="text-width-btn" id="text-width-up" title="Wider">+</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h4"/></svg>
                        <span>Vim Mode</span>
                    </div>
                    <div class="settings-row">
                        <span class="settings-row-label">Enable Vim</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="vim-toggle">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            <!-- Automation -->
            <div class="settings-card">
                <div class="settings-card-title">Automation</div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span>Auto-Save</span>
                    </div>
                    <select id="auto-save-interval" class="auto-save-select">
                        <option value="5">5 seconds</option>
                        <option value="10">10 seconds</option>
                        <option value="30">30 seconds</option>
                        <option value="60">1 minute</option>
                        <option value="300" selected>5 minutes</option>
                        <option value="0">Off</option>
                    </select>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span>Auto-Commit</span>
                    </div>
                    <select id="auto-commit-interval" class="auto-save-select">
                        <option value="0" selected>Off</option>
                        <option value="3600">1 hour</option>
                        <option value="7200">2 hours</option>
                        <option value="14400">4 hours</option>
                        <option value="28800">8 hours</option>
                    </select>
                </div>
            </div>
        </div>`;
    panel.appendChild(container);

    // The panel is removed when Settings closes, so initialize each new panel
    // rather than retaining a module-wide "already initialized" flag.
    panel._settingsPanelDisposed = false;
    import('./theme.js').then(m => {
        if (!panel.isConnected || panel._settingsPanelDisposed) return;
        const initFn = m.initSettingsPanel || (m.default && m.default.initSettingsPanel);
        if (initFn) return initFn(panel);
    }).catch(err => {
        log.warn('Settings tab init failed:', err);
    });
}
