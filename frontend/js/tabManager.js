import { backend } from './backend.js';
/**
 * Tab Manager - Handles tab creation, switching, closing, and state
 */

import { log } from './log.js';
import { fileIcon, calendarIcon, backlinksIcon, kanbanIcon, settingsIcon, warningIcon } from './icons.js';
import { setState, getState, subscribe, recordRecentFile } from './state.js';
import { saveSession } from './session.js';
import { getEditorView, getEditorContent, getEditorDocumentTabId, setEditorContent, focusEditor, saveCursorState, configureEditorForFile, createEditorView, setImageBasePath } from './editor.js';
import { statusBar } from './statusBar.js';
import { errorDialog } from './dialogs.js';
import { closeHistoryPanel, refreshHistoryIfOpen } from './historyPanel.js';
import { playEntranceAnimation, playExitAnimation } from './motion.js';
import { shouldCommitOnSave } from './automation.js';
import { renderHome } from './home.js';
import { invalidateCalendarCache, loadCalendarResults, refreshCalendarIfVisible } from './calendar.js';
import { loadBacklinksResults } from './backlinks.js';
import {
    applyKanbanPresentationToViews,
    initKanbanPresentationSettings,
    renderKanbanBoard,
} from './kanban.js';
import { renderVaultHealth } from './vaultHealth.js';
import { renderDrawioTab } from './drawio.js';
import { initSettingsPanel } from './theme.js';
import { isLatestSave, savedLatestEdit, saveFailureStatusMessage, saveStatusMessage } from './core/saveModel.js';
import { activeTabScrollTarget, tabOverflowState } from './core/tabOverflowModel.js';
import { hasTabDragStarted, reorderedTabs } from './core/tabReorderModel.js';
import { boundedAdjacentTabId } from './core/tabNavigationModel.js';
import { wheelTabNavigationPlan } from './core/tabWheelModel.js';
import { editorTextScaleWheelPlan } from './core/editorTextScaleModel.js';
import {
    applyEditorTextScale,
    getBufferEditorTextScale,
    getConfiguredEditorTextScale,
    renderEditorTextScaleStatus,
    resetBufferEditorTextScale,
    setBufferEditorTextScale,
} from './editorTextScale.js';
import {
    compactTabTitle,
    tabAccessibleLabel,
    tabLocationLabel,
} from './core/tabPresentationModel.js';
import { createDocumentSave } from './usecases/documentSave.js';
import { loadApplicationVersion } from './usecases/loadApplicationVersion.js';
import { initRecentlyDeletedSettings } from './recentlyDeleted.js';
import { fileTabReadTarget } from './core/externalFileModel.js';
import { initialFrontmatterBodySelection } from './frontmatter.js';
import { isMarkdownFilePath } from './languageSupport.js';
import {
    configureContextMenu,
    contextMenuAnchorPoint,
    dismissContextMenu,
} from './contextMenu.js';

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

/**
 * Show the workspace overview without manufacturing a permanent tab for it.
 * Existing tabs remain open and can be selected again from the tab strip.
 */
export function showWorkspaceHome() {
    const currentTab = getActiveTab();
    snapshotActiveFileTab(currentTab);

    setState('activeTabId', null);
    synchronizeEditorTextScale(null);
    document.dispatchEvent(new CustomEvent('active-tab-changed', {
        detail: { path: null, type: 'workspace-home' },
    }));

    setView('panels');
    const panelsContainer = document.getElementById('tab-panels');
    if (!panelsContainer) return;

    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    let panel = panelsContainer.querySelector('.workspace-home-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'tab-panel workspace-home-panel';
        panelsContainer.appendChild(panel);
    }
    panel.classList.add('active');
    renderWorkspaceHome(panel);
    renderTabBar();
    closeHistoryPanel();
    saveTabsToStorage();
}

let tabCounter = 1;
let tabContextMenu = null;
let draggedTabId = null;
let tabDropIndicator = null;
let tabPointerDrag = null;
let suppressTabClick = false;
let previousTabActivationStack = [];
let tabActivationGeneration = 0;
let pendingExternalActivationId = 0;
let tabWheelAccumulatedDeltaY = 0;
let tabWheelLastEventAt = 0;
let editorTextScaleWheelAccumulatedDeltaY = 0;
let editorTextScaleWheelLastEventAt = 0;

const tabDragSelectionGuardClass = 'tab-drag-selection-guard';
const tabWheelGestureGapMs = 240;
const editorTextScaleWheelGestureGapMs = 240;

function synchronizeEditorTextScale(tab = getActiveTab(), { anchorEvent = null } = {}) {
    const configuredScale = getConfiguredEditorTextScale();
    const scale = tab?.type === 'file'
        ? getBufferEditorTextScale(tab, configuredScale)
        : configuredScale;
    applyEditorTextScale(scale, { view: getEditorView(), anchorEvent });
    renderEditorTextScaleStatus(tab, { configuredScale });
    return scale;
}

function resetActiveEditorTextScale() {
    const tab = getActiveTab();
    if (!tab || tab.type !== 'file') return false;
    resetBufferEditorTextScale(tab, getConfiguredEditorTextScale());
    editorTextScaleWheelAccumulatedDeltaY = 0;
    synchronizeEditorTextScale(tab);
    focusEditor();
    return true;
}

function handleEditorTextScaleWheel(event) {
    const tab = getActiveTab();
    if (!tab || tab.type !== 'file' || getEditorDocumentTabId() !== tab.id) return;

    const eventTime = Number.isFinite(event.timeStamp) ? event.timeStamp : 0;
    if (editorTextScaleWheelLastEventAt
        && eventTime - editorTextScaleWheelLastEventAt > editorTextScaleWheelGestureGapMs) {
        editorTextScaleWheelAccumulatedDeltaY = 0;
    }
    const configuredScale = getConfiguredEditorTextScale();
    const currentScale = getBufferEditorTextScale(tab, configuredScale);
    const plan = editorTextScaleWheelPlan({
        currentScale,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        accumulatedDeltaY: editorTextScaleWheelAccumulatedDeltaY,
        modified: event.ctrlKey || event.metaKey,
    });
    editorTextScaleWheelAccumulatedDeltaY = plan.accumulatedDeltaY;
    if (!plan.handled) {
        editorTextScaleWheelLastEventAt = 0;
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    editorTextScaleWheelLastEventAt = eventTime;
    if (plan.scale !== currentScale) {
        setBufferEditorTextScale(tab, plan.scale);
        synchronizeEditorTextScale(tab, { anchorEvent: event });
    }
}

function handleConfiguredEditorTextScaleChanged() {
    for (const tab of getState('openTabs')) {
        if (tab?.type === 'file') delete tab._editorTextScale;
    }
    editorTextScaleWheelAccumulatedDeltaY = 0;
    editorTextScaleWheelLastEventAt = 0;
    synchronizeEditorTextScale(getActiveTab());
}

function preventSelectionDuringTabDrag(event) {
    event.preventDefault();
}

function setTabDragSelectionGuard(active) {
    document.documentElement.classList.toggle(tabDragSelectionGuardClass, active);
    if (active) {
        document.addEventListener('selectstart', preventSelectionDuringTabDrag, true);
    } else {
        document.removeEventListener('selectstart', preventSelectionDuringTabDrag, true);
    }
}

function isFileBackedTab(tab) {
    return Boolean(tab?.path) && (tab.type === 'file' || tab.type === 'drawio');
}

function snapshotActiveFileTab(tab) {
    if (!tab || tab.type !== 'file') return;
    const editor = getEditorView();
    if (editor?.state && getEditorDocumentTabId() === tab.id) {
        tab._content = editor.state.doc.toString();
    }
    const cursorState = saveCursorState(tab.id);
    if (cursorState) tab.cursorState = cursorState;
    if (tab.dirty) saveFileSnapshot(tab, contentSnapshotForTab(tab));
}

function normalizeTabPath(path) {
    return String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

function rememberPreviousActiveTab(tabId) {
    if (!tabId) return;
    previousTabActivationStack = previousTabActivationStack.filter(storedId => storedId !== tabId);
    previousTabActivationStack.push(tabId);
    if (previousTabActivationStack.length > 64) {
        previousTabActivationStack = previousTabActivationStack.slice(-64);
    }
}

function removeTabFromActivationHistory(tabId) {
    previousTabActivationStack = previousTabActivationStack.filter(storedId => storedId !== tabId);
}

function nextTabAfterClose(closingTabId, remainingTabs) {
    if (!remainingTabs.length) return null;
    const openTabIds = new Set(remainingTabs.map(tab => tab.id));
    while (previousTabActivationStack.length) {
        const candidateId = previousTabActivationStack.pop();
        if (candidateId !== closingTabId && openTabIds.has(candidateId)) {
            return candidateId;
        }
    }
    return null;
}

function fallbackTabIdAfterClose(remainingTabs) {
    return remainingTabs.find(tab => tab.type === 'file')?.id || remainingTabs[0]?.id || null;
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
    setTabDragSelectionGuard(false);
    draggedTabId = null;
}

function getTabDropDestination(tabStrip, event) {
    if (!draggedTabId) return null;

    const tabs = getState('openTabs');
    const pinned = getState('pinnedTabs');
    const draggedPinned = pinned.includes(draggedTabId);
    const pointerTarget = document.elementFromPoint?.(event.clientX, event.clientY) || event.target;
    const target = pointerTarget?.closest?.('.tab');

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

function setAllTabsDropdownOpen(open, { restoreFocus = false } = {}) {
    const button = document.getElementById('all-tabs-btn');
    const dropdown = document.getElementById('all-tabs-dropdown');
    if (!button || !dropdown) return;

    dropdown.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', String(open));
    if (!open && restoreFocus) button.focus();
}

function updateTabScrollAffordances(tabStrip) {
    const tabBar = tabStrip?.closest('.tab-bar');
    if (!tabStrip || !tabBar) return null;

    const state = tabOverflowState({
        scrollSize: tabStrip.scrollWidth,
        viewportSize: tabStrip.clientWidth,
        scrollOffset: tabStrip.scrollLeft,
    });
    tabBar.classList.toggle('tabs-can-scroll-start', state.canScrollStart);
    tabBar.classList.toggle('tabs-can-scroll-end', state.canScrollEnd);
    return state;
}

function revealActiveTab(tabStrip) {
    const activeId = getState('activeTabId');
    const activeTab = [...tabStrip.children]
        .find(element => element.dataset.tabId === activeId);
    if (!activeTab) return;

    const viewport = tabStrip.getBoundingClientRect();
    const tab = activeTab.getBoundingClientRect();
    const leadingInset = Number.parseFloat(getComputedStyle(tabStrip).paddingLeft) || 0;
    const target = activeTabScrollTarget({
        currentScroll: tabStrip.scrollLeft,
        viewportStart: viewport.left + leadingInset,
        viewportEnd: viewport.right,
        tabStart: tab.left,
        tabEnd: tab.right,
        maxScroll: Math.max(0, tabStrip.scrollWidth - tabStrip.clientWidth),
    });
    if (Math.abs(target - tabStrip.scrollLeft) > 0.5) {
        tabStrip.scrollLeft = target;
    }
}

function refreshTabOverflowLayout(tabStrip, { revealActive = true } = {}) {
    const tabBar = tabStrip?.closest('.tab-bar');
    const button = document.getElementById('all-tabs-btn');
    if (!tabStrip || !tabBar || !button) return;

    // Measure the rail at its full width. Otherwise the button can make itself
    // permanently necessary by consuming the last available tab space. Keep
    // the prior offset because widening the viewport temporarily clamps
    // scrollLeft near its end in real browsers.
    const retainedScrollOffset = tabStrip.scrollLeft;
    button.hidden = true;
    const naturalState = tabOverflowState({
        scrollSize: tabStrip.scrollWidth,
        viewportSize: tabStrip.clientWidth,
        scrollOffset: tabStrip.scrollLeft,
    });
    button.hidden = !naturalState.overflow;
    tabBar.classList.toggle('tabs-overflow', naturalState.overflow);

    if (naturalState.overflow) {
        tabStrip.scrollLeft = Math.min(
            retainedScrollOffset,
            Math.max(0, tabStrip.scrollWidth - tabStrip.clientWidth),
        );
    } else {
        tabStrip.scrollLeft = 0;
    }

    if (!naturalState.overflow) {
        setAllTabsDropdownOpen(false);
    }
    if (revealActive) revealActiveTab(tabStrip);
    updateTabScrollAffordances(tabStrip);
}

function handleBoundedTabShortcut(event) {
    if (
        !event.ctrlKey
        || event.metaKey
        || event.altKey
        || event.shiftKey
        || !['PageUp', 'PageDown'].includes(event.key)
    ) return;

    const tabStrip = document.getElementById('tab-strip');
    const tabIds = [...(tabStrip?.querySelectorAll('.tab') || [])]
        .map(tab => tab.dataset.tabId)
        .filter(Boolean);
    if (!tabIds.length) return;

    event.preventDefault();
    const targetTabId = boundedAdjacentTabId({
        tabIds,
        activeTabId: getState('activeTabId'),
        direction: event.key === 'PageDown' ? 1 : -1,
    });
    if (targetTabId) switchTab(targetTabId);
}

/**
 * Move one tab before or after another tab in the same pin group.
 * Pinned tabs deliberately stay together at the left edge of the tab strip.
 */
export function reorderTab(tabId, targetTabId, placeAfter = false) {
    const tabs = getState('openTabs');
    const pinned = getState('pinnedTabs');
    const reordered = reorderedTabs({ tabs, pinnedTabIds: pinned, tabId, targetTabId, placeAfter });
    if (!reordered) return false;

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
        tabWheelAccumulatedDeltaY = 0;
        tabWheelLastEventAt = 0;
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

        tabStrip.addEventListener('selectstart', (e) => {
            if (e.target.closest('.tab')) e.preventDefault();
        });

        tabStrip.addEventListener('pointerdown', (e) => {
            const tab = e.target.closest('.tab');
            if (!tab || e.target.closest('.tab-close') || e.button !== 0 || e.isPrimary === false) return;

            tabPointerDrag = {
                pointerId: e.pointerId,
                tabId: tab.dataset.tabId,
                source: tab,
                startX: e.clientX,
                startY: e.clientY,
                active: false,
                destination: null,
            };
            try { tab.setPointerCapture?.(e.pointerId); } catch { /* Older webviews can omit pointer capture. */ }
        });

        tabStrip.addEventListener('pointermove', (e) => {
            if (!tabPointerDrag || e.pointerId !== tabPointerDrag.pointerId) return;
            if (!tabPointerDrag.active && !hasTabDragStarted({
                startX: tabPointerDrag.startX,
                startY: tabPointerDrag.startY,
                currentX: e.clientX,
                currentY: e.clientY,
            })) return;

            if (!tabPointerDrag.active) {
                tabPointerDrag.active = true;
                draggedTabId = tabPointerDrag.tabId;
                tabPointerDrag.source.classList.add('dragging');
                tabStrip.classList.add('is-dragging');
                setTabDragSelectionGuard(true);
            }

            e.preventDefault();
            const destination = getTabDropDestination(tabStrip, e);
            tabPointerDrag.destination = destination;
            if (!destination) {
                clearTabDropIndicator();
                return;
            }

            setTabDropIndicator(destination.element, destination.placeAfter);
        });

        tabStrip.addEventListener('pointerup', (e) => {
            if (!tabPointerDrag || e.pointerId !== tabPointerDrag.pointerId) return;

            const drag = tabPointerDrag;
            const destination = drag.active
                ? getTabDropDestination(tabStrip, e) || drag.destination
                : null;
            tabPointerDrag = null;
            try { drag.source.releasePointerCapture?.(e.pointerId); } catch { /* Capture may already be released. */ }
            finishTabDrag(tabStrip);
            if (drag.active) {
                e.preventDefault();
                suppressTabClick = true;
                setTimeout(() => { suppressTabClick = false; }, 0);
            }
            if (destination) reorderTab(drag.tabId, destination.targetId, destination.placeAfter);
        });

        tabStrip.addEventListener('pointercancel', (e) => {
            if (!tabPointerDrag || e.pointerId !== tabPointerDrag.pointerId) return;
            const drag = tabPointerDrag;
            tabPointerDrag = null;
            try { drag.source.releasePointerCapture?.(e.pointerId); } catch { /* Capture may already be released. */ }
            finishTabDrag(tabStrip);
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
                switchTab(nextTab.dataset.tabId, { preserveTabFocus: true });
            }
        });

        tabStrip.addEventListener('wheel', (e) => {
            const eventTime = Number.isFinite(e.timeStamp) ? e.timeStamp : 0;
            if (tabWheelLastEventAt && eventTime - tabWheelLastEventAt > tabWheelGestureGapMs) {
                tabWheelAccumulatedDeltaY = 0;
            }
            const plan = wheelTabNavigationPlan({
                tabIds: [...tabStrip.querySelectorAll('.tab')].map(tab => tab.dataset.tabId),
                activeTabId: getState('activeTabId'),
                deltaX: e.deltaX,
                deltaY: e.deltaY,
                deltaMode: e.deltaMode,
                accumulatedDeltaY: tabWheelAccumulatedDeltaY,
                modified: e.ctrlKey || e.metaKey || e.altKey || e.shiftKey,
            });
            tabWheelAccumulatedDeltaY = plan.accumulatedDeltaY;
            if (!plan.handled) {
                tabWheelLastEventAt = 0;
                return;
            }

            e.preventDefault();
            tabWheelLastEventAt = eventTime;
            if (plan.targetTabId) switchTab(plan.targetTabId);
        }, { passive: false });

        tabStrip.addEventListener('scroll', () => {
            updateTabScrollAffordances(tabStrip);
        }, { passive: true });

        if (typeof ResizeObserver === 'function') {
            const overflowObserver = new ResizeObserver(() => {
                refreshTabOverflowLayout(tabStrip);
            });
            overflowObserver.observe(tabStrip);
            tabStrip._overflowObserver = overflowObserver;
        } else {
            window.addEventListener('resize', () => {
                refreshTabOverflowLayout(tabStrip);
            });
        }
    }

    const editorContainer = document.getElementById('editor-container');
    if (editorContainer && !editorContainer._figaroTextScaleWheelBound) {
        editorContainer._figaroTextScaleWheelBound = true;
        editorContainer.addEventListener('wheel', handleEditorTextScaleWheel, {
            capture: true,
            passive: false,
        });
    }

    const editorScaleStatus = document.getElementById('editor-scale-status');
    if (editorScaleStatus && !editorScaleStatus._figaroResetBound) {
        editorScaleStatus._figaroResetBound = true;
        editorScaleStatus.addEventListener('click', resetActiveEditorTextScale);
    }
    if (!document._figaroTextScaleDefaultBound) {
        document._figaroTextScaleDefaultBound = true;
        document.addEventListener(
            'figaro:editor-text-scale-default-changed',
            handleConfiguredEditorTextScaleChanged,
        );
    }
    if (!document._figaroBoundedTabShortcutBound) {
        document._figaroBoundedTabShortcutBound = true;
        document.addEventListener('keydown', handleBoundedTabShortcut, true);
    }
    renderEditorTextScaleStatus(getActiveTab());

    // Close tab context menu on outside click
    document.addEventListener('click', (e) => {
        if (tabContextMenu && !e.target.closest('.tab-context-menu')) {
            dismissContextMenu(tabContextMenu, { restoreFocus: false });
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
    // Home used to be a synthetic, permanent tab. Route legacy callers to the
    // un-tabbed workspace overview so it can never return to persisted state.
    if (type === 'home') {
        showWorkspaceHome();
        return null;
    }

    const tabs = getState('openTabs');
    const shouldActivate = data.activate !== false;
    const preparedFile = data.preparedFile || null;
    
    if (!forceNew || data.externalFileId) {
        const existing = tabs.find(t => t.id === id);
        if (existing) {
            if (existing.type === 'file' && data.line) existing.searchLine = data.line;
            if (shouldActivate) switchTab(existing.id, {
                // A dirty buffer remains authoritative over any disk snapshot
                // read while activating it from the file tree.
                preparedFile: existing.dirty ? null : preparedFile,
            });
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
        tab.externalFileId = data.externalFileId || null;
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
    case 'health':
        break;
    }
    
    const currentActiveId = getState('activeTabId');
    if (shouldActivate && !tab.externalFileId && currentActiveId && currentActiveId !== tab.id && getState('openTabs').some(tabRef => tabRef.id === currentActiveId)) {
        rememberPreviousActiveTab(currentActiveId);
        snapshotActiveFileTab(tabs.find(tabRef => tabRef.id === currentActiveId));
    }

    const newTabs = [...tabs, tab];
    setState('openTabs', newTabs);
    if (shouldActivate && !tab.externalFileId) setState('activeTabId', tab.id);
    saveTabsToStorage();
    
    renderTabBar();
    if (shouldActivate) switchTab(tab.id, { preparedFile });
    
    return tab;
}

export async function switchTab(tabId, {
    preserveTabFocus = false,
    preparedFile: suppliedPreparedFile = null,
    preparedFileConfigured = false,
} = {}) {
    const activationId = ++tabActivationGeneration;
    const tabs = getState('openTabs');
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return false;
    
    let currentActiveId = getState('activeTabId');
    if (tab.externalFileId && currentActiveId === tabId && getEditorDocumentTabId() === tabId) {
        return true;
    }

    // External paths are display metadata, not vault-relative paths. Read the
    // capability-backed document before changing the selected tab so a failed
    // read can never leave the previous document under an external tab title.
    let preparedFile = suppliedPreparedFile;
    let hasPreparedEditorConfiguration = preparedFileConfigured;
    if (tab.type === 'file' && tab.externalFileId) {
        pendingExternalActivationId = activationId;
        statusBar.set(`Opening “${tab.title}”…`);
        try {
            preparedFile = await readFileTab(tab);
            if (activationId !== tabActivationGeneration) return false;
            if (!getState('openTabs').some(candidate => candidate.id === tab.id)) {
                if (pendingExternalActivationId === activationId) {
                    pendingExternalActivationId = 0;
                    statusBar.set('Ready');
                }
                return false;
            }
            if (!preparedFile || preparedFile.binary) {
                throw new Error(preparedFile?.binary
                    ? 'This external file is binary and cannot be edited.'
                    : 'The external file returned no readable content.');
            }
            if (!getEditorView()) createEditorView();
            const configured = await configureEditorForFile(tab.path);
            if (activationId !== tabActivationGeneration) return false;
            if (!configured) throw new Error('The editor is unavailable for this external note.');
            hasPreparedEditorConfiguration = true;
        } catch (error) {
            if (activationId !== tabActivationGeneration) return false;
            pendingExternalActivationId = 0;
            log.error('Failed to load external file:', error);
            statusBar.set('Failed to open external file');
            await errorDialog(
                'Couldn’t open external note',
                error,
                'The original external note could not be read.',
            );
            statusBar.set('Ready');
            return false;
        }
        pendingExternalActivationId = 0;
        statusBar.set('Ready');
        currentActiveId = getState('activeTabId');
    } else if (pendingExternalActivationId) {
        pendingExternalActivationId = 0;
        statusBar.set('Ready');
    }

    const stillOpen = tabs.some(tab => tab.id === currentActiveId);
    if (currentActiveId && currentActiveId !== tabId && stillOpen) {
        rememberPreviousActiveTab(currentActiveId);
    }
    if (currentActiveId && currentActiveId !== tabId) {
        snapshotActiveFileTab(tabs.find(candidate => candidate.id === currentActiveId));
    }

    // Capture before the target document replaces the shared CodeMirror
    // document. Its temporary selection must never overwrite this snapshot.
    const cursorState = tab.searchLine ? null : (tab.cursorState ? { ...tab.cursorState } : null);
    
    setState('activeTabId', tabId);
    editorTextScaleWheelAccumulatedDeltaY = 0;
    editorTextScaleWheelLastEventAt = 0;
    synchronizeEditorTextScale(tab);
    saveTabsToStorage();

    document.dispatchEvent(new CustomEvent('active-tab-changed', {
        detail: { path: tab.type === 'file' ? tab.path : null, type: tab.type },
    }));

    if (tab.type === 'file' && tab.path && !tab.externalFileId) {
        recordRecentFile(tab.path, tab.title);
    }
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    const contentReady = renderTabContent(
        tab,
        cursorState,
        preparedFile,
        hasPreparedEditorConfiguration,
    );
    renderTabBar();

    closeHistoryPanel();
    
    if (preserveTabFocus) {
        [...document.querySelectorAll('#tab-strip .tab')]
            .find(element => element.dataset.tabId === tab.id)
            ?.focus();
    } else if (tab.type === 'file') {
        setTimeout(() => focusEditor(), 0);
    }
    await contentReady;
    return true;
}

async function renderTabContent(
    tab,
    cursorState = null,
    preparedFile = null,
    preparedFileConfigured = false,
) {
    if (tab.type === 'file') {
        setView('editor');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        if (!getEditorView()) {
            createEditorView();
        }
        await renderFileTab(null, tab, cursorState, preparedFile, preparedFileConfigured);
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

        if (['calendar', 'kanban', 'settings', 'health'].includes(tab.type)) {
            playEntranceAnimation(panel);
        }
        
        switch (tab.type) {
        case 'calendar': renderCalendarTab(panel, tab); break;
        case 'backlinks': renderBacklinksTab(panel, tab); break;
        case 'kanban': renderKanbanTab(panel, tab); break;
        case 'settings': renderSettingsTab(panel, tab); break;
        case 'health': renderVaultHealthTab(panel); break;
        case 'drawio': renderDrawioDiagramTab(panel, tab); break;
        }
    }
}

async function renderFileTab(
    panel,
    tab,
    cursorState = null,
    preparedFile = null,
    preparedFileConfigured = false,
) {
    if (!tab.path) return;
    if (preparedFile) {
        const loadId = (tab._loadGeneration || 0) + 1;
        tab._loadGeneration = loadId;
        if (!preparedFileConfigured) {
            const configured = await configureEditorForFile(tab.path);
            if (!configured || tab.id !== getState('activeTabId')
                || tab._loadGeneration !== loadId || tab.dirty) return;
        }
        setEditorContent(
            preparedFile.content,
            tab.id,
            fileMountSelection(tab, preparedFile.content, cursorState),
        );
        tab._content = preparedFile.content;
        tab.mtime = preparedFile.mtime;
        tab.dirty = false;
        document.dispatchEvent(new CustomEvent('tab-switched', { detail: { path: tab.path } }));
        focusSearchLine(tab);
        return;
    }
    if (tab.isNew) {
        const loadId = (tab._loadGeneration || 0) + 1;
        tab._loadGeneration = loadId;
        const configured = await configureEditorForFile(tab.path);
        if (!configured || tab.id !== getState('activeTabId') || tab._loadGeneration !== loadId) return;
        if (tab._content == null) tab._content = '';
        setEditorContent(tab._content, tab.id, fileMountSelection(tab, tab._content, cursorState));
        document.dispatchEvent(new CustomEvent('tab-switched', { detail: { path: tab.path } }));
        return;
    }
    await loadFileContent(tab, cursorState);
}

function fileMountSelection(tab, content, rememberedSelection = null) {
    if (!isMarkdownFilePath(tab.path)) return rememberedSelection;
    const lineNumber = Number(tab.searchLine);
    return initialFrontmatterBodySelection(content, {
        rememberedSelection,
        hasLineTarget: Number.isInteger(lineNumber) && lineNumber >= 1,
    });
}

async function loadFileContent(tab, cursorState = null) {
    const loadId = (tab._loadGeneration || 0) + 1;
    tab._loadGeneration = loadId;
    try {
        // If we have cached content from a previous switch-away and the tab
        // is still dirty, use the cache instead of re-reading from disk.
        // This prevents data loss if the auto-save on switch-away failed.
        if (tab._content != null && tab.dirty) {
            const configured = await configureEditorForFile(tab.path);
            if (!configured || tab.id !== getState('activeTabId') || tab._loadGeneration !== loadId) return;
            setEditorContent(tab._content, tab.id, fileMountSelection(tab, tab._content, cursorState));
            document.dispatchEvent(new CustomEvent('tab-switched', { detail: { path: tab.path } }));
            focusSearchLine(tab);
            return;
        }
        
        const result = await readFileTab(tab);
        if (result) {
            if (result.binary) {
                statusBar.set('Cannot edit binary file');
                return;
            }
            if (tab.id !== getState('activeTabId') || tab._loadGeneration !== loadId || tab.dirty) return;
            const configured = await configureEditorForFile(tab.path);
            if (!configured || tab.id !== getState('activeTabId') || tab._loadGeneration !== loadId || tab.dirty) return;
            setEditorContent(result.content, tab.id, fileMountSelection(tab, result.content, cursorState));
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

async function readFileTab(tab) {
    const target = fileTabReadTarget(tab);
    if (!target) throw new Error('The file tab has no readable source.');
    return target.kind === 'external'
        ? backend().ReadLaunchExternalFile(target.externalFileId)
        : backend().ReadFile(target.path);
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

function renderWorkspaceHome(panel) {
    try {
        if (panel.classList.contains('active') && panel.isConnected) renderHome(panel);
    } catch (error) {
        log.error('Failed to render workspace home:', error);
        panel.innerHTML = '<div class="home-view"><p class="home-empty">Home is unavailable right now.</p></div>';
    }
}

function renderCalendarTab(panel, tab) {
    panel.innerHTML = `<div class="calendar-view-wrapper"><div class="calendar-view-header"><h2>Mention of Date: [[${tab.dateStr}]]</h2></div><div class="results-list" id="calendar-results-${tab.dateStr}"></div></div>`;
    loadCalendarResults(tab.dateStr, `calendar-results-${tab.dateStr}`);
}

function renderBacklinksTab(panel, tab) {
    const fileName = tab.targetPath.split('/').pop().replace('.md', '');
    panel.innerHTML = `<div class="backlinks-view-wrapper"><div class="backlinks-view-header"><h2>Relationships for [[${fileName}]]</h2><p class="backlinks-subtitle">Linked notes and plain-text mentions across your vault.</p></div><div class="results-list" id="backlinks-results-${tab.id}"></div></div>`;
    loadBacklinksResults(tab.targetPath, `backlinks-results-${tab.id}`);
}

function renderKanbanTab(panel, tab) {
    const density = getState('kanbanDensity') === 'compact' ? 'compact' : 'comfortable';
    const layout = getState('kanbanLayout') === 'stacked' ? 'stacked' : 'side-by-side';
    panel.innerHTML = `<div class="kanban-view-wrapper" data-density="${density}" data-layout="${layout}"><div class="kanban-view-header"><div><h2>Kanban Task Board</h2><p class="kanban-instruction">Tab through cards; use arrow keys to reorder or move the focused card. Enter opens its source, D changes its due date, and Delete removes its tag. You can also drag cards between columns.</p></div></div><div class="kanban-board" id="kanban-board-main"></div></div>`;
    applyKanbanPresentationToViews(density, layout);
    renderKanbanBoard('kanban-board-main', tab.focusCol);
}

function renderVaultHealthTab(panel) {
    if (!panel.classList.contains('active') || !panel.isConnected) return;
    renderVaultHealth(panel).catch(error => {
        log.error('Failed to render vault health:', error);
        panel.innerHTML = '<div class="vault-health-view"><p class="vault-health-error">Vault health is unavailable right now.</p></div>';
    });
}

function renderDrawioDiagramTab(panel, tab) {
    if (tab.id !== getState('activeTabId') || !panel.isConnected) return;
    renderDrawioTab(panel, tab).catch(error => {
        log.error('Failed to render draw.io tab:', error);
        panel.innerHTML = '<div class="drawio-view"><p class="drawio-error">Diagram editor is unavailable right now.</p></div>';
    });
}

export async function closeTab(tabId, event, { animate = false } = {}) {
    if (event) event.stopPropagation();
    let tabs = getState('openTabs');
    let tab = tabs.find(t => t.id === tabId);
    if (!tab) return false;
    
    if (tab.dirty && (tab.type === 'file' || tab.type === 'drawio')) {
        const shouldClose = await window.confirmDialog(
            'Discard unsaved changes?',
            `“${tab.title}” has changes that have not been saved. Closing it will discard them.`,
            true,
            false,
            { confirmLabel: 'Discard and close', cancelLabel: 'Keep editing', icon: 'warning' }
        );
        if (!shouldClose) return false;
    }
    
    const panel = document.querySelector(`.tab-panel[data-tab-id="${tabId}"]`);
    if (panel) {
        if (animate && getState('activeTabId') === tabId && ['kanban', 'settings'].includes(tab.type)) {
            await playExitAnimation(panel);
        }

        // The exit transition deliberately leaves the rest of the application
        // interactive. Re-read tabs afterward so a note opened during the fade
        // is preserved, and let concurrent close requests share one result.
        tabs = getState('openTabs');
        tab = tabs.find(candidate => candidate.id === tabId);
        if (!tab) return true;
        panel._settingsPanelDisposed = tab.type === 'settings';
        panel._drawioSession?.dispose?.();
        panel.remove();
    }
    removeTabFromActivationHistory(tabId);
    
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
        showWorkspaceHome();
    } else if (activeId === tabId) {
        const preferredTabId = nextTabAfterClose(tabId, newTabs) || fallbackTabIdAfterClose(newTabs);
        switchTab(preferredTabId);
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
        setImageBasePath(activeTab.path);
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

    return persistTabsBeforePathOperation(tabsToPrepare, 'moving');
}

/**
 * Persist dirty file-backed tabs inside a source path before copying from disk.
 * Unlike a move, copying rewrites no existing backlink sources elsewhere, so
 * unrelated dirty Markdown tabs are intentionally left alone.
 */
export async function prepareTabsForPathCopy(path) {
    const normalized = normalizeTabPath(path);
    const affected = getState('openTabs').filter(tab => isFileBackedTab(tab) &&
        (normalizeTabPath(tab.path) === normalized || normalizeTabPath(tab.path).startsWith(normalized + '/')));
    return persistTabsBeforePathOperation(affected, 'copying');
}

/** Persist dirty file-backed tabs before their current disk contents are archived and deleted. */
export async function prepareTabsForPathDelete(path) {
    const normalized = normalizeTabPath(path);
    const affected = getState('openTabs').filter(tab => isFileBackedTab(tab) &&
        (normalizeTabPath(tab.path) === normalized || normalizeTabPath(tab.path).startsWith(normalized + '/')));
    return persistTabsBeforePathOperation(affected, 'deleting');
}

/** Save every dirty Markdown tab before a vault-wide link rewrite. */
export async function prepareTabsForVaultLinkRewrite() {
    const dirtyMarkdownTabs = getState('openTabs').filter(tab =>
        tab?.type === 'file' && tab.dirty && /\.md$/i.test(tab.path || ''));
    return persistTabsBeforePathOperation(dirtyMarkdownTabs, 'rewriting links in');
}

async function persistTabsBeforePathOperation(tabsToPrepare, operation) {
    for (const tab of tabsToPrepare) {
        if (tab.type === 'drawio') {
            const panel = [...document.querySelectorAll('.tab-panel')]
                .find(candidate => candidate.dataset.tabId === tab.id);
            if (tab.dirty || panel?._drawioSession?.saving) {
                return { success: false, error: `Save "${tab.title}" before ${operation} it` };
            }
            continue;
        }
        if (!tab.dirty) continue;
        const content = tab.id === getState('activeTabId') ? getEditorContent() : tab._content;
        if (typeof content !== 'string') {
            return { success: false, error: `Could not save "${tab.title}" before ${operation} it` };
        }
        try {
            const result = await saveFileSnapshot(tab, content);
            if (!result?.success) {
                return { success: false, error: result?.error || `Could not save "${tab.title}" before ${operation} it` };
            }
            if (tab.dirty) {
                return { success: false, error: `"${tab.title}" changed while it was being saved; links were not rewritten` };
            }
        } catch (error) {
            log.warn(`Could not save tab before ${operation}:`, error);
            return { success: false, error: `Could not save "${tab.title}" before ${operation} it` };
        }
    }

    await Promise.all(tabsToPrepare
        .map(tab => documentSave.pendingForPath(tab.path))
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
            const file = await backend().ReadFile(tab.path);
            // A user edit or tab move while the read was in flight always wins
            // over a delayed reload.
            if (!file || file.binary || tab.dirty || !updatedPaths.has(normalizeTabPath(tab.path))) continue;
            tab._content = file.content;
            tab.mtime = file.mtime;
            if (tab.id === getState('activeTabId')) {
                setEditorContent(file.content, tab.id);
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
    for (const closingId of closingIds) removeTabFromActivationHistory(closingId);
    const pinned = getState('pinnedTabs');
    if (pinned.some(tabId => closingIds.has(tabId))) {
        setState('pinnedTabs', pinned.filter(tabId => !closingIds.has(tabId)));
    }

    const activeId = getState('activeTabId');
    if (!newTabs.length) {
        setState('activeTabId', null);
        showWorkspaceHome();
    } else if (closingIds.has(activeId)) {
        const preferred = nextTabAfterClose(activeId, newTabs) || { id: fallbackTabIdAfterClose(newTabs) };
        switchTab(preferred.id);
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

export function markTabDirty(tabId, { alreadyDirty = false } = {}) {
    const tabs = getState('openTabs');
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // The editor marks its model dirty synchronously so a save or fast tab
    // switch can never miss a keystroke. It then asks us to publish that
    // transition after this module has loaded. Do not revive a tab which was
    // saved in that small interval, but do repaint and notify listeners when
    // the dirty transition remains current.
    if (alreadyDirty) {
        if (!tab.dirty) return;
    } else if (!tab.dirty) {
        tab.dirty = true;
    } else {
        return;
    }

    setState('openTabs', [...tabs]);
    renderTabBar();
    if (tab.id === getState('activeTabId') && tab.path) {
        document.dispatchEvent(new CustomEvent('active-file-dirty', { detail: { path: tab.path } }));
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
        const isActive = tab.id === activeId;
        const tabClasses = [
            'ui-document-tab',
            'ui-document-tab--connected',
            'tab',
            isActive ? 'ui-document-tab--active active' : '',
            tab.dirty ? 'ui-document-tab--dirty dirty' : '',
            isPinned ? 'ui-document-tab--pinned pinned' : '',
        ].filter(Boolean).join(' ');
        const compactTitle = compactTabTitle(tab.title);
        const visibleTitle = compactTitle.compacted
            ? `<span class="tab-title-leading">${escapeHtml(compactTitle.leading)}</span><span class="tab-title-ellipsis" aria-hidden="true">…</span><span class="tab-title-trailing">${escapeHtml(compactTitle.trailing)}</span>`
            : `<span class="tab-title-single">${escapeHtml(compactTitle.leading)}</span>`;
        const accessibleLabel = tabAccessibleLabel(tab);
        const location = tabLocationLabel(tab);
        const visibleLocation = location && location !== 'Vault root'
            ? `<span class="tab-location" aria-hidden="true" title="${escapeHtml(location)}"><span class="tab-location-separator">·</span><span class="tab-location-path">${escapeHtml(location)}</span></span>`
            : '';
        const tooltip = `${tab.path || tab.title}${tab.dirty ? ' (unsaved)' : ''}${isPinned ? ' (pinned)' : ''}`;
        return `
        <div class="${tabClasses}"
                data-tab-id="${tab.id}"
                role="tab"
                tabindex="${isActive ? '0' : '-1'}"
                aria-selected="${isActive}"
                aria-label="${escapeHtml(accessibleLabel)}"
                title="${escapeHtml(tooltip)}">
            <span class="tab-icon">${getTabIcon(tab.type)}</span>
            <span class="tab-title" aria-hidden="true"><span class="tab-title-text">${visibleTitle}</span></span>
            ${visibleLocation}
            <button class="ui-icon-button ui-icon-button--small tab-close"
                    aria-label="Close ${escapeHtml(tab.title)}" title="Close ${escapeHtml(tab.title)}">✕</button>
        </div>
    `;}).join('');
    refreshTabOverflowLayout(tabStrip);
}

function getTabIcon(type) {
    switch (type) {
    case 'file': return fileIcon(14, 2);
    case 'drawio': return fileIcon(14, 2);
    case 'calendar': return calendarIcon(14, 2);
    case 'backlinks': return backlinksIcon(14, 2);
    case 'kanban': return kanbanIcon(14, 2);
    case 'settings': return settingsIcon(14, 2);
    case 'health': return warningIcon(14, 2);
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

    if (tabContextMenu) dismissContextMenu(tabContextMenu, { restoreFocus: false });

    const pinned = getState('pinnedTabs');
    const isPinned = pinned.includes(tabId);

    tabContextMenu = document.createElement('div');
    tabContextMenu.className = 'ui-menu context-menu tab-context-menu';
    const anchor = contextMenuAnchorPoint(e, tabEl);
    tabContextMenu.style.left = `${anchor.x}px`;
    tabContextMenu.style.top = `${anchor.y}px`;

    tabContextMenu.innerHTML = `
        <button type="button" class="ui-menu-item context-menu-item" data-action="toggle-pin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
            ${isPinned ? 'Unpin Tab' : 'Pin Tab'}
        </button>
        <div class="ui-menu-separator context-menu-separator"></div>
        <button type="button" class="ui-menu-item context-menu-item" data-action="close-tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close Tab
        </button>
    `;
    document.body.appendChild(tabContextMenu);
    configureContextMenu(tabContextMenu, {
        label: `Tab actions for ${tab.title}`,
        returnFocus: tabEl,
        onDismiss: () => { tabContextMenu = null; },
    });

    tabContextMenu.addEventListener('click', (ev) => {
        const menuItem = ev.target.closest('.context-menu-item');
        if (!menuItem) return;
        const action = menuItem.dataset.action;

        dismissContextMenu(tabContextMenu, { restoreFocus: true });

        if (action === 'toggle-pin') {
            togglePinTab(tabId);
        } else if (action === 'close-tab') {
            closeTab(tabId);
        }
    });
}

export function saveActiveFile() {
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.type !== 'file' || !getEditorView()) return Promise.resolve(null);
    return saveFileSnapshot(activeTab, contentSnapshotForTab(activeTab));
}

function contentSnapshotForTab(tab) {
    const ownerId = getEditorDocumentTabId();
    if (ownerId === tab.id) return getEditorContent();
    if (ownerId == null && getState('activeTabId') === tab.id && typeof tab._content !== 'string') {
        return getEditorContent();
    }
    return typeof tab._content === 'string' ? tab._content : '';
}

const documentSave = createDocumentSave({
    persist: ({ path, externalFileId, content, expectedMtime }) => externalFileId
        ? backend().SaveLaunchExternalFile(externalFileId, content, expectedMtime)
        : backend().SaveFile(path, content, expectedMtime),
    confirmOverwrite: () => window.confirmDialog(
        'File changed outside Figaro',
        'Another application saved a newer version of this file. Overwriting will replace those external changes with the version currently open in Figaro.',
        true,
        false,
        { confirmLabel: 'Overwrite file', cancelLabel: 'Keep external version', icon: 'warning' },
    ),
    shouldCommit: () => shouldCommitOnSave(),
    commit: path => backend().CommitCurrentFile(path),
    onSaved: applySaveSuccess,
    onFailed: (snapshot, error) => {
        log.error('Save failed:', error);
        if (isLatestSave(snapshot.tab, snapshot)) statusBar.set(saveFailureStatusMessage(error));
    },
});

// Queue saves by path. Every subsequent save reads the tab's latest mtime only
// after its predecessor finishes, turning the backend's optimistic check into
// a real per-file compare-and-swap sequence.
export function saveFileSnapshot(tab, content, options = {}) {
    return documentSave.save(tab, content, options);
}

async function applySaveSuccess(snapshot, result, {
    historyCommitFailed,
    historyCommitError,
    successMessage,
}) {
    const { tab, content } = snapshot;
    tab.mtime = result.mtime;
    const tabsForPath = getState('openTabs').filter(candidate => (candidate.type === 'file' || candidate.type === 'drawio') && candidate.path === tab.path);
    tabsForPath.forEach(candidate => {
        candidate.mtime = result.mtime;
    });
    if (historyCommitFailed) {
        log.warn('File saved, but its history commit failed:', historyCommitError);
    }
    if (!isLatestSave(tab, snapshot)) return;

    const latestEdit = savedLatestEdit(tab, snapshot);
    if (latestEdit) {
        tab.dirty = false;
        tab._content = null;
    }
    updateTabTitle(tab.id, tab.title);
    if (!tab.externalFileId) {
        document.dispatchEvent(new CustomEvent('vault-file-saved', {
            detail: { path: tab.path, content, mtime: result.mtime }
        }));
    }
    const statusMessage = saveStatusMessage({
        historyCommitFailed,
        latestEdit,
        successMessage,
    });
    statusBar.set(statusMessage);
    if (!tab.externalFileId) {
        invalidateCalendarCache();
        refreshCalendarIfVisible();
        refreshHistoryIfOpen();
    }
    statusBar.clearAfter(1000, statusMessage);
}

function initAllTabsDropdown() {
    const btn = document.getElementById('all-tabs-btn');
    const dropdown = document.getElementById('all-tabs-dropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !dropdown.classList.contains('hidden');
        if (open) {
            setAllTabsDropdownOpen(false);
        } else {
            renderAllTabsDropdown(dropdown);
            setAllTabsDropdownOpen(true);
            (dropdown.querySelector('.all-tabs-item.active')
                || dropdown.querySelector('.all-tabs-item'))?.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#all-tabs-dropdown') && !e.target.closest('#all-tabs-btn')) {
            setAllTabsDropdownOpen(false);
        }
    });

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.all-tabs-item');
        if (!item) return;
        setAllTabsDropdownOpen(false);
        switchTab(item.dataset.tabId);
    });

    dropdown.addEventListener('keydown', (e) => {
        const items = [...dropdown.querySelectorAll('.all-tabs-item')];
        if (!items.length) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            setAllTabsDropdownOpen(false, { restoreFocus: true });
            return;
        }
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;

        e.preventDefault();
        const currentIndex = Math.max(0, items.indexOf(document.activeElement));
        let nextIndex = currentIndex;
        if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
        if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
        if (e.key === 'Home') nextIndex = 0;
        if (e.key === 'End') nextIndex = items.length - 1;
        items[nextIndex].focus();
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
        const location = tabLocationLabel(t);
        return `<button type="button" role="menuitem" class="ui-menu-item all-tabs-item${active}${dirty}" data-tab-id="${t.id}" aria-current="${t.id === activeId}" aria-label="${escapeHtml(tabAccessibleLabel(t))}" title="${escapeHtml(t.path || t.title || t.id)}" tabindex="${t.id === activeId ? '0' : '-1'}">
            <span class="all-tabs-item-copy"><span class="all-tabs-item-title">${escapeHtml(t.title || t.id)}</span>${location ? `<span class="all-tabs-item-location">${escapeHtml(location)}</span>` : ''}</span>
        </button>`;
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
    prepareTabsForPathCopy,
    prepareTabsForPathDelete,
    prepareTabsForVaultLinkRewrite,
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
        <div class="settings-column settings-column--writing" data-settings-group="writing">
            <!-- Appearance -->
            <div class="settings-card">
                <div class="settings-card-title">Appearance</div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/><path d="M2 12h20"/></svg>
                        <span>Theme</span>
                    </div>
                    <div class="ui-picker theme-picker">
                        <button class="ui-picker-trigger theme-picker-btn" id="theme-picker-btn">
                            <span id="theme-current-name">Loading…</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="ui-menu ui-picker-menu theme-picker-menu" id="theme-picker-menu"></div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                        <span>Font</span>
                    </div>
                    <div class="ui-picker font-picker">
                        <button class="ui-picker-trigger font-picker-btn" id="font-picker-btn">
                            <span id="font-current-name">Inter</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="ui-menu ui-picker-menu font-picker-menu" id="font-picker-menu"></div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M4 9h11M4 13h16M4 17h11"/><path d="M17 17l2 2 3-4"/></svg>
                        <span>Code Font</span>
                    </div>
                    <div class="ui-picker font-picker">
                        <button class="ui-picker-trigger font-picker-btn" id="code-font-picker-btn" title="Used only for code files">
                            <span id="code-font-current-name">Theme default</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="ui-menu ui-picker-menu font-picker-menu" id="code-font-picker-menu"></div>
                    </div>
                </div>
            </div>
            <!-- Editor -->
            <div class="settings-card">
                <div class="settings-card-title">Editor</div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 8 12 4 20 8"/><polyline points="4 16 12 20 20 16"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                        <span>Default Text Size</span>
                    </div>
                    <div class="ui-stepper font-size-control" role="group" aria-label="Default editor text size">
                        <button type="button" class="ui-stepper-button font-size-btn" id="font-size-down" title="Decrease default text size" aria-label="Decrease default text size">−</button>
                        <span class="ui-stepper-value font-size-value" id="font-size-value">100%</span>
                        <button type="button" class="ui-stepper-button font-size-btn" id="font-size-up" title="Increase default text size" aria-label="Increase default text size">+</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h5M4 12h9M4 18h13"/><path d="m17 9 3 3-3 3"/></svg>
                        <span id="tab-size-label">Tab Size</span>
                    </div>
                    <div class="ui-stepper tab-size-control" role="group" aria-labelledby="tab-size-label">
                        <button type="button" class="ui-stepper-button tab-size-down" aria-label="Decrease tab size" title="Decrease tab size">−</button>
                        <input class="ui-stepper-value tab-size-value" id="tab-size-value" type="number" inputmode="numeric" min="2" max="8" step="1" value="4" aria-label="Tab size in spaces">
                        <button type="button" class="ui-stepper-button tab-size-up" aria-label="Increase tab size" title="Increase tab size">+</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                        <span>Text Width</span>
                    </div>
                    <div class="ui-stepper text-width-control">
                        <button class="ui-stepper-button text-width-btn" id="text-width-down" title="Narrower">−</button>
                        <span class="ui-stepper-value text-width-value" id="text-width-value">100%</span>
                        <button class="ui-stepper-button text-width-btn" id="text-width-up" title="Wider">+</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h5M4 12h9M4 18h13"/><path d="m17 9 3 3-3 3"/></svg>
                        <span>Breadcrumbs</span>
                    </div>
                    <div class="settings-row">
                        <span class="settings-row-label">Show document path</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="editor-breadcrumbs-toggle" aria-label="Show editor breadcrumbs">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h13"/><circle cx="19" cy="12" r="2"/></svg>
                        <span>Navigation</span>
                    </div>
                    <div class="settings-row-group">
                        <div class="settings-row">
                            <span id="sticky-headings-description" class="settings-row-label">Sticky heading hierarchy</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="sticky-headings-toggle" aria-label="Show sticky heading hierarchy" aria-describedby="sticky-headings-description" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="settings-row">
                            <span id="markdown-block-guides-description" class="settings-row-label">Block guides and folding</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="markdown-block-guides-toggle" aria-label="Show Markdown block guides and folding" aria-describedby="markdown-block-guides-description" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="settings-row">
                            <span id="document-outline-description" class="settings-row-label">Document outline</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="document-outline-toggle" aria-label="Show document outline launcher" aria-describedby="document-outline-description" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h4"/></svg>
                        <span>Vim Mode</span>
                    </div>
                    <div class="settings-row-group">
                        <div class="settings-row">
                            <span class="settings-row-label">Enable Vim</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="vim-toggle">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="settings-row">
                            <span class="settings-row-label">Move by visual rows</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="vim-visual-rows-toggle" aria-label="Move by visual rows" disabled
                                       title="Enable Vim Mode to move by visual rows.">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="settings-row">
                            <span class="settings-row-label">Enter rendered blocks</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="vim-reveal-blocks-toggle" aria-label="Enter rendered blocks with j and k" disabled
                                       title="Enable Vim Mode to enter rendered blocks.">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M1 6h.01M1 12h.01M1 18h.01"/></svg>
                        <span>Line numbers</span>
                    </div>
                    <div class="settings-row">
                        <span class="settings-row-label">Show line numbers</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="line-numbers-toggle">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 12 2 2 4-4"/><path d="M20 12a8 8 0 1 1-4-6.9"/></svg>
                        <span>Markdown diagnostics</span>
                    </div>
                    <div class="settings-row">
                        <span class="settings-row-label">Show Markdown lint</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="markdown-lint-toggle" aria-label="Show Markdown lint" checked>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z"/><path d="M9.5 9.5h.01M14.5 9.5h.01M9 13c.8.7 1.8 1 3 1s2.2-.3 3-1"/></svg>
                        <span>Spellcheck</span>
                    </div>
                    <div class="settings-row settings-row--select">
                        <label class="settings-row-label" for="spellcheck-language">Language</label>
                        <select id="spellcheck-language" aria-label="Spellcheck language" aria-describedby="spellcheck-guidance">
                            <option value="none" selected>None</option>
                            <option value="en-US">English (US)</option>
                            <option value="en-GB">English (UK)</option>
                            <option value="es">Spanish (Spain)</option>
                        </select>
                    </div>
                    <div id="spellcheck-guidance" class="ui-notice ui-notice--info settings-spellcheck-guidance" role="note">
                        <div class="settings-spellcheck-guidance-row">
                            <strong>Vault default</strong>
                            <span><b>None</b> turns spellcheck off across all notes.</span>
                        </div>
                        <div class="settings-spellcheck-guidance-row">
                            <strong>Per note</strong>
                            <span>Frontmatter can override the language or set <code>spellcheck: false</code>.</span>
                        </div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>
                        <span>Links style</span>
                    </div>
                    <div class="ui-picker settings-picker link-style-picker">
                        <button type="button" id="link-style-select" class="ui-picker-trigger settings-picker-btn"
                                role="combobox" aria-label="Links style" aria-haspopup="listbox"
                                aria-controls="link-style-menu" aria-expanded="false">
                            <span id="link-style-current-name">Wikilinks</span>
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                                <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <div id="link-style-menu" class="ui-menu ui-picker-menu settings-picker-menu" role="listbox"
                             aria-label="Links style options" hidden>
                            <button type="button" class="ui-menu-item settings-picker-item" role="option"
                                    id="link-style-option-wikilink" data-link-style="wikilink"
                                    aria-selected="false" tabindex="-1">
                                <span>Wikilinks</span>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                            </button>
                            <button type="button" class="ui-menu-item settings-picker-item" role="option"
                                    id="link-style-option-markdown" data-link-style="markdown"
                                    aria-selected="false" tabindex="-1">
                                <span>Markdown</span>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="settings-column settings-column--workspace" data-settings-group="workspace">
            <!-- Kanban -->
            <div class="settings-card">
                <div class="settings-card-title">Kanban</div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6" height="16" rx="1"/><rect x="14" y="4" width="6" height="16" rx="1"/></svg>
                        <span>Card density</span>
                    </div>
                    <div class="settings-segmented-control" role="group" aria-label="Kanban card density">
                        <button type="button" class="ui-button" data-kanban-density="comfortable" aria-pressed="false">Comfortable</button>
                        <button type="button" class="ui-button" data-kanban-density="compact" aria-pressed="false">Compact</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 5v14"/></svg>
                        <span>Column flow</span>
                    </div>
                    <div class="settings-segmented-control" role="group" aria-label="Kanban column flow">
                        <button type="button" class="ui-button" data-kanban-layout="side-by-side" aria-pressed="false">Side by side</button>
                        <button type="button" class="ui-button" data-kanban-layout="stacked" aria-pressed="false">Stacked</button>
                    </div>
                </div>
                <p class="settings-section-desc">Stacked boards flow vertically and scroll as one page.</p>
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><path d="M7 7h7.5a2.5 2.5 0 0 1 0 5H9.5a2.5 2.5 0 0 0 0 5H17"/></svg>
                        <span>Auto-Commit</span>
                    </div>
                    <div class="settings-row">
                        <span class="settings-row-label">Commit each saved note</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="auto-commit-toggle" aria-label="Auto-Commit" aria-describedby="auto-commit-description" checked>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <p id="auto-commit-description" class="settings-section-desc">When enabled, Figaro records only the file that just saved. It never auto-commits the whole vault.</p>
                </div>
            </div>
            <!-- PDF Export -->
            <div class="settings-card">
                <div class="settings-card-title">PDF Export</div>
                <div class="settings-section pdf-browser-setting">
                    <div class="pdf-browser-setting-copy">
                        <div class="settings-section-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/><path d="m8 10 2 2 5-5"/></svg>
                            <span>Browser engine</span>
                        </div>
                        <p id="pdf-browser-status" class="settings-section-desc pdf-browser-status">Loading browser preference…</p>
                    </div>
                    <div class="pdf-browser-actions">
                        <button type="button" id="pdf-browser-choose" class="ui-button settings-action-btn">Choose…</button>
                        <button type="button" id="pdf-browser-clear" class="ui-button settings-action-btn" hidden>Use automatic</button>
                    </div>
                </div>
            </div>
            <div class="settings-card">
                <div class="settings-card-title">Vault care</div>
                <div class="settings-section vault-health-setting">
                    <div class="pdf-browser-setting-copy">
                        <div class="settings-section-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            <span>Vault health</span>
                        </div>
                        <p class="settings-section-desc pdf-browser-status">Review missing local links, orphan attachments, repeated filenames, possible duplicate notes, and unclosed frontmatter.</p>
                    </div>
                    <div class="pdf-browser-actions">
                        <button type="button" id="open-vault-health" class="ui-button settings-action-btn">Review…</button>
                    </div>
                </div>
                <div class="settings-section recently-deleted-setting">
                    <div class="recently-deleted-setting-copy">
                        <div class="settings-section-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                            <span>Recently deleted</span>
                        </div>
                        <p class="settings-section-desc">Restore files and folders from the local Git snapshot Figaro records before deletion.</p>
                    </div>
                    <div id="recently-deleted-list" class="recently-deleted-list" aria-live="polite" aria-busy="true">
                        <p class="settings-section-desc recently-deleted-empty">Loading recently deleted items…</p>
                    </div>
                </div>
            </div>
            <div class="settings-card application-about-card">
                <div class="settings-card-title">About</div>
                <div class="settings-section">
                    <div class="settings-section-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        <span>Figaro version</span>
                    </div>
                    <output id="application-version" class="application-version"
                            aria-label="Application version" aria-live="polite"
                            aria-busy="true" data-state="loading">Loading…</output>
                </div>
            </div>
        </div>
        </div>`;
    panel.appendChild(container);

    container.querySelector('#open-vault-health')?.addEventListener('click', () => {
        openTab('vault-health', 'Vault health', 'health');
    });

    initRecentlyDeletedSettings(container).catch(err => {
        log.warn('Recently deleted settings init failed:', err);
    });

    // The panel is removed when Settings closes, so initialize each new panel
    // rather than retaining a module-wide "already initialized" flag.
    panel._settingsPanelDisposed = false;
    Promise.resolve().then(() => {
        if (!panel.isConnected || panel._settingsPanelDisposed) return;
        return initSettingsPanel(panel);
    }).catch(err => {
        log.warn('Settings tab init failed:', err);
    });
    Promise.resolve().then(() => {
        if (!panel.isConnected || panel._settingsPanelDisposed) return;
        initKanbanPresentationSettings(container);
    }).catch(err => {
        log.warn('Kanban Settings init failed:', err);
    });
    loadApplicationVersion({
        readVersion: () => backend().GetApplicationVersion(),
        isActive: () => panel.isConnected && !panel._settingsPanelDisposed,
        present: ({ text, state }) => {
            const version = container.querySelector('#application-version');
            if (!version) return;
            version.textContent = text;
            version.dataset.state = state;
            version.setAttribute('aria-busy', 'false');
        },
    });
}
