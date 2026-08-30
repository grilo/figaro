import { backend } from './backend.js';
/**
 * File Tree Explorer - Handles file tree rendering, interactions, drag-drop, context menu
 */

import { log } from './log.js';
import { setState, getState, subscribe } from './state.js';
import { saveSession, scheduleSessionSave } from './session.js';
import { closeTab, closeTabsForDeletedPath, openTab, prepareTabsForPathCopy, prepareTabsForPathDelete, prepareTabsForPathMove, refreshTabsForUpdatedLinks, updateTabsForMovedPath } from './tabManager.js';
import { statusBar } from './statusBar.js';
import { confirmDialog, errorDialog, fileTreeStyleDialog, mergeNotesDialog, messageDialog, newNoteDialog, promptDialog, renamePathDialog } from './dialogs.js';
import { isDrawioDiagramPath } from './drawio.js';
import { isEditableCodeMirrorFile } from './languageSupport.js';
import { renderLucideIcon } from './lucideIcons.js';
import { confirmExternalTreeImport, importDroppedExternalPaths } from './externalFiles.js';
import { focusEditor, getEditorView, insertTextAtCursor } from './editor.js';
import { handleFileOpen } from './app.js';
import {
    directoryPathsForReveal,
    dirtyFilePaths,
    fileTreeActionPaths,
    fileTreeFilePresentation,
    fileTreeKeyboardPlan,
    fileTreeTooltipPosition,
    fileTreeWindow,
    isFileTreeEntryPinned,
    normalizeFileTreeStyles,
    reconcileSelectedTreePaths,
    sortFileTreeItems,
    toggleExpandedDirectory,
    toggleSelectedPath,
    visibleFileTreeRows,
} from './core/fileTreeModel.js';
import { createFileTreeRefresh } from './usecases/fileTreeRefresh.js';
import { reviewSameDirectoryNoteName } from './usecases/similarNoteReview.js';
import {
    configureContextMenu,
    dismissContextMenu,
} from './contextMenu.js';
import { isContextMenuInvocationKey } from './core/contextMenuModel.js';
import { restoreRecentlyDeletedItem } from './recentlyDeleted.js';
import {
    normalizeTransferEntries,
    planFileTreeTransfer,
    transferTargetDirectory,
} from './core/fileTreeTransferModel.js';
import { createFileTreeTransfer } from './usecases/fileTreeTransfer.js';


let dragSourceNode = null;
let contextMenu = null;

let scheduledTreeRefresh = null;
let nativeFileDropInitialized = false;
let fileTreeRequestEventsInitialized = false;
let externalCopyInProgress = false;
let internalClipboard = null;
let internalCopyInProgress = false;
let internalPasteInProgress = false;
let internalMoveInProgress = false;
let fileTreeActivityCount = 0;
let fileTreeStyles = { version: 1, entries: {}, recent_icons: [] };
let fileTreeCapabilityTooltip = null;
let fileTreeHoveredCapabilityNode = null;
let fileTreeFocusedCapabilityNode = null;
let fileTreeCapabilityTooltipScrollTimer = null;
const fileTreeRenderStates = new WeakMap();

const FILE_TREE_VIRTUAL_THRESHOLD = 400;
const FILE_TREE_WINDOW_SIZE = 160;
const FILE_TREE_ROW_STRIDE = 26;

const fileTreeRefresh = createFileTreeRefresh({
    readTree: () => backend().GetFileTree(),
    readStyles: () => backend().GetFileTreeStyles(),
    fallbackStyles: () => fileTreeStyles,
    publish: ({ tree, styles }) => {
        fileTreeStyles = normalizeFileTreeStyles(styles);
        setState('fileTreeData', tree);
        setState('selectedTreePaths', reconcileSelectedTreePaths(getState('selectedTreePaths'), tree));
        reconcileInternalClipboard(tree);
        renderFileTree();
        document.dispatchEvent(new CustomEvent('vault-file-tree-refreshed', {
            detail: { tree },
        }));
    },
    onLoading: () => statusBar.set('Loading file tree...'),
    onReady: () => statusBar.set('Ready'),
    onStylesFailed: error => log.warn('Could not refresh file-tree appearance:', error),
    onFailed: error => {
        log.error('Failed to load file tree:', error);
        statusBar.set('Failed to load file tree');
    },
});

const fileTreeTransfer = createFileTreeTransfer({
    prepareCopy: path => prepareTabsForPathCopy(path),
    copyPath: (path, targetDirectory) => backend().CopyPath(path, targetDirectory),
    refresh: () => refreshFileTree(),
    onPrepare: source => statusBar.set(`Saving “${source.path.split('/').pop()}” before copying…`),
    onCopy: source => statusBar.set(`Copying “${source.path.split('/').pop()}”…`),
});

const contextMenuViewportMargin = 8;

function beginFileTreeActivity() {
    fileTreeActivityCount++;
    const tree = document.getElementById('file-tree');
    tree?.setAttribute('aria-busy', 'true');
    const finishSpinner = statusBar.beginDelayedActivity(1000);
    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        finishSpinner();
        fileTreeActivityCount = Math.max(0, fileTreeActivityCount - 1);
        if (fileTreeActivityCount === 0) tree?.setAttribute('aria-busy', 'false');
    };
}

/**
 * Keep an overlay menu entirely inside the viewport, opening upward or leftward
 * when the pointer is close to an edge.
 */
export function getContextMenuPosition(clientX, clientY, menuRect, viewport = window) {
    const width = Math.max(0, Number(menuRect?.width) || 0);
    const height = Math.max(0, Number(menuRect?.height) || 0);
    const viewportWidth = Math.max(0, Number(viewport?.innerWidth) || 0);
    const viewportHeight = Math.max(0, Number(viewport?.innerHeight) || 0);
    const maxLeft = Math.max(contextMenuViewportMargin, viewportWidth - width - contextMenuViewportMargin);
    const maxTop = Math.max(contextMenuViewportMargin, viewportHeight - height - contextMenuViewportMargin);

    return {
        left: Math.max(contextMenuViewportMargin, Math.min(clientX, maxLeft)),
        top: Math.max(contextMenuViewportMargin, Math.min(clientY, maxTop)),
    };
}

function positionContextMenu(menu, clientX, clientY) {
    const { left, top } = getContextMenuPosition(clientX, clientY, menu.getBoundingClientRect());
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function fileTreeCapabilityDescriptionElement(node) {
    const descriptionId = node?.getAttribute?.('aria-describedby');
    return descriptionId ? document.getElementById(descriptionId) : null;
}

function removeFileTreeCapabilityTooltip() {
    fileTreeCapabilityTooltip?.remove();
    fileTreeCapabilityTooltip = null;
}

function updateFileTreeCapabilityTooltip() {
    removeFileTreeCapabilityTooltip();
    const node = fileTreeHoveredCapabilityNode || fileTreeFocusedCapabilityNode;
    const description = fileTreeCapabilityDescriptionElement(node);
    if (!node?.isConnected || !description?.textContent?.trim()) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'ui-tooltip file-tree-capability-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.textContent = description.textContent.trim();
    document.body.appendChild(tooltip);
    const position = fileTreeTooltipPosition(
        node.getBoundingClientRect(),
        tooltip.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
    );
    tooltip.style.left = `${position.left}px`;
    tooltip.style.top = `${position.top}px`;
    fileTreeCapabilityTooltip = tooltip;
}

function resetFileTreeCapabilityTooltip() {
    if (fileTreeCapabilityTooltipScrollTimer) clearTimeout(fileTreeCapabilityTooltipScrollTimer);
    fileTreeCapabilityTooltipScrollTimer = null;
    fileTreeHoveredCapabilityNode = null;
    fileTreeFocusedCapabilityNode = null;
    removeFileTreeCapabilityTooltip();
}

function fileTreeNodeContainsTarget(node, target) {
    return Boolean(target?.nodeType && node?.contains?.(target));
}

function handleFileTreeCapabilityTooltipScroll() {
    fileTreeHoveredCapabilityNode = null;
    removeFileTreeCapabilityTooltip();
    if (fileTreeCapabilityTooltipScrollTimer) clearTimeout(fileTreeCapabilityTooltipScrollTimer);
    fileTreeCapabilityTooltipScrollTimer = setTimeout(() => {
        fileTreeCapabilityTooltipScrollTimer = null;
        if (fileTreeFocusedCapabilityNode === document.activeElement) {
            updateFileTreeCapabilityTooltip();
        }
    }, 120);
}

function fileTreeCapabilityDescriptionId(path) {
    return `file-tree-capability-${encodeURIComponent(String(path || ''))}`;
}

const fileTreeContextMenuActions = [
    {
        action: 'open-new-tab',
        label: 'Open in New Tab',
        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>',
    },
    {
        action: 'merge-notes',
        label: 'Merge Notes',
        icon: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    },
    { separator: true },
    {
        action: 'cut',
        label: 'Cut',
        shortcut: 'Ctrl+X',
        icon: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.7 8.7 12.6 12.6M8.7 15.3 21.3 2.7"/>',
    },
    {
        action: 'copy',
        label: 'Copy',
        shortcut: 'Ctrl+C',
        icon: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    },
    {
        action: 'paste',
        label: 'Paste',
        shortcut: 'Ctrl+V',
        icon: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
    },
    { separator: true },
    {
        action: 'new-file',
        label: 'New File',
        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>',
    },
    {
        action: 'new-drawio',
        label: 'New Draw.io Diagram',
        icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><circle cx="16" cy="16" r="2"/><path d="m9.5 9.5 5 5"/>',
    },
    {
        action: 'new-folder',
        label: 'New Folder',
        icon: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
    },
    {
        action: 'rename',
        label: 'Rename',
        shortcut: 'F2',
        icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    },
    {
        action: 'customize-style',
        label: 'Customize appearance…',
        icon: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="8" r="1"/><circle cx="16" cy="14" r="1"/><path d="M12 21a3 3 0 0 1 0-6h1"/>',
    },
    {
        action: 'toggle-pin',
        label: 'Pin',
        icon: '<path d="M12 17v5"/><path d="M5 17h14"/><path d="m7 2 1 7-3 3v2h14v-2l-3-3 1-7z"/>',
    },
    { separator: true },
    {
        action: 'reveal',
        label: 'Reveal in File Explorer',
        icon: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
    },
    {
        action: 'delete',
        label: 'Delete',
        shortcut: 'Delete',
        danger: true,
        icon: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
    },
];

function platformShortcut(shortcut) {
    const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || '');
    return isMac ? shortcut.replace(/^Ctrl\+/, '⌘') : shortcut;
}

function fileTreeContextMenuItemHTML({ action, label, icon, danger, shortcut }, enabled) {
    const classes = ['ui-menu-item', 'context-menu-item'];
    if (danger) classes.push('danger');
    if (!enabled) classes.push('disabled');
    return `
        <button type="button" class="${classes.join(' ')}" data-action="${action}"${enabled ? '' : ' aria-disabled="true" disabled'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>
            <span class="context-menu-item-label">${label}</span>
            ${shortcut ? `<span class="context-menu-item-shortcut" aria-hidden="true">${platformShortcut(shortcut)}</span>` : ''}
        </button>`;
}

/**
 * The file tree always presents the same action inventory. Context determines
 * which entries are enabled, rather than making the menu jump between shapes.
 */
export function buildFileTreeContextMenuHTML({
    type = 'root',
    path = '',
    selectedPaths = [],
    clipboardPath = '',
    external = false,
    pinned = false,
} = {}) {
    const normalizedType = type === 'file' || type === 'directory' ? type : 'root';
    const targetPath = String(path || '');
    const isFile = normalizedType === 'file';
    const isTarget = normalizedType !== 'root';
    const isMarkdownFile = isFile && targetPath.toLowerCase().endsWith('.md');
    const isOpenableFile = isFile && (isDrawioDiagramPath(targetPath) || isEditableCodeMirrorFile(targetPath));
    const isManagedOnlyFile = isFile && !external && !isOpenableFile;
    const actionPaths = external
        ? (targetPath ? [targetPath] : [])
        : fileTreeActionPaths(targetPath, selectedPaths);
    const isSingleTarget = actionPaths.length <= 1;
    const selectedNotePaths = [...new Set(selectedPaths
        .map(selectedPath => String(selectedPath || ''))
        .filter(selectedPath => selectedPath.toLowerCase().endsWith('.md')))];
    const canMerge = isMarkdownFile
        && selectedNotePaths.includes(targetPath)
        && selectedNotePaths.length >= 2;
    const enabled = {
        'open-new-tab': isSingleTarget && isFile,
        'merge-notes': !external && canMerge,
        cut: !external && actionPaths.length > 0,
        copy: !external && actionPaths.length > 0,
        paste: !external && Boolean(clipboardPath),
        'new-file': !external,
        'new-drawio': !external,
        'new-folder': !external,
        rename: !external && isTarget && isSingleTarget,
        'customize-style': !external && isTarget && isSingleTarget,
        'toggle-pin': !external && isTarget && isSingleTarget,
        reveal: !external && isTarget && isSingleTarget,
        delete: external ? isTarget : isTarget && isSingleTarget,
    };

    return fileTreeContextMenuActions.map(item => {
        if (item.separator) return '<div class="ui-menu-separator context-menu-separator"></div>';
        let contextualItem = item;
        if (item.action === 'open-new-tab' && isManagedOnlyFile) {
            contextualItem = { ...item, label: 'Open' };
        } else if (item.action === 'toggle-pin') {
            contextualItem = { ...item, label: pinned ? 'Unpin' : 'Pin' };
        } else if (item.action === 'delete' && external) {
            contextualItem = { ...item, label: 'Remove from file tree', danger: false };
        }
        return fileTreeContextMenuItemHTML(contextualItem, Boolean(enabled[item.action]));
    }).join('');
}

/**
 * Initialize file tree
 */
export function initFileTree() {
    renderFileTree();
    loadFileTreeStyles().catch(() => {});
    initFileTreeEvents();
    initContextMenu();
    initNativeFileDrops();
    initInboxNoteButton();
    initFileTreeRequestEvents();

    // Keep current-document semantics and unsaved-buffer markers in sync
    // without changing folder state. Rebuilding a large tree for a tab switch
    // (or its first dirty transition) is both
    // expensive and needlessly disrupts mounted nodes. Structural changes
    // still go through renderFileTree(); this path updates only states that
    // can exist on already-mounted file nodes.
    // expandedDirs belongs to the user: restoring or switching tabs must not
    // reopen ancestors that the user explicitly collapsed.
    subscribe('activeTabId', () => {
        const tabs = getState('openTabs');
        const activeId = getState('activeTabId');
        const activeTab = tabs.find(t => t.id === activeId);
        const activePath = activeTab
            && (activeTab.type === 'file' || activeTab.type === 'drawio')
            && activeTab.path
            ? activeTab.path
            : null;
        setState('selectedFilePath', activePath);
        syncFileTreeTabMarkers();
    });
    subscribe('openTabs', syncFileTreeTabMarkers);
}

function initFileTreeRequestEvents() {
    if (fileTreeRequestEventsInitialized) return;
    fileTreeRequestEventsInitialized = true;

    document.addEventListener('vault-tree-refresh-requested', () => {
        refreshFileTree().catch(() => {});
    });
    document.addEventListener('vault-directory-reveal-requested', event => {
        const path = String(event.detail?.path || '');
        const item = findTreeItem(getState('fileTreeData') || [], path);
        if (!item || item.type !== 'directory') return;

        if (getState('sidebarCollapsed')) document.getElementById('toggle-sidebar')?.click();
        const expanded = new Set(getState('expandedDirs') || []);
        for (const directoryPath of directoryPathsForReveal(path)) expanded.add(directoryPath);
        setState('expandedDirs', expanded);
        setState('selectedTreePath', path);
        setState('selectedTreePaths', [path]);
        renderFileTree();
        saveSession();

        requestAnimationFrame(() => {
            const escaped = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const node = document.querySelector(`.file-tree-item[data-path="${escaped}"] > .file-tree-node`);
            node?.scrollIntoView?.({ block: 'nearest' });
            focusTreeNode(node, { scroll: false });
        });
    });
}

/**
 * Update current-document semantics and dirty-buffer markers on the mounted
 * part of the tree. Collapsed descendants intentionally have no node to patch;
 * when expanded, renderFileTree() derives their state from the same store.
 *
 * This must not mutate tab state or emit events: callers such as markTabDirty
 * rely on the one-time tab transition to notify Git status listeners.
 */
export function syncFileTreeTabMarkers() {
    const container = document.getElementById('file-tree');
    if (!container) return;

    const dirtyPaths = dirtyFilePaths(getState('openTabs'));
    const activeFilePath = getState('selectedFilePath');
    const renderState = fileTreeRenderStates.get(container);
    if (renderState) {
        renderState.activeFilePath = activeFilePath;
        renderState.dirtyPaths = dirtyPaths;
        renderState.selectedPaths = getState('selectedTreePaths') || [];
    }

    syncMountedFileTreeSelection(container);
    container.querySelectorAll('.file-tree-item[data-type="file"] > .file-tree-node').forEach(node => {
        const path = node.parentElement?.dataset.path;
        if (!path) return;
        const active = path === activeFilePath;
        const dirty = dirtyPaths.has(path);
        node.classList.toggle('dirty-buffer', dirty);
        let dirtyStatus = node.querySelector('.node-dirty-status');
        if (dirty && !dirtyStatus) {
            dirtyStatus = document.createElement('span');
            dirtyStatus.className = 'sr-only node-dirty-status';
            dirtyStatus.textContent = 'Unsaved changes';
            node.querySelector('.node-name')?.after(dirtyStatus);
        } else if (!dirty) {
            dirtyStatus?.remove();
        }
        if (active) node.setAttribute('aria-current', 'page');
        else node.removeAttribute('aria-current');
    });
}

function syncMountedFileTreeSelection(container) {
    if (!container) return;
    const selectedPathList = getState('selectedTreePaths') || [];
    const selectedPaths = new Set(selectedPathList);
    const activeFilePath = getState('selectedFilePath');
    const renderState = fileTreeRenderStates.get(container);
    if (renderState) {
        renderState.selectedPath = getState('selectedTreePath');
        renderState.selectedPaths = selectedPathList;
    }
    for (const node of mountedTreeNodes(container)) {
        const path = treeNodePath(node);
        const active = path === activeFilePath;
        const selected = selectedPaths.has(path);
        node.classList.toggle('selected', selected);
        node.setAttribute('aria-selected', String(selected));
        if (active) node.setAttribute('aria-current', 'page');
        else node.removeAttribute('aria-current');
    }
}

function initInboxNoteButton() {
    document.querySelectorAll('.quick-note-action').forEach(button => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => createInboxNote());
    });
}

export async function createInboxNote() {
    const buttons = [...document.querySelectorAll('.quick-note-action')];
    if (buttons.some(button => button.disabled)) return null;
    buttons.forEach(button => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
    });
    try {
        const result = await backend().CreateInboxNote();
        if (!result?.success) {
            await errorDialog('Couldn’t create Inbox note', result?.error, 'No existing note was changed.');
            return result;
        }
        await refreshFileTree();
        await handleFileOpen(result.path);
        focusEditor();
        statusBar.set('Created note in Inbox');
        return result;
    } catch (error) {
        log.error('Create Inbox note failed:', error);
        await errorDialog('Couldn’t create Inbox note', error, 'No existing note was changed.');
        return null;
    } finally {
        buttons.forEach(button => {
            if (!button.isConnected) return;
            button.disabled = false;
            button.removeAttribute('aria-busy');
        });
    }
}

/**
 * Refresh file tree from backend
 */
export async function refreshFileTree() {
    return fileTreeRefresh.refresh();
}

export async function loadFileTreeStyles() {
    try {
        fileTreeStyles = normalizeFileTreeStyles(await backend().GetFileTreeStyles());
        renderFileTree();
        return fileTreeStyles;
    } catch (error) {
        log.warn('Could not load file-tree appearance:', error);
        return fileTreeStyles;
    }
}

export function addExternalFileTreeEntry(file) {
    if (!file?.id || !file?.path) return false;
    const current = getState('externalFileTreeEntries') || [];
    const entry = {
        name: file.name || String(file.path).split(/[\\/]/).pop() || 'Untitled.md',
        path: file.path,
        type: 'file',
        mtime: file.mtime,
        externalFileId: file.id,
    };
    setState('externalFileTreeEntries', [
        ...current.filter(candidate => candidate.externalFileId !== file.id),
        entry,
    ]);
    renderFileTree();
    return true;
}

function visibleFileTreeData() {
    return [
        ...(getState('fileTreeData') || []),
        ...(getState('externalFileTreeEntries') || []),
    ];
}

function mountedTreeNodes(container) {
    return [...(container?.querySelectorAll?.('.file-tree-node[role="treeitem"]') || [])];
}

function treeNodePath(node) {
    return node?.closest?.('.file-tree-item')?.dataset.path || '';
}

function mountedTreeNodeForPath(container, path) {
    return mountedTreeNodes(container).find(node => treeNodePath(node) === path) || null;
}

function synchronizeTreeRovingTabIndex(container, preferredPath = '') {
    const nodes = mountedTreeNodes(container);
    if (!nodes.length) {
        if (container) container.tabIndex = 0;
        return null;
    }

    container.tabIndex = -1;
    const selectedPath = preferredPath || getState('selectedTreePath') || getState('selectedFilePath') || '';
    const target = mountedTreeNodeForPath(container, selectedPath) || nodes[0];
    for (const node of nodes) node.tabIndex = node === target ? 0 : -1;
    return target;
}

function adoptTreeNodeFocus(node) {
    const container = node?.closest?.('#file-tree');
    const path = treeNodePath(node);
    if (!container || !path) return false;

    if (getState('selectedTreePath') !== path) setState('selectedTreePath', path);
    const selectedPaths = new Set(getState('selectedTreePaths') || []);
    const activeFilePath = getState('selectedFilePath');
    for (const candidate of mountedTreeNodes(container)) {
        const candidatePath = treeNodePath(candidate);
        const focused = candidatePath === path;
        const active = candidatePath === activeFilePath;
        const selected = selectedPaths.has(candidatePath);
        candidate.classList.toggle('selected', selected);
        candidate.setAttribute('aria-selected', String(selected));
        if (active) candidate.setAttribute('aria-current', 'page');
        else candidate.removeAttribute('aria-current');
        candidate.tabIndex = focused ? 0 : -1;
    }
    scheduleSessionSave();
    return true;
}

function focusTreeNode(node, { scroll = true } = {}) {
    if (!node) return false;
    adoptTreeNodeFocus(node);
    node.focus?.({ preventScroll: true });
    if (scroll) node.scrollIntoView?.({ block: 'nearest' });
    return true;
}

function configureFileTreeContainer(container) {
    if (!container) return;
    container.setAttribute('role', 'tree');
    container.setAttribute('aria-label', 'Vault file tree');
    container.setAttribute('aria-multiselectable', 'true');
}

// Native vault events may arrive in quick batches for an editor's atomic save
// or a directory move. Coalesce them into one full tree request instead of
// keeping a permanent polling loop alive.
export function scheduleFileTreeRefresh(delay = 180) {
    if (scheduledTreeRefresh) clearTimeout(scheduledTreeRefresh);
    scheduledTreeRefresh = setTimeout(() => {
        scheduledTreeRefresh = null;
        refreshFileTree().catch(() => {});
    }, Math.max(0, Number(delay) || 0));
}

/**
 * Render file tree from state data
 */
export function renderFileTree() {
    resetFileTreeCapabilityTooltip();
    const container = document.getElementById('file-tree');
    const treeData = visibleFileTreeData();
    const expandedDirs = getState('expandedDirs');
    const selectedPath = getState('selectedTreePath');
    const activeFilePath = getState('selectedFilePath');
    const selectedPaths = getState('selectedTreePaths') || [];
    const cutPaths = internalCutClipboardPaths();
    const dirtyPaths = dirtyFilePaths(getState('openTabs'));
    
    if (!container) return;
    // Structural tree refreshes are intentionally rare, but they should not
    // pull a reader away from the selected entry or steal keyboard ownership.
    configureFileTreeContainer(container);
    const restoreScrollTop = container.scrollTop;
    const focusedNode = document.activeElement?.closest?.('.file-tree-node[role="treeitem"]');
    const treeOwnedFocus = document.activeElement === container || Boolean(focusedNode && container.contains(focusedNode));
    const restoreFocusPath = focusedNode ? treeNodePath(focusedNode) : selectedPath;
    
    if (!treeData || treeData.length === 0) {
        fileTreeRenderStates.delete(container);
        container.onscroll = null;
        container.onwheel = null;
        container.onpointerdown = null;
        container.innerHTML = '<div class="file-tree-empty">No files in vault</div><div class="file-tree-root-dropzone" aria-label="Vault root actions"></div>';
        container.tabIndex = 0;
        container.scrollTop = restoreScrollTop;
        if (treeOwnedFocus) container.focus({ preventScroll: true });
        return;
    }

    const visibleRows = visibleFileTreeRows(treeData, expandedDirs, fileTreeStyles.entries);
    if (visibleRows.length > FILE_TREE_VIRTUAL_THRESHOLD) {
        const selectedIndex = visibleRows.findIndex(row => row.path === restoreFocusPath);
        fileTreeRenderStates.set(container, {
            activeFilePath,
            cutPaths,
            focusProtection: null,
            dirtyPaths,
            range: { start: 0, end: 0 },
            restoreFocusPath,
            rows: visibleRows,
            selectedPath,
            selectedPaths,
            styles: fileTreeStyles.entries,
        });
        const focusTarget = renderFileTreeWindow(container, { selectedIndex });
        initFileTreeWindowing(container);
        container.scrollTop = restoreScrollTop;
        if (treeOwnedFocus) focusTreePath(container, restoreFocusPath || treeNodePath(focusTarget));
        return;
    }

    fileTreeRenderStates.delete(container);
    container.onscroll = null;
    container.onwheel = null;
    container.onpointerdown = null;
    
    // Keep a real flexing surface after short file lists. Delegated context
    // events then reach #file-tree even when the user clicks below the last
    // file, making an empty/new vault easy to populate.
    container.innerHTML = buildTreeHTML(treeData, expandedDirs, selectedPath, selectedPaths, 0, activeFilePath, fileTreeStyles.entries, dirtyPaths, cutPaths) +
        '<div class="file-tree-root-dropzone" aria-label="Vault root actions"></div>';
    const focusTarget = synchronizeTreeRovingTabIndex(container, restoreFocusPath);
    container.scrollTop = restoreScrollTop;
    if (treeOwnedFocus) focusTreeNode(focusTarget, { scroll: false });
}

/**
 * Build tree HTML recursively
 */
export function buildTreeHTML(items, expandedDirs, focusPath, selectedPaths = [], depth = 0, activeFilePath = null, styles = fileTreeStyles.entries, dirtyPaths = [], cutPaths = internalCutClipboardPaths()) {
    let html = `<ul class="file-tree-list" role="${depth === 0 ? 'group' : 'none'}">`;
    const cutPathSet = cutPaths instanceof Set ? cutPaths : new Set(cutPaths || []);
    
    for (const item of sortFileTreeItems(items, styles)) {
        const isDir = item.type === 'directory';
        const isExternal = Boolean(item.externalFileId);
        const isExpanded = expandedDirs.has(item.path);
        const isFocusTarget = item.path === (focusPath || activeFilePath);
        const isActiveFile = !isDir && item.path === activeFilePath;
        const isDirtyBuffer = !isDir && (dirtyPaths instanceof Set ? dirtyPaths.has(item.path) : dirtyPaths.includes?.(item.path));
        const isSelected = selectedPaths.includes(item.path);
        const isCutMarked = cutPathSet.has(item.path);
        const hasChildren = isDir && item.children && item.children.length > 0;
        const isDrawioDiagram = !isDir && isDrawioDiagramPath(item.path);
        const isManagedOnly = !isDir && !isExternal && !isEditableCodeMirrorFile(item.path) && !isDrawioDiagram;
        const isPinned = !isExternal && isFileTreeEntryPinned(item, styles);
        const filePresentation = isDir ? null : fileTreeFilePresentation(item.path);
        const appearance = styles?.[item.path] || {};
        const customIcon = appearance.icon ? renderLucideIcon(appearance.icon, { size: 16 }) : '';
        const defaultInboxIcon = isDir && item.path === 'Inbox'
            ? renderLucideIcon('Mail', { size: 16, className: 'default-inbox-icon' })
            : '';
        const defaultExternalIcon = isExternal
            ? renderLucideIcon('FileSymlink', { size: 16, className: 'default-external-icon' })
            : '';
        const defaultFileIcon = !isDir && !isExternal
            ? renderLucideIcon(filePresentation.icon, { size: 16, className: 'default-file-icon' })
            : '';
        const resolvedIcon = customIcon || defaultInboxIcon;
        const customColor = /^#[0-9a-f]{6}$/i.test(appearance.color || '') ? appearance.color : '';
        const appearanceClasses = `${customIcon ? 'custom-icon' : ''} ${customColor ? 'custom-color' : ''}`.trim();
        const appearanceStyle = customColor ? ` style="--file-tree-entry-color:${customColor}"` : '';
        const nodeTitle = isExternal ? `Outside vault: ${item.path}` : '';
        const capabilityDescription = isManagedOnly
            ? `${filePresentation.label}. Not editable in Figaro. Double-click to open with the default application.`
            : '';
        const capabilityDescriptionId = isManagedOnly
            ? fileTreeCapabilityDescriptionId(item.path)
            : '';
        
        html += `
            <li class="file-tree-item ${isExpanded ? 'expanded' : ''}" role="none" data-path="${escapeHtml(item.path)}" data-type="${item.type}"${isExternal ? ` data-external-file-id="${escapeHtml(item.externalFileId)}"` : ''}>
                <div class="file-tree-node ${isSelected ? 'selected' : ''} ${isDirtyBuffer ? 'dirty-buffer' : ''} ${isCutMarked ? 'cut-marked' : ''} ${isPinned ? 'pinned' : ''} ${isExternal ? 'external-file' : ''} ${appearanceClasses}" role="treeitem" tabindex="${isFocusTarget ? '0' : '-1'}" aria-level="${depth + 1}" aria-selected="${isSelected}"${isActiveFile ? ' aria-current="page"' : ''}${hasChildren ? ` aria-expanded="${isExpanded}"` : ''}${capabilityDescriptionId ? ` aria-label="${escapeHtml(item.name)}" aria-describedby="${escapeHtml(capabilityDescriptionId)}"` : ''} draggable="${isExternal ? 'false' : 'true'}"${nodeTitle ? ` title="${escapeHtml(nodeTitle)}"` : ''}${appearanceStyle}>
                    ${isDir ? `
                        <span class="node-chevron">${hasChildren ? `
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>` : ''}</span>
                        <span class="node-icon">
                            ${resolvedIcon || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>`}
                        </span>
                    ` : `
                        <span class="node-chevron"></span>
                        <span class="node-icon">
                            ${customIcon || defaultExternalIcon || defaultFileIcon || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>`}
                        </span>
                    `}
                    <span class="node-name">${escapeHtml(item.name)}</span>
                    ${isDirtyBuffer ? '<span class="sr-only node-dirty-status">Unsaved changes</span>' : ''}
                    ${isManagedOnly ? `<span id="${escapeHtml(capabilityDescriptionId)}" class="sr-only node-capability-status" role="tooltip">${escapeHtml(capabilityDescription)}</span>` : ''}
                    ${isCutMarked ? fileTreeCutIndicatorHTML() : ''}
                    ${isExternal ? `<span class="node-external-indicator" title="Outside vault" aria-label="Outside vault">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        </svg>
                    </span>` : ''}
                    ${isPinned ? `<span class="node-pin-indicator" title="Pinned" aria-label="Pinned">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 17v5"></path><path d="M5 17h14"></path><path d="m7 2 1 7-3 3v2h14v-2l-3-3 1-7z"></path>
                        </svg>
                    </span>` : ''}
                </div>
                ${isDir && hasChildren && isExpanded ? `
                    <div class="file-tree-children" role="group">
                        ${buildTreeHTML(item.children, expandedDirs, focusPath, selectedPaths, depth + 1, activeFilePath, styles, dirtyPaths, cutPathSet)}
                    </div>
                ` : ''}
            </li>
        `;
    }
    
    html += '</ul>';
    return html;
}

function buildFlatTreeRowHTML(row, state) {
    // Reuse the canonical row renderer with a shallow child sentinel. The
    // sentinel preserves directory disclosure semantics without recursively
    // mounting descendants that live elsewhere in the logical flat window.
    const shallowItem = row.hasChildren
        ? { ...row.item, children: [{ name: '', path: '', type: 'file' }] }
        : { ...row.item, children: [] };
    const wrapper = buildTreeHTML(
        [shallowItem],
        new Set(),
        state.selectedPath,
        state.selectedPaths,
        row.depth - 1,
        state.activeFilePath,
        state.styles,
        state.dirtyPaths,
        state.cutPaths,
    );
    let html = wrapper.slice(wrapper.indexOf('>') + 1, wrapper.lastIndexOf('</ul>'));
    html = html.replace(
        '<li class="file-tree-item ',
        `<li style="--file-tree-depth:${Math.max(0, row.depth - 1)}" class="file-tree-item `,
    );
    if (row.expanded) {
        html = html.replace('class="file-tree-item ', 'class="file-tree-item expanded ')
            .replace('aria-expanded="false"', 'aria-expanded="true"');
    }
    return html;
}

function renderFileTreeWindow(container, { anchorIndex = 0, selectedIndex = -1 } = {}) {
    const state = fileTreeRenderStates.get(container);
    if (!state) return null;
    const protection = state.focusProtection;
    const protectedIndex = protection ? protection.index : -1;
    const range = fileTreeWindow(state.rows.length, {
        anchorIndex,
        selectedIndex: protectedIndex >= 0 ? protectedIndex : selectedIndex,
        windowSize: FILE_TREE_WINDOW_SIZE,
    });
    state.range = range;
    const scrollTop = container.scrollTop;
    const parts = ['<ul class="file-tree-list file-tree-list--virtual" role="group">'];
    if (range.start > 0) {
        parts.push(`<li class="file-tree-spacer" aria-hidden="true"
            style="height:${range.start * FILE_TREE_ROW_STRIDE}px"></li>`);
    }
    for (let index = range.start; index < range.end; index += 1) {
        parts.push(buildFlatTreeRowHTML(state.rows[index], state));
    }
    if (range.end < state.rows.length) {
        parts.push(`<li class="file-tree-spacer" aria-hidden="true"
            style="height:${(state.rows.length - range.end) * FILE_TREE_ROW_STRIDE}px"></li>`);
    }
    parts.push('</ul><div class="file-tree-root-dropzone" aria-label="Vault root actions"></div>');
    container.innerHTML = parts.join('');
    container.scrollTop = scrollTop;
    const focusTarget = synchronizeTreeRovingTabIndex(container, state.restoreFocusPath);
    if (protectedIndex >= range.start && protectedIndex < range.end) {
        const protectedNode = mountedTreeNodeForPath(container, state.rows[protectedIndex].path);
        if (document.activeElement === document.body) protectedNode?.focus({ preventScroll: true });
    }
    return focusTarget;
}

function focusTreePath(container, path) {
    const mounted = mountedTreeNodeForPath(container, path);
    const state = fileTreeRenderStates.get(container);
    const index = state?.rows.findIndex(row => row.path === path) ?? -1;
    if (mounted) {
        if (state && index >= 0) {
            state.restoreFocusPath = path;
            state.focusProtection = { index };
        }
        return focusTreeNode(mounted);
    }
    if (!state || index < 0) return false;
    state.restoreFocusPath = path;
    state.focusProtection = { index };
    renderFileTreeWindow(container, { selectedIndex: index });
    return focusTreeNode(mountedTreeNodeForPath(container, path));
}

function initFileTreeWindowing(container) {
    let frame = 0;
    container.onscroll = () => {
        if (frame) return;
        frame = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(() => {
            frame = 0;
            const state = fileTreeRenderStates.get(container);
            if (!state) return;
            if (state.focusProtection) return;
            const anchorIndex = Math.floor(container.scrollTop / FILE_TREE_ROW_STRIDE);
            const range = fileTreeWindow(state.rows.length, {
                anchorIndex,
                windowSize: FILE_TREE_WINDOW_SIZE,
            });
            if (range.start !== state.range.start || range.end !== state.range.end) {
                renderFileTreeWindow(container, { anchorIndex });
            }
        });
    };
    const releaseFocusProtection = () => {
        const state = fileTreeRenderStates.get(container);
        if (state) state.focusProtection = null;
    };
    container.onwheel = releaseFocusProtection;
    container.onpointerdown = releaseFocusProtection;
}

/**
 * Initialize file tree event handlers
 */
function initFileTreeEvents() {
    const container = document.getElementById('file-tree');
    if (!container) return;
    configureFileTreeContainer(container);
    synchronizeTreeRovingTabIndex(container);

    container.addEventListener('focusin', event => {
        const node = event.target.closest?.('.file-tree-node[role="treeitem"]');
        if (node && container.contains(node)) {
            adoptTreeNodeFocus(node);
            fileTreeFocusedCapabilityNode = fileTreeCapabilityDescriptionElement(node) ? node : null;
            updateFileTreeCapabilityTooltip();
        }
    });
    container.addEventListener('focusout', event => {
        const node = event.target.closest?.('.file-tree-node[role="treeitem"]');
        if (!node || fileTreeNodeContainsTarget(node, event.relatedTarget)) return;
        if (fileTreeFocusedCapabilityNode === node) fileTreeFocusedCapabilityNode = null;
        updateFileTreeCapabilityTooltip();
    });
    container.addEventListener('mouseover', event => {
        const node = event.target.closest?.('.file-tree-node[aria-describedby]');
        if (!node || !container.contains(node) || fileTreeNodeContainsTarget(node, event.relatedTarget)) return;
        fileTreeHoveredCapabilityNode = node;
        updateFileTreeCapabilityTooltip();
    });
    container.addEventListener('mouseout', event => {
        const node = event.target.closest?.('.file-tree-node[aria-describedby]');
        if (!node || fileTreeNodeContainsTarget(node, event.relatedTarget)) return;
        if (fileTreeHoveredCapabilityNode === node) fileTreeHoveredCapabilityNode = null;
        updateFileTreeCapabilityTooltip();
    });
    container.addEventListener('scroll', handleFileTreeCapabilityTooltipScroll, { passive: true });
    
    // Click delegation for nodes
    container.addEventListener('click', (e) => {
        const node = e.target.closest('.file-tree-node');
        if (!node) {
            if (e.target.closest('.file-tree-root-dropzone')) {
                setState('selectedTreePath', null);
                setState('selectedTreePaths', []);
                saveSession();
                renderFileTree();
                container.focus({ preventScroll: true });
            }
            return;
        }
        focusTreeNode(node, { scroll: false });
        
        const item = node.closest('.file-tree-item');
        if (!item) return;
        
        const path = item.dataset.path;
        const type = item.dataset.type;
        const externalFileId = item.dataset.externalFileId;
        
        if (type === 'directory') {
            if (e.ctrlKey || e.metaKey) {
                if (externalFileId) return;
                e.preventDefault();
                setState('selectedTreePaths', toggleSelectedPath(
                    getState('selectedTreePaths'),
                    path,
                ));
                renderFileTree();
            } else {
                setState('selectedTreePath', path);
                setState('selectedTreePaths', [path]);
                toggleDirectory(path);
                renderFileTree();
            }
        } else if (type === 'file') {
            const isDiagram = isDrawioDiagramPath(path);
            const isEditable = Boolean(externalFileId) || isEditableCodeMirrorFile(path);
            const isCtrl = e.ctrlKey || e.metaKey;
            if (isCtrl) {
                // External shortcuts remain single-target capabilities, but
                // every vault file—including managed-only assets—can
                // participate in ordinary file-tree multi-selection.
                if (externalFileId) return;
                e.preventDefault();
                setState('selectedTreePaths', toggleSelectedPath(
                    getState('selectedTreePaths'),
                    path,
                ));
                renderFileTree();
            } else {
                // Focus/select this row, then let successful tab activation
                // own current-document state. A failed read must not make an
                // unopened file look current.
                setState('selectedTreePath', path);
                setState('selectedTreePaths', externalFileId ? [] : [path]);
                if (externalFileId) {
                    const external = (getState('externalFileTreeEntries') || [])
                        .find(entry => entry.externalFileId === externalFileId);
                    if (!external) return;
                    openTab(`external:${externalFileId}`, external.name, 'file', {
                        path: external.path,
                        mtime: external.mtime,
                        externalFileId,
                    });
                } else if (isDiagram) {
                    openTab(path, path.split('/').pop(), 'drawio', { path });
                } else if (isEditable) {
                    handleFileOpen(path);
                }
                saveSession();
                if (!externalFileId && !isDiagram && !isEditable) {
                    // Keep the row mounted across the two clicks so the native
                    // dblclick event can reach the managed-file handler.
                    syncMountedFileTreeSelection(container);
                } else {
                    renderFileTree();
                }
            }
        }
    });
    
    // Double-click opens managed-only assets with their OS-associated app.
    container.addEventListener('dblclick', async (e) => {
        const node = e.target.closest('.file-tree-node');
        if (!node) return;
        
        const item = node.closest('.file-tree-item');
        if (!item) return;
        
        const path = item.dataset.path;
        const type = item.dataset.type;
        const externalFileId = item.dataset.externalFileId;
        
        if (type === 'directory') {
            toggleDirectory(path);
        } else if (type === 'file'
            && !externalFileId
            && !isDrawioDiagramPath(path)
            && !isEditableCodeMirrorFile(path)) {
            e.preventDefault();
            await openManagedFileWithDefaultApplication(path);
        }
    });
    
    // Drag and drop
    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('dragend', handleDragEnd);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);
    
    // Context menu (right-click)
    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('keydown', handleFileTreeKeydown);
}

/**
 * Toggle directory expansion
 */
export function toggleDirectory(path) {
    const expandedDirs = toggleExpandedDirectory(getState('expandedDirs'), path);
    setState('expandedDirs', expandedDirs);
    saveSession();
    
    // Toggle DOM directly — find the item and flip the class
    const escaped = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const item = document.querySelector(`.file-tree-item[data-path="${escaped}"]`);
    if (item) {
        item.classList.toggle('expanded');
    }
}

/**
 * Get the active document path independently from file-tree selection.
 */
export function getSelectedFilePath() {
    return getState('selectedFilePath');
}

/**
 * Find tree item by path
 */
export function findTreeItem(items, path) {
    for (const item of items) {
        if (item.path === path) return item;
        if (item.children) {
            const found = findTreeItem(item.children, path);
            if (found) return found;
        }
    }
    return null;
}

/** Clear the in-app file clipboard, for example when switching vaults. */
export function clearFileTreeClipboard() {
    internalClipboard = null;
    syncFileTreeClipboardMarkers();
}

function normalizeInternalPath(path) {
    return String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

function normalizeInternalClipboardEntries(entries) {
    return normalizeTransferEntries(entries);
}

function setInternalClipboard(entries, operation) {
    const normalized = normalizeInternalClipboardEntries(entries);
    if (!normalized.length || (operation !== 'copy' && operation !== 'cut')) {
        internalClipboard = null;
        syncFileTreeClipboardMarkers();
        return [];
    }
    // Keep path/type aliases for the single-item callers and existing menu
    // plumbing while entries carries the complete multi-selection.
    internalClipboard = {
        entries: normalized,
        path: normalized[0].path,
        type: normalized[0].type,
        operation,
    };
    syncFileTreeClipboardMarkers();
    return normalized;
}

function internalClipboardEntries() {
    if (!internalClipboard) return [];
    if (Array.isArray(internalClipboard.entries)) {
        return normalizeInternalClipboardEntries(internalClipboard.entries);
    }
    return normalizeInternalClipboardEntries([internalClipboard]);
}

function internalCutClipboardPaths() {
    if (internalClipboard?.operation !== 'cut') return [];
    return internalClipboardEntries().map(entry => entry.path);
}

function fileTreeCutIndicatorHTML() {
    const icon = renderLucideIcon('Scissors', { size: 13 }) || `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="m8.7 8.7 12.6 12.6M8.7 15.3 21.3 2.7"></path>
        </svg>`;
    return `<span class="node-cut-indicator" title="Cut — ready to paste" aria-hidden="true">${icon}</span>
        <span class="sr-only node-cut-status">Cut; ready to paste</span>`;
}

function syncFileTreeClipboardMarkers(container = document.getElementById('file-tree')) {
    if (!container) return;
    const cutPathList = internalCutClipboardPaths();
    const cutPaths = new Set(cutPathList);
    const renderState = fileTreeRenderStates.get(container);
    if (renderState) renderState.cutPaths = cutPathList;

    for (const node of mountedTreeNodes(container)) {
        const marked = cutPaths.has(treeNodePath(node));
        node.classList.toggle('cut-marked', marked);
        let indicator = node.querySelector('.node-cut-indicator');
        let status = node.querySelector('.node-cut-status');
        if (marked) {
            if (!indicator) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = fileTreeCutIndicatorHTML();
                indicator = wrapper.querySelector('.node-cut-indicator');
                status = wrapper.querySelector('.node-cut-status');
                if (indicator) node.append(indicator);
                if (status) node.append(status);
            }
        } else {
            indicator?.remove();
            status?.remove();
        }
    }
}

function reconcileInternalClipboard(tree) {
    if (!internalClipboard) return;
    const entries = internalClipboardEntries().filter(entry => {
        const item = findTreeItem(tree || [], entry.path);
        return item && !item.externalFileId && item.type === entry.type;
    });
    if (entries.length !== internalClipboardEntries().length) {
        setInternalClipboard(entries, internalClipboard.operation);
    }
}

function internalClipboardLabel(entries) {
    if (entries.length === 1) return `“${entries[0].path.split('/').pop()}”`;
    return `${entries.length} items`;
}

/** Resolve the selected vault entries affected by a file-tree action. */
function fileTreeActionEntries(targetPath, targetType) {
    const tree = getState('fileTreeData') || [];
    const paths = fileTreeActionPaths(targetPath, getState('selectedTreePaths') || []);
    return paths.map(path => {
        const item = findTreeItem(tree, path);
        if (item) {
            if (item.externalFileId || (item.type !== 'file' && item.type !== 'directory')) return null;
            return { path: item.path, type: item.type };
        }
        const normalizedPath = normalizeInternalPath(targetPath);
        return path === normalizedPath && (targetType === 'file' || targetType === 'directory')
            ? { path, type: targetType }
            : null;
    }).filter(Boolean);
}

/** Store vault items for non-destructive internal copy/paste. */
export function copyInternalPaths(entries) {
    const normalized = setInternalClipboard(entries, 'copy');
    if (!normalized.length) return false;
    statusBar.set(`Copied ${internalClipboardLabel(normalized)}`);
    return true;
}

/** Store vault items for a conventional deferred move on Paste. */
export function cutInternalPaths(entries) {
    const normalized = setInternalClipboard(entries, 'cut');
    if (!normalized.length) return false;
    statusBar.set(`Cut ${internalClipboardLabel(normalized)}`);
    return true;
}

/** Store one vault item for non-destructive internal copy/paste. */
export function copyInternalPath(path, type) {
    return copyInternalPaths([{ path, type }]);
}

/** Store one vault item for a conventional deferred move on Paste. */
export function cutInternalPath(path, type) {
    return cutInternalPaths([{ path, type }]);
}

/** Resolve where Paste writes for a file-tree context target. */
export function internalPasteTargetDirectory(path, type) {
    return transferTargetDirectory(path, type);
}

/** A folder copy cannot target that folder or any directory beneath it. */
export function isInvalidCopyDestination(sourcePath, targetDirectory) {
    const source = String(sourcePath || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    const target = String(targetDirectory || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    return Boolean(source) && (target === source || target.startsWith(source + '/'));
}

async function showRecursiveCopyRefusal() {
    await messageDialog(
        'Operation refused',
        'A folder cannot be copied into itself or one of its descendants because that would cause a recursive copy. Select its parent folder to create a sibling copy instead.',
        { tone: 'warning', icon: 'warning' }
    );
}

/** Paste the in-app clipboard into the selected folder (or a file's parent). */
export async function pasteInternalClipboard(targetPath = '', targetType = 'root') {
    if (!internalClipboard || internalCopyInProgress || internalPasteInProgress) return false;
    const operation = internalClipboard.operation;
    const entries = internalClipboardEntries();
    if (!entries.length) {
        clearFileTreeClipboard();
        return false;
    }
    const targetDirectory = internalPasteTargetDirectory(targetPath, targetType);
    const plan = planFileTreeTransfer(entries, targetDirectory, operation);
    if (!plan.valid) {
        if (plan.reason === 'recursive-copy') {
            await showRecursiveCopyRefusal();
        } else if (plan.reason === 'recursive-move') {
            await messageDialog('Move not available', 'An item cannot be moved into itself or one of its descendants.', { tone: 'warning' });
        }
        return false;
    }
    if (operation === 'cut') {
        const pending = plan.pending;
        if (!pending.length) {
            clearFileTreeClipboard();
            const message = entries.length === 1
                ? `“${entries[0].path.split('/').pop()}” is already in that folder`
                : `${entries.length} items are already in that folder`;
            statusBar.set(message);
            statusBar.clearAfter(2500, message);
            return true;
        }
        if (targetDirectory) {
            const expandedDirs = new Set(getState('expandedDirs'));
            expandedDirs.add(targetDirectory);
            setState('expandedDirs', expandedDirs);
            saveSession();
        }

        internalPasteInProgress = true;
        try {
            for (let index = 0; index < pending.length; index += 1) {
                const moved = await moveInternalPath(pending[index].path, targetDirectory);
                if (!moved) {
                    // Keep only the entries that still exist at their source
                    // paths so a retry cannot repeat an already completed move.
                    setInternalClipboard(pending.slice(index), 'cut');
                    return false;
                }
                setInternalClipboard(pending.slice(index + 1), 'cut');
            }
            const message = pending.length === 1
                ? `Moved “${pending[0].path.split('/').pop()}”`
                : `Moved ${pending.length} items`;
            statusBar.set(message);
            statusBar.clearAfter(2500, message);
            return true;
        } finally {
            internalPasteInProgress = false;
        }
    }
    if (operation !== 'copy') return false;

    internalCopyInProgress = true;
    internalPasteInProgress = true;
    let finishActivity = beginFileTreeActivity();
    let remainingEntries = entries;
    const stopActivity = () => {
        finishActivity?.();
        finishActivity = null;
    };
    try {
        const transfer = await fileTreeTransfer.copy(entries, targetDirectory);
        remainingEntries = transfer.remaining || entries;
        if (!transfer.success) {
            setInternalClipboard(remainingEntries, 'copy');
            stopActivity();
            if (String(transfer.error || '').toLowerCase().includes('recursive copy')) {
                await showRecursiveCopyRefusal();
            } else {
                await errorDialog(
                    'Couldn’t copy item',
                    transfer.error,
                    transfer.stage === 'prepare'
                        ? 'The source could not be saved before copying.'
                        : 'The item could not be copied.',
                );
            }
            statusBar.set('Copy failed');
            return false;
        }
        const copiedPaths = transfer.copiedPaths || [];
        if (copiedPaths.length) setState('selectedTreePath', copiedPaths[copiedPaths.length - 1]);
        if (targetDirectory) {
            const expandedDirs = new Set(getState('expandedDirs'));
            expandedDirs.add(targetDirectory);
            setState('expandedDirs', expandedDirs);
            saveSession();
        }
        const message = entries.length === 1
            ? `Created “${String(copiedPaths[0] || entries[0].path).replaceAll('\\', '/').split('/').pop()}”`
            : `Created ${entries.length} items`;
        statusBar.set(message);
        statusBar.clearAfter(2500, message);
        return true;
    } catch (error) {
        log.error('Internal copy failed:', error);
        setInternalClipboard(remainingEntries, 'copy');
        stopActivity();
        await errorDialog('Couldn’t copy item', error, 'The item could not be copied.');
        statusBar.set('Copy failed');
        return false;
    } finally {
        stopActivity();
        internalCopyInProgress = false;
        internalPasteInProgress = false;
    }
}

function handleFileTreeKeydown(event) {
    if (isContextMenuInvocationKey(event)) {
        event.preventDefault();
        const selectedPath = getState('selectedTreePath');
        if (selectedPath && !mountedTreeNodeForPath(event.currentTarget, selectedPath)) {
            focusTreePath(event.currentTarget, selectedPath);
        }
        const target = mountedTreeNodeForPath(event.currentTarget, selectedPath)
            || event.target.closest?.('.file-tree-node[role="treeitem"]')
            || event.currentTarget;
        const rect = target?.getBoundingClientRect?.();
        target?.dispatchEvent?.(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect ? rect.left + Math.min(24, rect.width / 2) : 16,
            clientY: rect ? rect.bottom : 16,
        }));
        return;
    }

    if (event.key === 'Escape' && internalClipboard?.operation === 'cut') {
        event.preventDefault();
        event.stopPropagation();
        clearFileTreeClipboard();
        const message = 'Cut cancelled';
        statusBar.set(message);
        statusBar.clearAfter(2500, message);
        return;
    }

    if (event.key === 'F2' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const currentNode = event.target.closest?.('.file-tree-node[role="treeitem"]');
        const currentPath = treeNodePath(currentNode) || getState('selectedTreePath');
        const item = currentPath ? findTreeItem(visibleFileTreeData(), currentPath) : null;
        const isGroup = (getState('selectedTreePaths') || []).length > 1;
        if (item && !isGroup && !item.externalFileId && (item.type === 'file' || item.type === 'directory')) {
            event.preventDefault();
            event.stopPropagation();
            renameTreePath(item.path, item.type).catch(error => log.error('Keyboard rename failed:', error));
        }
        return;
    }

    if (event.key === 'Delete' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const currentNode = event.target.closest?.('.file-tree-node[role="treeitem"]');
        const currentPath = treeNodePath(currentNode) || getState('selectedTreePath');
        const item = currentPath ? findTreeItem(visibleFileTreeData(), currentPath) : null;
        const isGroup = (getState('selectedTreePaths') || []).length > 1;
        if (item && !isGroup && !item.externalFileId && (item.type === 'file' || item.type === 'directory')) {
            event.preventDefault();
            event.stopPropagation();
            deletePath(item.path, item.type).catch(error => log.error('Keyboard delete failed:', error));
        }
        return;
    }

    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        const rows = fileTreeRenderStates.get(event.currentTarget)?.rows || visibleFileTreeRows(
            visibleFileTreeData(),
            getState('expandedDirs'),
            fileTreeStyles.entries,
        );
        const currentNode = event.target.closest?.('.file-tree-node[role="treeitem"]');
        const currentPath = treeNodePath(currentNode) || getState('selectedTreePath');
        const plan = fileTreeKeyboardPlan(event.key, rows, currentPath);
        if (plan) {
            event.preventDefault();
            event.stopPropagation();
            if (plan.action === 'focus') {
                focusTreePath(event.currentTarget, plan.path);
            } else if (plan.action === 'toggle-selection') {
                const item = findTreeItem(visibleFileTreeData(), plan.path);
                if (item && !item.externalFileId) {
                    setState('selectedTreePath', plan.path);
                    setState('selectedTreePaths', toggleSelectedPath(
                        getState('selectedTreePaths'),
                        plan.path,
                    ));
                    syncMountedFileTreeSelection(event.currentTarget);
                    saveSession();
                }
            } else if (plan.action === 'expand' || plan.action === 'collapse') {
                const expanded = getState('expandedDirs') instanceof Set
                    ? getState('expandedDirs')
                    : new Set(getState('expandedDirs') || []);
                const shouldExpand = plan.action === 'expand';
                if (expanded.has(plan.path) !== shouldExpand) toggleDirectory(plan.path);
                renderFileTree();
            } else if (plan.action === 'activate') {
                if (focusTreePath(event.currentTarget, plan.path)) {
                    mountedTreeNodeForPath(event.currentTarget, plan.path)?.click();
                }
            }
            return;
        }
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    const treeData = visibleFileTreeData();
    const selectedPath = getState('selectedTreePath');
    const selectedItem = selectedPath ? findTreeItem(treeData, selectedPath) : null;
    const selectedEntries = selectedItem && !selectedItem.externalFileId
        ? fileTreeActionEntries(selectedItem.path, selectedItem.type)
        : [];
    if (key === 'x' && selectedEntries.length) {
        event.preventDefault();
        cutInternalPaths(selectedEntries);
    } else if (key === 'c' && selectedEntries.length) {
        event.preventDefault();
        copyInternalPaths(selectedEntries);
    } else if (key === 'v' && internalClipboard && (!selectedItem || !selectedItem.externalFileId)) {
        event.preventDefault();
        pasteInternalClipboard(selectedItem?.path || '', selectedItem?.type || 'root').catch(() => {});
    }
}

/**
 * Drag and drop handlers
 */
function handleDragStart(e) {
    if (internalMoveInProgress) {
        e.preventDefault();
        return;
    }
    const node = e.target.closest('.file-tree-node');
    if (!node) return;
    
    const item = node.closest('.file-tree-item');
    if (!item) return;
    if (item.dataset.externalFileId) {
        e.preventDefault();
        return;
    }
    setState('selectedTreePath', item.dataset.path);
    setState('selectedTreePaths', [item.dataset.path]);
    syncMountedFileTreeSelection(e.currentTarget);
    
    dragSourceNode = item;
    item.classList.add('dragging');
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.path);
}

function handleDragEnd(_e) {
    if (dragSourceNode) {
        dragSourceNode.classList.remove('dragging');
        dragSourceNode = null;
    }
    
    // Remove drag-over from all items
    document.querySelectorAll('.file-tree-item.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
}

/**
 * A directory cannot be moved into itself or one of its descendants. Keep
 * this pure so the backend and UI can enforce the same invariant.
 */
export function isInvalidMoveDestination(sourcePath, targetDir) {
    const source = String(sourcePath || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    const target = String(targetDir || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    return Boolean(source) && (target === source || target.startsWith(source + '/'));
}

function handleDragOver(e) {
    e.preventDefault();
    const externalFiles = Array.from(e.dataTransfer?.types || []).includes('Files') && !dragSourceNode;
    e.dataTransfer.dropEffect = externalFiles ? 'copy' : 'move';
    
    const node = e.target.closest('.file-tree-node');
    if (!node) return;
    
    const item = node.closest('.file-tree-item');
    if (!item || item === dragSourceNode) return;
    
    // Only allow dropping on directories
    if (item.dataset.type === 'directory') {
        item.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const node = e.target.closest('.file-tree-node');
    if (!node) return;
    
    const item = node.closest('.file-tree-item');
    if (item) {
        item.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    // Wails resolves native absolute paths at the window level. Do not feed an
    // Explorer/Nautilus/Finder drop through the internal vault move handler.
    if (!dragSourceNode || Array.from(e.dataTransfer?.types || []).includes('Files')) {
        document.querySelectorAll('.file-tree-item.drag-over').forEach(el => el.classList.remove('drag-over'));
        return;
    }
    
    const node = e.target.closest('.file-tree-node');
    if (!node) return;
    
    const targetItem = node.closest('.file-tree-item');
    if (!targetItem || targetItem === dragSourceNode) return;
    
    targetItem.classList.remove('drag-over');
    
    const sourcePath = dragSourceNode.dataset.path;
    const targetPath = targetItem.dataset.path;
    const targetType = targetItem.dataset.type;
    
    // Determine target directory
    const targetDir = targetType === 'directory' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
    
    // Prevent dropping into self or children
    if (isInvalidMoveDestination(sourcePath, targetDir)) {
        await messageDialog('Move not available', 'An item cannot be moved into itself or one of its descendants.', { tone: 'warning' });
        return;
    }
    
    await moveInternalPath(sourcePath, targetDir);
}

/** Move one tree item, offering a non-destructive directory merge on conflict. */
export async function moveInternalPath(sourcePath, targetDir) {
    if (internalMoveInProgress) return false;
    internalMoveInProgress = true;
    let finishActivity = beginFileTreeActivity();
    const itemName = String(sourcePath || '').replaceAll('\\', '/').split('/').pop() || 'item';
    statusBar.set(`Moving “${itemName}”…`);
    try {
        const saveState = await prepareTabsForPathMove(sourcePath);
        if (!saveState.success) {
            finishActivity();
            statusBar.set('Move not completed');
            await errorDialog('Couldn’t move item', saveState.error, 'Save open files before moving them.');
            return false;
        }
        statusBar.set(`Moving “${itemName}”…`);
        let result = await backend().MovePath(sourcePath, targetDir);
        let merged = false;
        if (!result?.success && result?.merge_available) {
            finishActivity();
            finishActivity = null;
            const directoryName = String(sourcePath || '').replaceAll('\\', '/').split('/').pop();
            const confirmed = await confirmDialog(
                'Destination directory already exists',
                `A directory named “${directoryName}” already exists in the destination. Merge the moved directory into it instead? Existing files will be kept; filename collisions will be added as “name (copy).ext”, “name (copy 2).ext”, and so on.`,
                false,
                false,
                { confirmLabel: 'Merge contents', tone: 'warning', icon: 'merge' }
            );
            if (!confirmed) {
                const message = 'Move cancelled';
                statusBar.set(message);
                statusBar.clearAfter(1800, message);
                return false;
            }
            statusBar.set(`Merging “${directoryName}”…`);
            finishActivity = beginFileTreeActivity();
            result = await backend().MergeDirectory(sourcePath, targetDir);
            merged = true;
        }
        if (!result?.success) {
            finishActivity?.();
            statusBar.set('Move failed');
            await errorDialog('Couldn’t move item', result?.error, 'The item could not be moved.');
            return false;
        }

        // Collision-specific paths must be remapped before the general folder
        // prefix so dirty/open tabs follow their parenthesized copy names.
        for (const [movedFrom, movedTo] of Object.entries(result.moved_paths || {})) {
            remapTreeSelection(movedFrom, movedTo);
        }
        const movedFrom = result.old_path || sourcePath;
        const movedTo = result.path || sourcePath;
        remapTreeSelection(movedFrom, movedTo);
        await refreshFileTree();
        for (const [pathFrom, pathTo] of Object.entries(result.moved_paths || {})) {
            updateTabsForMovedPath(pathFrom, pathTo);
        }
        updateTabsForMovedPath(movedFrom, movedTo);
        await refreshTabsForUpdatedLinks(result.updated_links);
        const linkCount = Array.isArray(result.updated_links) ? result.updated_links.length : 0;
        if (linkCount) {
            const message = `Updated links in ${linkCount} ${linkCount === 1 ? 'note' : 'notes'}`;
            statusBar.set(message);
            statusBar.clearAfter(2500, message);
        } else if (merged) {
            const message = `Merged “${String(movedTo).replaceAll('\\', '/').split('/').pop()}”`;
            statusBar.set(message);
            statusBar.clearAfter(2500, message);
        } else {
            const message = `Moved “${String(movedTo).replaceAll('\\', '/').split('/').pop()}”`;
            statusBar.set(message);
            statusBar.clearAfter(2500, message);
        }
        return true;
    } catch (err) {
        log.error('Move failed:', err);
        finishActivity?.();
        statusBar.set('Move failed');
        await errorDialog('Couldn’t move item', err, 'The item could not be moved.');
        return false;
    } finally {
        finishActivity?.();
        internalMoveInProgress = false;
    }
}

/** Resolve the vault folder represented by an external drop target. */
export function externalDropTargetDirectory(element) {
    const tree = element?.closest?.('#file-tree');
    if (!tree) return null;
    const item = element.closest('.file-tree-item');
    if (!item) return '';
    if (item.dataset.externalFileId) return '';
    const path = String(item.dataset.path || '');
    if (item.dataset.type === 'directory') return path;
    const separator = path.lastIndexOf('/');
    return separator >= 0 ? path.slice(0, separator) : '';
}

/** Open each imported top-level file after the refreshed tree can identify it. */
export function openImportedExternalFileTabs(paths, fileTreeData, open = openTab) {
    if (!Array.isArray(paths) || typeof open !== 'function') return false;
    let opened = false;
    for (const path of paths) {
        const item = findTreeItem(fileTreeData || [], path);
        if (!item || item.type !== 'file') continue;
        open(item.path, item.name || String(item.path).split('/').pop(), 'file', {
            path: item.path,
            mtime: item.mtime,
        });
        opened = true;
    }
    return opened;
}

/** Copy absolute native paths into the folder under the drop coordinates. */
function insertDroppedPathsIntoEditor(paths, coordinates) {
    const view = getEditorView();
    if (!view || view.isDestroyed) return false;
    const position = coordinates ? view.posAtCoords?.(coordinates) : null;
    if (Number.isInteger(position)) view.dispatch({ selection: { anchor: position } });
    return insertTextAtCursor(view, paths.map(path => String(path)).join('\n'));
}

export async function copyExternalDrop(paths, targetDirectory, {
    confirmImport = false,
    confirmTreeImport = false,
    coordinates = null,
} = {}) {
    if (externalCopyInProgress || !Array.isArray(paths) || paths.length === 0 || targetDirectory === null) return false;
    externalCopyInProgress = true;
    let finishActivity = null;
    try {
        if (confirmTreeImport) {
            const confirmed = await confirmExternalTreeImport(paths, targetDirectory, {
                confirm: confirmDialog,
            });
            if (!confirmed) {
                statusBar.set('Import cancelled');
                setTimeout(() => statusBar.set('Ready'), 1800);
                return false;
            }
        }
        let result;
        let openImportedFiles = false;
        if (confirmImport) {
            const dropped = await importDroppedExternalPaths(paths, targetDirectory);
            if (dropped.action === 'cancel') {
                statusBar.set('Drop cancelled');
                setTimeout(() => statusBar.set('Ready'), 1800);
                return false;
            }
            if (dropped.action === 'path') {
                const inserted = insertDroppedPathsIntoEditor(dropped.paths, coordinates);
                statusBar.set(inserted ? 'Inserted dropped path' : 'Could not insert dropped path');
                setTimeout(() => statusBar.set('Ready'), 1800);
                return inserted;
            }
            result = dropped.result;
            openImportedFiles = dropped.action === 'import';
        } else {
            statusBar.set(`Copying ${paths.length} dropped ${paths.length === 1 ? 'item' : 'items'}…`);
            finishActivity = beginFileTreeActivity();
            result = await backend().CopyExternalPaths(paths, targetDirectory, false);
        }
        const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
        if (!result?.success && conflicts.length > 0) {
            finishActivity?.();
            finishActivity = null;
            const directoryConflicts = Array.isArray(result?.directory_conflicts) ? result.directory_conflicts : [];
            const names = conflicts.map(path => String(path).replaceAll('\\', '/').split('/').pop()).filter(Boolean);
            const visibleNames = names.slice(0, 6).map(name => `“${name}”`).join(', ');
            const remaining = names.length > 6 ? ` and ${names.length - 6} more` : '';
            if (directoryConflicts.length > 0) {
                const confirmed = await confirmDialog(
                    directoryConflicts.length === 1 ? 'Destination directory already exists' : 'Destination directories already exist',
                    `${directoryConflicts.length === 1 ? 'A dropped directory already exists' : `${directoryConflicts.length} dropped directories already exist`} in the destination: ${visibleNames}${remaining}. Merge the directory contents instead? Existing files will be kept; filename collisions will be added as “name (copy).ext”, “name (copy 2).ext”, and so on.`,
                    false,
                    false,
                    { confirmLabel: 'Merge contents', tone: 'warning', icon: 'merge' }
                );
                if (!confirmed) {
                    statusBar.set('Copy cancelled');
                    setTimeout(() => statusBar.set('Ready'), 1800);
                    return false;
                }
                statusBar.set(`Merging ${directoryConflicts.length} dropped ${directoryConflicts.length === 1 ? 'directory' : 'directories'}…`);
                finishActivity = beginFileTreeActivity();
                result = await backend().MergeExternalPaths(paths, targetDirectory);
            } else {
                const noun = conflicts.length === 1 ? 'item already exists' : 'items already exist';
                const confirmed = await confirmDialog(
                    conflicts.length === 1 ? 'Replace existing item?' : 'Replace existing items?',
                    `${conflicts.length} ${noun} in the destination: ${visibleNames}${remaining}. Replace ${conflicts.length === 1 ? 'it' : 'them'} with the dropped ${conflicts.length === 1 ? 'item' : 'items'}?`,
                    true,
                    false,
                    { confirmLabel: conflicts.length === 1 ? 'Replace' : 'Replace all' }
                );
                if (!confirmed) {
                    statusBar.set('Copy cancelled');
                    setTimeout(() => statusBar.set('Ready'), 1800);
                    return false;
                }
                statusBar.set(`Replacing ${conflicts.length} existing ${conflicts.length === 1 ? 'item' : 'items'}…`);
                finishActivity = beginFileTreeActivity();
                result = await backend().CopyExternalPaths(paths, targetDirectory, true);
            }
        }
        if (!result?.success) {
            finishActivity?.();
            await errorDialog('Couldn’t copy dropped items', result?.error, 'The dropped items could not be copied.');
            statusBar.set('Copy failed');
            return false;
        }
        if (targetDirectory) {
            const expandedDirs = new Set(getState('expandedDirs'));
            expandedDirs.add(targetDirectory);
            setState('expandedDirs', expandedDirs);
            saveSession();
        }
        await refreshFileTree();
        if (openImportedFiles) {
            openImportedExternalFileTabs(result.paths, getState('fileTreeData'));
        }
        const copied = Array.isArray(result.paths) ? result.paths.length : paths.length;
        const message = `Copied ${copied} ${copied === 1 ? 'item' : 'items'} into the vault`;
        statusBar.set(message);
        statusBar.clearAfter(2500, message);
        return true;
    } catch (error) {
        log.error('External file copy failed:', error);
        finishActivity?.();
        await errorDialog('Couldn’t copy dropped items', error, 'The dropped items could not be copied.');
        statusBar.set('Copy failed');
        return false;
    } finally {
        finishActivity?.();
        externalCopyInProgress = false;
    }
}

/** Register Wails' cross-platform native path drop callback once. */
export function initNativeFileDrops(runtime = window.runtime) {
    if (nativeFileDropInitialized || typeof runtime?.OnFileDrop !== 'function') return false;
    runtime.OnFileDrop((x, y, paths) => {
        const element = document.elementFromPoint(x, y);
        const targetDirectory = externalDropTargetDirectory(element);
        if (targetDirectory !== null) {
            return copyExternalDrop(paths, targetDirectory, { confirmTreeImport: true }).catch(() => false);
        }
        if (element?.closest?.('#editor-container')) {
            return copyExternalDrop(paths, '', { confirmImport: true, coordinates: { x, y } }).catch(() => false);
        }
    // Handle every native file drop ourselves. Passing true would make Wails
    // invoke the callback only for CSS --wails-drop-target elements, which
    // excludes CodeMirror and leaves Linux/WebKit to insert the file path.
    }, false);
    nativeFileDropInitialized = true;
    return true;
}

/**
 * Context menu handling
 */
function initContextMenu() {
    // Close context menu on click anywhere outside it
    document.addEventListener('click', (e) => {
        if (contextMenu && !contextMenu.contains(e.target)) {
            dismissContextMenu(contextMenu, { restoreFocus: false });
        }
    });
}

function handleContextMenu(e) {
    e.preventDefault();

    const node = e.target.closest('.file-tree-node');
    const item = node?.closest('.file-tree-item');
    // The event is delegated from #file-tree, so a right-click on its empty
    // space is a vault-root action rather than a no-op.
    const path = item?.dataset.path || '';
    const type = item?.dataset.type || 'root';
    const externalFileId = item?.dataset.externalFileId || '';
    let returnFocus = node || e.currentTarget;
    if (node) focusTreeNode(node, { scroll: false });

    // Keep a right-click inside an existing selection grouped. Right-clicking
    // any other internal row makes that row the sole operation target, which
    // matches the normal pointer-selection contract.
    const currentSelection = getState('selectedTreePaths') || [];
    const preservesSelection = !externalFileId && currentSelection.includes(path);
    if (type === 'file' || type === 'directory') {
        if (!preservesSelection) {
            setState('selectedTreePath', path);
            setState('selectedTreePaths', externalFileId ? [] : [path]);
            saveSession();
            syncMountedFileTreeSelection(e.currentTarget);
            returnFocus = mountedTreeNodeForPath(e.currentTarget, path) || e.currentTarget;
        }
    } else if (type === 'root') {
        setState('selectedTreePaths', []);
        saveSession();
        renderFileTree();
    }

    setState('contextTargetType', type);
    setState('contextTargetPath', path);
    setState('contextTargetExternalFileId', externalFileId);

    if (contextMenu) dismissContextMenu(contextMenu, { restoreFocus: false });

    contextMenu = document.createElement('div');
    contextMenu.className = 'ui-menu context-menu';
    contextMenu.innerHTML = buildFileTreeContextMenuHTML({
        type,
        path,
        selectedPaths: getState('selectedTreePaths') || [],
        clipboardPath: internalClipboard?.path || '',
        external: Boolean(externalFileId),
        pinned: item?.querySelector('.file-tree-node')?.classList.contains('pinned') || false,
    });
    document.body.appendChild(contextMenu);
    positionContextMenu(contextMenu, e.clientX, e.clientY);

    const contextName = item?.querySelector('.node-name')?.textContent?.trim() || 'vault root';
    configureContextMenu(contextMenu, {
        label: `File actions for ${contextName}`,
        returnFocus: () => {
            if (path && focusTreePath(e.currentTarget, path)) return;
            if (returnFocus?.isConnected) returnFocus.focus?.({ preventScroll: true });
            else e.currentTarget.focus?.({ preventScroll: true });
        },
        onDismiss: () => { contextMenu = null; },
    });

    contextMenu.addEventListener('click', async (event) => {
        event.stopPropagation();
        const menuItem = event.target.closest('.context-menu-item');
        if (!menuItem || menuItem.classList.contains('disabled') || menuItem.getAttribute('aria-disabled') === 'true') {
            return;
        }

        const action = menuItem.dataset.action;
        dismissContextMenu(contextMenu, { restoreFocus: true });

        switch (action) {
        case 'open-new-tab':
            if (getState('contextTargetType') === 'file') {
                const targetPath = getState('contextTargetPath');
                const targetExternalFileId = getState('contextTargetExternalFileId');
                if (targetExternalFileId) {
                    const external = (getState('externalFileTreeEntries') || [])
                        .find(entry => entry.externalFileId === targetExternalFileId);
                    if (external) {
                        openTab(`external:${targetExternalFileId}`, external.name, 'file', {
                            path: external.path,
                            mtime: external.mtime,
                            externalFileId: targetExternalFileId,
                        }, true);
                    }
                } else if (isDrawioDiagramPath(targetPath) || isEditableCodeMirrorFile(targetPath)) {
                    openTab(targetPath, targetPath.split('/').pop(), isDrawioDiagramPath(targetPath) ? 'drawio' : 'file', { path: targetPath }, true);
                } else {
                    await openManagedFileWithDefaultApplication(targetPath);
                }
            }
            break;

        case 'copy':
            copyInternalPaths(fileTreeActionEntries(
                getState('contextTargetPath'),
                getState('contextTargetType'),
            ));
            break;

        case 'cut':
            cutInternalPaths(fileTreeActionEntries(
                getState('contextTargetPath'),
                getState('contextTargetType'),
            ));
            break;

        case 'paste':
            await pasteInternalClipboard(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'new-file':
            await createNewFileIn(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'new-folder':
            await createNewFolderIn(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'new-drawio':
            await createNewDrawioDiagramIn(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'rename':
            await renameTreePath(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'customize-style':
            await customizeTreePath(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'toggle-pin':
            await toggleTreePin(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'delete':
            if (getState('contextTargetExternalFileId')) {
                await removeExternalFileTreeEntry(getState('contextTargetExternalFileId'));
            } else {
                await deletePath(getState('contextTargetPath'), getState('contextTargetType'));
            }
            break;

        case 'reveal':
            backend().RevealInExplorer(getState('contextTargetPath'));
            break;

        case 'merge-notes':
            await mergeSelectedNotes();
            break;

        default:
            break;
        }
    });
}

async function openManagedFileWithDefaultApplication(path) {
    const name = String(path || '').split('/').pop() || 'file';
    try {
        const result = await backend().OpenWithDefaultApplication(path);
        if (!result?.success) {
            await errorDialog(
                'Couldn’t open file',
                result?.error || 'The operating system did not accept the file.',
                'The file was not changed.',
            );
            return false;
        }
        statusBar.set(`Opened “${name}” with the default application`);
        setTimeout(() => statusBar.set('Ready'), 1800);
        return true;
    } catch (error) {
        await errorDialog(
            'Couldn’t open file',
            error,
            'The file was not changed.',
        );
        return false;
    }
}

export async function customizeTreePath(path, type) {
    if (!path || (type !== 'file' && type !== 'directory')) return false;
    const item = findTreeItem(getState('fileTreeData') || [], path);
    if (!item) return false;

    const choice = await fileTreeStyleDialog({
        name: item.name,
        type,
        current: fileTreeStyles.entries[path] || {},
        recentIcons: fileTreeStyles.recent_icons,
    });
    if (!choice) return false;
    try {
        const styles = await backend().SetFileTreeStyle(path, choice.icon || '', choice.color || '');
        fileTreeStyles = normalizeFileTreeStyles(styles);
        renderFileTree();
        document.dispatchEvent(new CustomEvent('file-tree-appearance-changed', {
            detail: { path },
        }));
        statusBar.set(choice.icon || choice.color ? `Styled “${item.name}”` : `Reset appearance for “${item.name}”`);
        setTimeout(() => statusBar.set('Ready'), 1600);
        return true;
    } catch (error) {
        await errorDialog('Couldn’t style entry', error, 'The file-tree appearance could not be saved.');
        return false;
    }
}

export async function toggleTreePin(path, type) {
    if (!path || (type !== 'file' && type !== 'directory')) return false;
    const item = findTreeItem(getState('fileTreeData') || [], path);
    if (!item) return false;
    const pinned = !isFileTreeEntryPinned(item, fileTreeStyles.entries);
    try {
        const styles = await backend().SetFileTreePinned(path, pinned);
        fileTreeStyles = normalizeFileTreeStyles(styles);
        renderFileTree();
        statusBar.set(`${pinned ? 'Pinned' : 'Unpinned'} “${item.name}”`);
        setTimeout(() => statusBar.set('Ready'), 1600);
        return true;
    } catch (error) {
        await errorDialog('Couldn’t update pin', error, 'The file-tree pin could not be saved.');
        return false;
    }
}


async function mergeSelectedNotes() {
    const sel = getState('selectedTreePaths') || [];
    const ctx = getState('contextTargetPath');
    const openPath = getState('selectedFilePath');
    // Build the ordered merge set from the open file and operation selection.
    const all = [openPath, ...sel]
        .filter(path => String(path || '').toLowerCase().endsWith('.md'));
    const paths = [...new Set(ctx && !all.includes(ctx) && String(ctx).toLowerCase().endsWith('.md')
        ? [ctx, ...all]
        : all)];
    if (paths.length < 2) return;

    const checkedIndices = await mergeNotesDialog(paths[0], paths.slice(1));

    if (!checkedIndices || checkedIndices.length === 0) return;

    // Build merge paths: master + checked sources
    const mergePaths = [paths[0], ...checkedIndices.map(i => paths[i + 1])];
    if (mergePaths.length < 2) return;

    // Animate: mark source nodes as merging
    for (const p of mergePaths.slice(1)) {
        const escaped = CSS.escape(p);
        const el = document.querySelector(`.file-tree-item[data-path="${escaped}"]`);
        if (el) el.classList.add('merging');
    }

    try {
        const result = await backend().MergeNotes(mergePaths);
        if (result.success) {
            setState('selectedTreePaths', []);
            for (const p of mergePaths.slice(1)) {
                closeTabsForDeletedPath(p);
            }
            setTimeout(async () => {
                await refreshFileTree();
                setState('selectedFilePath', mergePaths[0]);
                setState('selectedTreePath', mergePaths[0]);
            }, 300);
        } else {
            document.querySelectorAll('.file-tree-item.merging').forEach(el => el.classList.remove('merging'));
            await errorDialog('Couldn’t merge notes', result.error, 'The selected notes could not be merged.');
        }
    } catch (err) {
        document.querySelectorAll('.file-tree-item.merging').forEach(el => el.classList.remove('merging'));
        await errorDialog('Couldn’t merge notes', err, 'The selected notes could not be merged.');
    }
}

async function createNewFileIn(targetPath, targetType) {
    let parentDir = '';
    
    if (targetType === 'directory') {
        parentDir = targetPath;
    } else if (targetType === 'file') {
        parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    }
    
    const fileName = await newNoteDialog(parentDir);
    if (!fileName) return;

    const nameReview = await reviewSameDirectoryNoteName({
        tree: getState('fileTreeData'),
        parentDirectory: parentDir,
        proposedName: fileName,
        operation: 'create',
        confirm: confirmDialog,
        open: handleFileOpen,
    });
    if (nameReview !== 'proceed') return;
    
    try {
        const result = await backend().CreateFile(
            parentDir ? `${parentDir}/${fileName}` : fileName,
            /\.md$/i.test(fileName) ? `# ${fileName.slice(0, -3)}\n\n` : ''
        );
        
        if (result.success) {
            await refreshFileTree();
            await handleFileOpen(result.path);
        } else {
            await errorDialog('Couldn’t create file', result.error, 'The file could not be created.');
        }
    } catch (err) {
        log.error('Create file failed:', err);
        await errorDialog('Couldn’t create file', err, 'The file could not be created.');
    }
}

async function createNewDrawioDiagramIn(targetPath, targetType) {
    let parentDir = '';
    if (targetType === 'directory') {
        parentDir = targetPath;
    } else if (targetType === 'file') {
        parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    }

    const name = await promptDialog('New Draw.io diagram', 'Create an editable diagram in this folder.', 'Untitled.drawio.svg', {
        icon: 'file-add',
        label: 'Diagram name',
        confirmLabel: 'Create diagram',
        context: parentDir ? parentDir + '/' : 'Vault root',
        help: 'The .drawio.svg extension is added automatically when needed.',
        validate: validateTreeItemName,
    });
    if (!name?.trim()) return;

    let fileName = name.trim();
    if (!isDrawioDiagramPath(fileName)) {
        fileName = fileName.replace(/\.svg$/i, '').replace(/\.drawio$/i, '') + '.drawio.svg';
    }

    try {
        const result = await backend().CreateFile(
            parentDir ? `${parentDir}/${fileName}` : fileName,
            ''
        );
        if (!result.success) {
            await errorDialog('Couldn’t create diagram', result.error, 'The diagram could not be created.');
            return;
        }

        await refreshFileTree();
        openTab(result.path, fileName, 'drawio', { path: result.path, mtime: result.mtime });
    } catch (err) {
        log.error('Create draw.io diagram failed:', err);
        await errorDialog('Couldn’t create diagram', err, 'The diagram could not be created.');
    }
}

async function createNewFolderIn(targetPath, targetType) {
    let parentDir = '';
    
    if (targetType === 'directory') {
        parentDir = targetPath;
    } else if (targetType === 'file') {
        parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    }
    
    const name = await promptDialog('New folder', 'Create a folder for organizing files and notes.', 'New Folder', {
        icon: 'folder',
        label: 'Folder name',
        confirmLabel: 'Create folder',
        context: parentDir ? parentDir + '/' : 'Vault root',
        validate: validateTreeItemName,
    });
    if (!name) return;
    
    try {
        const result = await backend().CreateDirectory(
            parentDir ? `${parentDir}/${name}` : name
        );
        
        if (result.success) {
            await refreshFileTree();
        } else {
            await errorDialog('Couldn’t create folder', result.error, 'The folder could not be created.');
        }
    } catch (err) {
        log.error('Create folder failed:', err);
        await errorDialog('Couldn’t create folder', err, 'The folder could not be created.');
    }
}

function remapTreePath(path, oldPath, newPath) {
    const current = String(path || '');
    if (current === oldPath) return newPath;
    return current.startsWith(oldPath + '/')
        ? newPath + current.slice(oldPath.length)
        : current;
}

function remapTreeSelection(oldPath, newPath) {
    const selected = getState('selectedFilePath');
    const nextSelected = remapTreePath(selected, oldPath, newPath);
    if (nextSelected !== selected) setState('selectedFilePath', nextSelected);

    const selectedTreePath = getState('selectedTreePath');
    const nextSelectedTreePath = remapTreePath(selectedTreePath, oldPath, newPath);
    if (nextSelectedTreePath !== selectedTreePath) setState('selectedTreePath', nextSelectedTreePath);

    const selectedPaths = getState('selectedTreePaths') || [];
    const nextSelectedPaths = [...new Set(selectedPaths.map(path => remapTreePath(path, oldPath, newPath)))];
    if (nextSelectedPaths.some((path, index) => path !== selectedPaths[index]) || nextSelectedPaths.length !== selectedPaths.length) {
        setState('selectedTreePaths', nextSelectedPaths);
    }

    if (internalClipboard) {
        const remappedClipboard = internalClipboardEntries()
            .map(entry => ({ ...entry, path: remapTreePath(entry.path, oldPath, newPath) }));
        setInternalClipboard(remappedClipboard, internalClipboard.operation);
    }
}

async function renameTreePath(path, type) {
    if (!path || (type !== 'file' && type !== 'directory')) return;

    const oldName = path.split('/').pop() || path;
    const kind = type === 'directory' ? 'folder' : 'file';
    const proposedName = await renamePathDialog(path, type);
    const nextName = String(proposedName || '').trim();
    if (!nextName || nextName === oldName) return;

    const separator = path.lastIndexOf('/');
    const newPath = separator >= 0 ? `${path.slice(0, separator + 1)}${nextName}` : nextName;
    if (type === 'file') {
        const nameReview = await reviewSameDirectoryNoteName({
            tree: getState('fileTreeData'),
            parentDirectory: separator >= 0 ? path.slice(0, separator) : '',
            proposedName: nextName,
            currentPath: path,
            operation: 'rename',
            confirm: confirmDialog,
            open: handleFileOpen,
        });
        if (nameReview !== 'proceed') return;
    }
    statusBar.set(`Renaming “${oldName}”…`);
    const finishActivity = beginFileTreeActivity();
    try {
        const saveState = await prepareTabsForPathMove(path);
        if (!saveState.success) {
            finishActivity();
            await errorDialog(`Couldn’t rename ${kind}`, saveState.error, `Save open files before renaming this ${kind}.`);
            return;
        }
        const result = await backend().RenamePath(path, newPath);
        if (!result.success) {
            finishActivity();
            await errorDialog(`Couldn’t rename ${kind}`, result.error, `The ${kind} could not be renamed.`);
            return;
        }

        const movedFrom = result.old_path || path;
        const movedTo = result.path || newPath;
        remapTreeSelection(movedFrom, movedTo);
        await refreshFileTree();
        updateTabsForMovedPath(movedFrom, movedTo);
        await refreshTabsForUpdatedLinks(result.updated_links);
        const linkCount = Array.isArray(result.updated_links) ? result.updated_links.length : 0;
        if (linkCount) {
            const message = `Updated links in ${linkCount} ${linkCount === 1 ? 'note' : 'notes'}`;
            statusBar.set(message);
            statusBar.clearAfter(2500, message);
        } else {
            const message = `Renamed “${oldName}” to “${nextName}”`;
            statusBar.set(message);
            statusBar.clearAfter(2500, message);
        }
    } catch (err) {
        log.error('Rename failed:', err);
        finishActivity();
        statusBar.set('Rename failed');
        await errorDialog(`Couldn’t rename ${kind}`, err, `The ${kind} could not be renamed.`);
    } finally {
        finishActivity();
    }
}

export async function removeExternalFileTreeEntry(externalFileId, {
    confirm = confirmDialog,
    close = closeTab,
} = {}) {
    const entries = getState('externalFileTreeEntries') || [];
    const external = entries.find(entry => entry.externalFileId === externalFileId);
    if (!external) return false;

    const confirmed = await confirm(
        'Remove external note from the file tree?',
        `“${external.name}” is outside this vault. Removing it here will NOT delete or modify the original file; it only removes this shortcut from Figaro’s file tree.`,
        false,
        false,
        { confirmLabel: 'Remove from file tree', cancelLabel: 'Keep in file tree' }
    );
    if (!confirmed) return false;

    const tabId = `external:${externalFileId}`;
    if ((getState('openTabs') || []).some(tab => tab.id === tabId)) {
        const closed = await close(tabId);
        if (!closed) return false;
    }
    setState('externalFileTreeEntries', entries.filter(entry => entry.externalFileId !== externalFileId));
    if (getState('selectedTreePath') === external.path) setState('selectedTreePath', null);
    if (getState('selectedFilePath') === external.path) setState('selectedFilePath', null);
    renderFileTree();
    statusBar.set(`Removed “${external.name}” from the file tree`);
    setTimeout(() => statusBar.set('Ready'), 1800);
    return true;
}

export async function deletePath(path, type = 'file') {
    const name = path.split('/').pop();
    const confirmed = await confirmDialog(
        'Delete from vault?',
        `This removes “${name}” without moving it to Trash. Figaro will first save open changes and record the current contents in local Git history so they can be recovered.`,
        true,
        false,
        { confirmLabel: 'Delete', cancelLabel: 'Keep' }
    );
    
    if (!confirmed) return;

    statusBar.set(`Deleting “${name}”…`);
    const finishActivity = beginFileTreeActivity();
    try {
        const kind = type === 'directory' ? 'folder' : 'file';
        const saveState = await prepareTabsForPathDelete(path);
        if (!saveState.success) {
            finishActivity();
            await errorDialog(`Couldn’t delete ${kind}`, saveState.error, `Save open files before deleting this ${kind}.`);
            return;
        }
        const result = await backend().DeletePath(path);
        if (result.success) {
            document.dispatchEvent(new CustomEvent('vault-path-deleted', {
                detail: { path, type },
            }));
            await refreshFileTree();
            
            // Close any tabs for deleted files
            closeTabsForDeletedPath(path);
            const selectedTreePath = getState('selectedTreePath');
            if (selectedTreePath === path || selectedTreePath?.startsWith(path + '/')) {
                setState('selectedTreePath', null);
            }
            if (result.deleted_id) {
                const message = `Deleted “${name}” ·`;
                const showUndo = () => {
                    statusBar.setWithAction(message, 'Undo', async () => {
                        const restored = await restoreRecentlyDeletedItem(result.deleted_id, name);
                        if (!restored) showUndo();
                    }, { ariaLabel: `Undo deletion of ${name}` });
                    statusBar.clearAfter(10000, message);
                };
                showUndo();
            } else {
                const message = `Deleted “${name}”`;
                statusBar.set(message);
                statusBar.clearAfter(2500, message);
            }
        } else {
            finishActivity();
            statusBar.set('Delete failed');
            await errorDialog('Couldn’t delete item', result.error, 'The item could not be deleted.');
        }
    } catch (err) {
        log.error('Delete failed:', err);
        finishActivity();
        statusBar.set('Delete failed');
        await errorDialog('Couldn’t delete item', err, 'The item could not be deleted.');
    } finally {
        finishActivity();
    }
}

function validateTreeItemName(value) {
    const name = String(value || '').trim();
    if (!name) return 'Enter a name.';
    if (/[\\/]/.test(name)) return 'Choose a name, not a path.';
    if (/^\.+$/.test(name)) return 'Choose a name other than dots.';
    if (Array.from(name).some(character => character.charCodeAt(0) < 0x20)) return 'The name contains an unsupported control character.';
    return '';
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
