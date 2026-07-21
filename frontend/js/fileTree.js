import { backend } from './backend.js';
/**
 * File Tree Explorer - Handles file tree rendering, interactions, drag-drop, context menu
 */

import { log } from './log.js';
import { setState, getState, subscribe } from './state.js';
import { saveSession } from './session.js';
import { closeTabsForDeletedPath, openTab, prepareTabsForPathCopy, prepareTabsForPathMove, refreshTabsForUpdatedLinks, updateTabsForMovedPath } from './tabManager.js';
import { statusBar } from './statusBar.js';
import { confirmDialog, errorDialog, fileTreeStyleDialog, mergeNotesDialog, messageDialog, newNoteDialog, promptDialog, renamePathDialog } from './dialogs.js';
import { isDrawioDiagramPath } from './drawio.js';
import { isEditableCodeMirrorFile } from './languageSupport.js';
import { renderLucideIcon } from './lucideIcons.js';
import { importDroppedExternalPaths } from './externalFiles.js';
import { getEditorView, insertTextAtCursor } from './editor.js';


let dragSourceNode = null;
let contextMenu = null;

async function handleFileOpen(filePath) {
    const app = await import('./app.js');
    return app.handleFileOpen(filePath);
}
let fileTreeRequestId = 0;
let scheduledTreeRefresh = null;
let nativeFileDropInitialized = false;
let externalCopyInProgress = false;
let internalClipboard = null;
let internalCopyInProgress = false;
let fileTreeStyles = { version: 1, entries: {}, recent_icons: [] };

const contextMenuViewportMargin = 8;

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
    {
        action: 'preview-pdf',
        label: 'Preview PDF',
        icon: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M8 15h8M8 18h6"/>',
    },
    { separator: true },
    {
        action: 'copy',
        label: 'Copy',
        icon: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    },
    {
        action: 'paste',
        label: 'Paste',
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
        icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    },
    {
        action: 'customize-style',
        label: 'Customize appearance…',
        icon: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="8" r="1"/><circle cx="16" cy="14" r="1"/><path d="M12 21a3 3 0 0 1 0-6h1"/>',
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
        danger: true,
        icon: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
    },
];

function fileTreeContextMenuItemHTML({ action, label, icon, danger }, enabled) {
    const classes = ['context-menu-item'];
    if (danger) classes.push('danger');
    if (!enabled) classes.push('disabled');
    return `
        <div class="${classes.join(' ')}" data-action="${action}"${enabled ? '' : ' aria-disabled="true"'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>
            ${label}
        </div>`;
}

/**
 * The file tree always presents the same action inventory. Context determines
 * which entries are enabled, rather than making the menu jump between shapes.
 */
export function buildFileTreeContextMenuHTML({ type = 'root', path = '', selectedPaths = [], openPath = '', clipboardPath = '' } = {}) {
    const normalizedType = type === 'file' || type === 'directory' ? type : 'root';
    const targetPath = String(path || '');
    const isFile = normalizedType === 'file';
    const isTarget = normalizedType !== 'root';
    const isMarkdownFile = isFile && targetPath.toLowerCase().endsWith('.md');
    const isOpenableFile = isFile && (isDrawioDiagramPath(targetPath) || isEditableCodeMirrorFile(targetPath));
    const mergePaths = [...new Set([targetPath, ...(selectedPaths || []), openPath].filter(Boolean))];
    const canMerge = isMarkdownFile && mergePaths.length >= 2;
    const enabled = {
        'open-new-tab': isOpenableFile,
        'merge-notes': canMerge,
        'preview-pdf': isMarkdownFile,
        copy: isTarget,
        paste: Boolean(clipboardPath),
        'new-file': true,
        'new-drawio': true,
        'new-folder': true,
        rename: isTarget,
        'customize-style': isTarget && (!isFile || isOpenableFile),
        reveal: isTarget,
        delete: isTarget,
    };

    return fileTreeContextMenuActions.map(item => item.separator
        ? '<div class="context-menu-separator"></div>'
        : fileTreeContextMenuItemHTML(item, Boolean(enabled[item.action]))
    ).join('');
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

    // Keep file-tab markers in sync without changing folder state. Rebuilding
    // a large tree for a tab switch (or its first dirty transition) is both
    // expensive and needlessly disrupts mounted nodes. Structural changes
    // still go through renderFileTree(); this path only updates the markers
    // that can exist on already-mounted file nodes.
    // expandedDirs belongs to the user: restoring or switching tabs must not
    // reopen ancestors that the user explicitly collapsed.
    subscribe('activeTabId', () => {
        const tabs = getState('openTabs');
        const activeId = getState('activeTabId');
        const activeTab = tabs.find(t => t.id === activeId);
        if (activeTab && (activeTab.type === 'file' || activeTab.type === 'drawio') && activeTab.path) {
            setState('selectedFilePath', activeTab.path);
        }
        syncFileTreeTabMarkers();
    });
    subscribe('openTabs', syncFileTreeTabMarkers);
}

/**
 * Update the active/open file markers on the part of the tree currently
 * mounted in the DOM. Collapsed descendants intentionally have no node to
 * patch; when they are expanded, renderFileTree() derives their correct state
 * from the same store values.
 *
 * This must not mutate tab state or emit events: callers such as markTabDirty
 * rely on the one-time tab transition to notify Git status listeners.
 */
export function syncFileTreeTabMarkers() {
    const container = document.getElementById('file-tree');
    if (!container) return;

    const openFilePaths = new Set((getState('openTabs') || [])
        .filter(tab => (tab.type === 'file' || tab.type === 'drawio') && tab.path)
        .map(tab => tab.path));
    const activeFilePath = getState('selectedFilePath');

    container.querySelectorAll('.file-tree-item[data-type="file"] > .file-tree-node').forEach(node => {
        const path = node.parentElement?.dataset.path;
        if (!path) return;
        const active = path === activeFilePath;
        node.classList.toggle('active-file', active);
        node.classList.toggle('open-file', !active && openFilePaths.has(path));
    });
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
        const { focusEditor } = await import('./editor.js');
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
    const requestId = ++fileTreeRequestId;
    try {
        statusBar.set('Loading file tree...');
        const [treeData, styles] = await Promise.all([
            backend().GetFileTree(),
            backend().GetFileTreeStyles().catch(error => {
                log.warn('Could not refresh file-tree appearance:', error);
                return fileTreeStyles;
            }),
        ]);
        if (requestId !== fileTreeRequestId) return;
        fileTreeStyles = normalizeFileTreeStyles(styles);
        setState('fileTreeData', treeData);
        renderFileTree();
        document.dispatchEvent(new CustomEvent('vault-file-tree-refreshed', { detail: { tree: treeData } }));
        statusBar.set('Ready');
    } catch (err) {
        if (requestId !== fileTreeRequestId) return;
        log.error('Failed to load file tree:', err);
        statusBar.set('Failed to load file tree');
    }
}

function normalizeFileTreeStyles(styles) {
    return {
        version: Number(styles?.version) || 1,
        entries: styles?.entries && typeof styles.entries === 'object' ? styles.entries : {},
        recent_icons: Array.isArray(styles?.recent_icons) ? styles.recent_icons.slice(0, 10) : [],
    };
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
    const container = document.getElementById('file-tree');
    const treeData = getState('fileTreeData');
    const expandedDirs = getState('expandedDirs');
    const selectedPath = getState('selectedTreePath');
    const activeFilePath = getState('selectedFilePath');
    const selectedPaths = getState('selectedFilePaths') || [];
    const openFilePaths = new Set((getState('openTabs') || [])
        .filter(tab => (tab.type === 'file' || tab.type === 'drawio') && tab.path)
        .map(tab => tab.path));
    
    if (!container) return;
    // Structural tree refreshes are intentionally rare, but they should not
    // pull a reader away from the selected entry or steal keyboard ownership.
    const restoreScrollTop = container.scrollTop;
    const restoreFocus = document.activeElement === container;
    
    if (!treeData || treeData.length === 0) {
        container.innerHTML = '<div class="file-tree-empty">No files in vault</div><div class="file-tree-root-dropzone" aria-label="Vault root actions"></div>';
        container.scrollTop = restoreScrollTop;
        if (restoreFocus) container.focus({ preventScroll: true });
        return;
    }
    
    // Keep a real flexing surface after short file lists. Delegated context
    // events then reach #file-tree even when the user clicks below the last
    // file, making an empty/new vault easy to populate.
    container.innerHTML = buildTreeHTML(treeData, expandedDirs, selectedPath, selectedPaths, 0, activeFilePath, fileTreeStyles.entries, openFilePaths) +
        '<div class="file-tree-root-dropzone" aria-label="Vault root actions"></div>';
    container.scrollTop = restoreScrollTop;
    if (restoreFocus) container.focus({ preventScroll: true });
}

/**
 * Build tree HTML recursively
 */
export function buildTreeHTML(items, expandedDirs, selectedPath, selectedPaths = [], depth = 0, activeFilePath = null, styles = fileTreeStyles.entries, openFilePaths = []) {
    let html = '<ul class="file-tree-list">';
    
    for (const item of items) {
        const isDir = item.type === 'directory';
        const isExpanded = expandedDirs.has(item.path);
        const isSelected = item.path === selectedPath;
        const isActiveFile = !isDir && item.path === activeFilePath;
        const isOpenFile = !isDir && !isActiveFile && (openFilePaths instanceof Set ? openFilePaths.has(item.path) : openFilePaths.includes?.(item.path));
        const isMultiSelected = selectedPaths.includes(item.path);
        const hasChildren = isDir && item.children && item.children.length > 0;
        const isDrawioDiagram = !isDir && isDrawioDiagramPath(item.path);
        const isNonMd = !isDir && !isEditableCodeMirrorFile(item.path) && !isDrawioDiagram;
        const appearance = styles?.[item.path] || {};
        const customIcon = appearance.icon ? renderLucideIcon(appearance.icon, { size: 16 }) : '';
        const defaultInboxIcon = isDir && item.path === 'Inbox'
            ? renderLucideIcon('Mail', { size: 16, className: 'default-inbox-icon' })
            : '';
        const resolvedIcon = customIcon || defaultInboxIcon;
        const customColor = /^#[0-9a-f]{6}$/i.test(appearance.color || '') ? appearance.color : '';
        const appearanceClasses = `${customIcon ? 'custom-icon' : ''} ${customColor ? 'custom-color' : ''}`.trim();
        const appearanceStyle = customColor ? ` style="--file-tree-entry-color:${customColor}"` : '';
        
        html += `
            <li class="file-tree-item ${isExpanded ? 'expanded' : ''}" data-path="${escapeHtml(item.path)}" data-type="${item.type}">
                <div class="file-tree-node ${isSelected ? 'selected' : ''} ${isActiveFile ? 'active-file' : ''} ${isOpenFile ? 'open-file' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isNonMd ? 'non-md' : ''} ${isDrawioDiagram ? 'drawio-diagram' : ''} ${appearanceClasses}" draggable="true"${appearanceStyle}>
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
                            ${customIcon || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>`}
                        </span>
                    `}
                    <span class="node-name">${escapeHtml(item.name)}</span>
                </div>
                ${isDir && hasChildren && isExpanded ? `
                    <div class="file-tree-children">
                        ${buildTreeHTML(item.children, expandedDirs, selectedPath, selectedPaths, depth + 1, activeFilePath, styles, openFilePaths)}
                    </div>
                ` : ''}
            </li>
        `;
    }
    
    html += '</ul>';
    return html;
}

/**
 * Initialize file tree event handlers
 */
function initFileTreeEvents() {
    const container = document.getElementById('file-tree');
    if (!container) return;
    container.tabIndex = 0;
    if (!container.getAttribute('aria-label')) container.setAttribute('aria-label', 'Vault file tree');
    
    // Click delegation for nodes
    container.addEventListener('click', (e) => {
        const node = e.target.closest('.file-tree-node');
        if (!node) {
            if (e.target.closest('.file-tree-root-dropzone')) {
                container.focus({ preventScroll: true });
                setState('selectedTreePath', null);
                setState('selectedFilePaths', []);
                saveSession();
                renderFileTree();
            }
            return;
        }
        container.focus({ preventScroll: true });
        
        const item = node.closest('.file-tree-item');
        if (!item) return;
        
        const path = item.dataset.path;
        const type = item.dataset.type;
        
        if (type === 'directory') {
            setState('selectedTreePath', path);
            setState('selectedFilePaths', []);
            toggleDirectory(path);
            renderFileTree();
        } else if (type === 'file') {
            const isDiagram = isDrawioDiagramPath(path);
            const isMarkdown = path.toLowerCase().endsWith('.md');
            const isEditable = isEditableCodeMirrorFile(path);
            const isCtrl = e.ctrlKey || e.metaKey;
            if (isCtrl) {
                // Multi-select toggle (only .md files)
                if (!isMarkdown) return;
                e.preventDefault();
                const paths = [...(getState('selectedFilePaths') || [])];
                const idx = paths.indexOf(path);
                if (idx >= 0) {
                    paths.splice(idx, 1);
                } else {
                    paths.push(path);
                }
                setState('selectedFilePaths', paths);
                renderFileTree();
            } else {
                if (!isEditable && !isDiagram) return;
                // Single select and open
                setState('selectedFilePath', path);
                setState('selectedTreePath', path);
                setState('selectedFilePaths', []);
                if (isDiagram) {
                    openTab(path, path.split('/').pop(), 'drawio', { path });
                } else {
                    handleFileOpen(path);
                }
                saveSession();
                renderFileTree();
            }
        }
    });
    
    // Double-click to open directories (optional)
    container.addEventListener('dblclick', (e) => {
        const node = e.target.closest('.file-tree-node');
        if (!node) return;
        
        const item = node.closest('.file-tree-item');
        if (!item) return;
        
        const path = item.dataset.path;
        const type = item.dataset.type;
        
        if (type === 'directory') {
            toggleDirectory(path);
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
    const expandedDirs = new Set(getState('expandedDirs'));
    if (expandedDirs.has(path)) {
        expandedDirs.delete(path);
    } else {
        expandedDirs.add(path);
    }
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
 * Get selected file path
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
}

/** Store one vault item for non-destructive internal copy/paste. */
export function copyInternalPath(path, type) {
    const normalizedPath = String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (!normalizedPath || (type !== 'file' && type !== 'directory')) return false;
    internalClipboard = { path: normalizedPath, type };
    statusBar.set(`Copied “${normalizedPath.split('/').pop()}”`);
    return true;
}

/** Resolve where Paste writes for a file-tree context target. */
export function internalPasteTargetDirectory(path, type) {
    const normalizedPath = String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (type === 'directory') return normalizedPath;
    if (type === 'file') {
        const separator = normalizedPath.lastIndexOf('/');
        return separator >= 0 ? normalizedPath.slice(0, separator) : '';
    }
    return '';
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
    if (!internalClipboard || internalCopyInProgress) return false;
    const source = { ...internalClipboard };
    const targetDirectory = internalPasteTargetDirectory(targetPath, targetType);
    if (source.type === 'directory' && isInvalidCopyDestination(source.path, targetDirectory)) {
        await showRecursiveCopyRefusal();
        return false;
    }

    internalCopyInProgress = true;
    try {
        statusBar.set(`Saving “${source.path.split('/').pop()}” before copying…`);
        const saveState = await prepareTabsForPathCopy(source.path);
        if (!saveState.success) {
            await errorDialog('Couldn’t copy item', saveState.error, 'The source could not be saved before copying.');
            statusBar.set('Copy failed');
            return false;
        }
        statusBar.set(`Copying “${source.path.split('/').pop()}”…`);
        const result = await backend().CopyPath(source.path, targetDirectory);
        if (!result?.success) {
            if (String(result?.error || '').toLowerCase().includes('recursive copy')) {
                await showRecursiveCopyRefusal();
            } else {
                await errorDialog('Couldn’t copy item', result?.error, 'The item could not be copied.');
            }
            statusBar.set('Copy failed');
            return false;
        }
        if (targetDirectory) {
            const expandedDirs = new Set(getState('expandedDirs'));
            expandedDirs.add(targetDirectory);
            setState('expandedDirs', expandedDirs);
            saveSession();
        }
        if (result.path) setState('selectedTreePath', result.path);
        await refreshFileTree();
        const copiedName = String(result.path || source.path).replaceAll('\\', '/').split('/').pop();
        statusBar.set(`Created “${copiedName}”`);
        setTimeout(() => statusBar.set('Ready'), 2500);
        return true;
    } catch (error) {
        log.error('Internal copy failed:', error);
        await errorDialog('Couldn’t copy item', error, 'The item could not be copied.');
        statusBar.set('Copy failed');
        return false;
    } finally {
        internalCopyInProgress = false;
    }
}

function handleFileTreeKeydown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    const treeData = getState('fileTreeData') || [];
    const selectedPath = getState('selectedTreePath');
    const selectedItem = selectedPath ? findTreeItem(treeData, selectedPath) : null;
    if (key === 'c' && selectedItem) {
        event.preventDefault();
        copyInternalPath(selectedItem.path, selectedItem.type);
    } else if (key === 'v' && internalClipboard) {
        event.preventDefault();
        pasteInternalClipboard(selectedItem?.path || '', selectedItem?.type || 'root').catch(() => {});
    }
}

/**
 * Drag and drop handlers
 */
function handleDragStart(e) {
    const node = e.target.closest('.file-tree-node');
    if (!node) return;
    
    const item = node.closest('.file-tree-item');
    if (!item) return;
    
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
    try {
        const saveState = await prepareTabsForPathMove(sourcePath);
        if (!saveState.success) {
            await errorDialog('Couldn’t move item', saveState.error, 'Save open files before moving them.');
            return false;
        }
        let result = await backend().MovePath(sourcePath, targetDir);
        let merged = false;
        if (!result?.success && result?.merge_available) {
            const directoryName = String(sourcePath || '').replaceAll('\\', '/').split('/').pop();
            const confirmed = await confirmDialog(
                'Destination directory already exists',
                `A directory named “${directoryName}” already exists in the destination. Merge the moved directory into it instead? Existing files will be kept; filename collisions will be added as “name (copy).ext”, “name (copy 2).ext”, and so on.`,
                false,
                false,
                { confirmLabel: 'Merge contents', tone: 'warning', icon: 'merge' }
            );
            if (!confirmed) {
                statusBar.set('Move cancelled');
                setTimeout(() => statusBar.set('Ready'), 1800);
                return false;
            }
            statusBar.set(`Merging “${directoryName}”…`);
            result = await backend().MergeDirectory(sourcePath, targetDir);
            merged = true;
        }
        if (!result?.success) {
            await errorDialog('Couldn’t move item', result?.error, 'The item could not be moved.');
            return false;
        }

        await refreshFileTree();

        // Collision-specific paths must be remapped before the general folder
        // prefix so dirty/open tabs follow their parenthesized copy names.
        for (const [movedFrom, movedTo] of Object.entries(result.moved_paths || {})) {
            updateTabsForMovedPath(movedFrom, movedTo);
            remapTreeSelection(movedFrom, movedTo);
        }
        const movedFrom = result.old_path || sourcePath;
        const movedTo = result.path || sourcePath;
        updateTabsForMovedPath(movedFrom, movedTo);
        remapTreeSelection(movedFrom, movedTo);
        await refreshTabsForUpdatedLinks(result.updated_links);
        const linkCount = Array.isArray(result.updated_links) ? result.updated_links.length : 0;
        if (linkCount) {
            statusBar.set(`Updated links in ${linkCount} ${linkCount === 1 ? 'note' : 'notes'}`);
            setTimeout(() => statusBar.set('Ready'), 2500);
        } else if (merged) {
            statusBar.set(`Merged “${String(movedTo).replaceAll('\\', '/').split('/').pop()}”`);
            setTimeout(() => statusBar.set('Ready'), 2500);
        }
        return true;
    } catch (err) {
        log.error('Move failed:', err);
        await errorDialog('Couldn’t move item', err, 'The item could not be moved.');
        return false;
    }
}

/** Resolve the vault folder represented by an external drop target. */
export function externalDropTargetDirectory(element) {
    const tree = element?.closest?.('#file-tree');
    if (!tree) return null;
    const item = element.closest('.file-tree-item');
    if (!item) return '';
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

export async function copyExternalDrop(paths, targetDirectory, { confirmImport = false, coordinates = null } = {}) {
    if (externalCopyInProgress || !Array.isArray(paths) || paths.length === 0 || targetDirectory === null) return false;
    externalCopyInProgress = true;
    try {
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
            result = await backend().CopyExternalPaths(paths, targetDirectory, false);
        }
        const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
        if (!result?.success && conflicts.length > 0) {
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
                result = await backend().CopyExternalPaths(paths, targetDirectory, true);
            }
        }
        if (!result?.success) {
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
        statusBar.set(`Copied ${copied} ${copied === 1 ? 'item' : 'items'} into the vault`);
        setTimeout(() => statusBar.set('Ready'), 2500);
        return true;
    } catch (error) {
        log.error('External file copy failed:', error);
        await errorDialog('Couldn’t copy dropped items', error, 'The dropped items could not be copied.');
        statusBar.set('Copy failed');
        return false;
    } finally {
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
            copyExternalDrop(paths, targetDirectory).catch(() => {});
            return;
        }
        if (element?.closest?.('#editor-container')) {
            copyExternalDrop(paths, '', { confirmImport: true, coordinates: { x, y } }).catch(() => {});
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
            contextMenu.remove();
            contextMenu = null;
        }
    });
}

function handleContextMenu(e) {
    e.preventDefault();

    e.currentTarget?.focus?.({ preventScroll: true });

    const node = e.target.closest('.file-tree-node');
    const item = node?.closest('.file-tree-item');
    // The event is delegated from #file-tree, so a right-click on its empty
    // space is a vault-root action rather than a no-op.
    const path = item?.dataset.path || '';
    const type = item?.dataset.type || 'root';

    // A folder is a first-class tree selection even when it has no tab to
    // open. Keep right-click selection consistent with a normal click before
    // presenting actions for that folder.
    if (type === 'directory') {
        setState('selectedTreePath', path);
        setState('selectedFilePaths', []);
        saveSession();
        renderFileTree();
    }

    setState('contextTargetType', type);
    setState('contextTargetPath', path);

    if (contextMenu) contextMenu.remove();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = buildFileTreeContextMenuHTML({
        type,
        path,
        selectedPaths: getState('selectedFilePaths') || [],
        openPath: getState('selectedFilePath'),
        clipboardPath: internalClipboard?.path || '',
    });
    document.body.appendChild(contextMenu);
    positionContextMenu(contextMenu, e.clientX, e.clientY);

    contextMenu.addEventListener('click', async (event) => {
        event.stopPropagation();
        const menuItem = event.target.closest('.context-menu-item');
        if (!menuItem || menuItem.classList.contains('disabled') || menuItem.getAttribute('aria-disabled') === 'true') {
            return;
        }

        const action = menuItem.dataset.action;
        contextMenu.remove();
        contextMenu = null;

        switch (action) {
        case 'open-new-tab':
            if (getState('contextTargetType') === 'file') {
                const targetPath = getState('contextTargetPath');
                if (isDrawioDiagramPath(targetPath) || isEditableCodeMirrorFile(targetPath)) {
                    openTab(targetPath, targetPath.split('/').pop(), isDrawioDiagramPath(targetPath) ? 'drawio' : 'file', { path: targetPath }, true);
                }
            }
            break;

        case 'copy':
            copyInternalPath(getState('contextTargetPath'), getState('contextTargetType'));
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

        case 'delete':
            await deletePath(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'reveal':
            backend().RevealInExplorer(getState('contextTargetPath'));
            break;

        case 'merge-notes':
            await mergeSelectedNotes();
            break;

        case 'preview-pdf':
            try {
                const { openPDFPreview } = await import('./pdfPreview.js');
                const targetPath = getState('contextTargetPath');
                await openPDFPreview({ path: targetPath, title: targetPath.split('/').pop() });
            } catch (err) {
                log.error('PDF preview failed:', err);
                await errorDialog('Couldn’t open PDF preview', err, 'The PDF preview could not be opened.');
            }
            break;

        default:
            break;
        }
    });
}

export async function customizeTreePath(path, type) {
    if (!path || (type !== 'file' && type !== 'directory')) return false;
    const item = findTreeItem(getState('fileTreeData') || [], path);
    if (!item) return false;
    if (type === 'file' && !isEditableCodeMirrorFile(path) && !isDrawioDiagramPath(path)) return false;

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
        statusBar.set(choice.icon || choice.color ? `Styled “${item.name}”` : `Reset appearance for “${item.name}”`);
        setTimeout(() => statusBar.set('Ready'), 1600);
        return true;
    } catch (error) {
        await errorDialog('Couldn’t style entry', error, 'The file-tree appearance could not be saved.');
        return false;
    }
}


async function mergeSelectedNotes() {
    const sel = getState('selectedFilePaths') || [];
    const ctx = getState('contextTargetPath');
    const openPath = getState('selectedFilePath');
    // Build ordered merge set: open file first, then multi-selected (deduplicated)
    const all = [openPath, ...sel].filter(Boolean);
    const paths = [...new Set(ctx && !all.includes(ctx) ? [ctx, ...all] : all)];
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
            setState('selectedFilePaths', []);
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

    const selectedPaths = getState('selectedFilePaths') || [];
    const nextSelectedPaths = [...new Set(selectedPaths.map(path => remapTreePath(path, oldPath, newPath)))];
    if (nextSelectedPaths.some((path, index) => path !== selectedPaths[index]) || nextSelectedPaths.length !== selectedPaths.length) {
        setState('selectedFilePaths', nextSelectedPaths);
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
    try {
        const saveState = await prepareTabsForPathMove(path);
        if (!saveState.success) {
            await errorDialog(`Couldn’t rename ${kind}`, saveState.error, `Save open files before renaming this ${kind}.`);
            return;
        }
        const result = await backend().RenamePath(path, newPath);
        if (!result.success) {
            await errorDialog(`Couldn’t rename ${kind}`, result.error, `The ${kind} could not be renamed.`);
            return;
        }

        const movedFrom = result.old_path || path;
        const movedTo = result.path || newPath;
        await refreshFileTree();
        updateTabsForMovedPath(movedFrom, movedTo);
        remapTreeSelection(movedFrom, movedTo);
        await refreshTabsForUpdatedLinks(result.updated_links);
        const linkCount = Array.isArray(result.updated_links) ? result.updated_links.length : 0;
        if (linkCount) {
            statusBar.set(`Updated links in ${linkCount} ${linkCount === 1 ? 'note' : 'notes'}`);
            setTimeout(() => statusBar.set('Ready'), 2500);
        }
    } catch (err) {
        log.error('Rename failed:', err);
        await errorDialog(`Couldn’t rename ${kind}`, err, `The ${kind} could not be renamed.`);
    }
}

async function deletePath(path) {
    const name = path.split('/').pop();
    const confirmed = await confirmDialog(
        'Delete permanently?',
        `“${name}” will be removed from the vault. This cannot be undone.`,
        true,
        false,
        { confirmLabel: 'Delete permanently' }
    );
    
    if (!confirmed) return;
    
    try {
        const result = await backend().DeletePath(path);
        if (result.success) {
            await refreshFileTree();
            
            // Close any tabs for deleted files
            closeTabsForDeletedPath(path);
            const selectedTreePath = getState('selectedTreePath');
            if (selectedTreePath === path || selectedTreePath?.startsWith(path + '/')) {
                setState('selectedTreePath', null);
            }
        } else {
            await errorDialog('Couldn’t delete item', result.error, 'The item could not be deleted.');
        }
    } catch (err) {
        log.error('Delete failed:', err);
        await errorDialog('Couldn’t delete item', err, 'The item could not be deleted.');
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

export default {
    initFileTree,
    refreshFileTree,
    getSelectedFilePath
};
