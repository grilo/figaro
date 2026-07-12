/**
 * File Tree Explorer - Handles file tree rendering, interactions, drag-drop, context menu
 */

import { log } from './log.js';
import { setState, getState, subscribe } from './state.js';
import { saveSession } from './session.js';
import { openTab, handleFileOpen } from './app.js';
import { closeTabsForDeletedPath, prepareTabsForPathMove, refreshTabsForUpdatedLinks, updateTabsForMovedPath } from './tabManager.js';
import { statusBar } from './statusBar.js';
import { confirmDialog, newNoteDialog, promptDialog } from './dialogs.js';
import { isDrawioDiagramPath } from './drawio.js';
import { isEditableCodeMirrorFile } from './languageSupport.js';


let dragSourceNode = null;
let contextMenu = null;
let fileTreeRequestId = 0;

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
export function buildFileTreeContextMenuHTML({ type = 'root', path = '', selectedPaths = [], openPath = '' } = {}) {
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
        'new-file': true,
        'new-drawio': true,
        'new-folder': true,
        rename: isTarget,
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
    initFileTreeEvents();
    initContextMenu();

    // Auto-highlight active file and expand its ancestors in the Vault tree
    subscribe('activeTabId', () => {
        const tabs = getState('openTabs');
        const activeId = getState('activeTabId');
        const activeTab = tabs.find(t => t.id === activeId);
        if (activeTab && (activeTab.type === 'file' || activeTab.type === 'drawio') && activeTab.path) {
            // Expand all ancestor directories
            const parts = activeTab.path.split('/');
            const expanded = new Set(getState('expandedDirs'));
            let changed = false;
            for (let i = 0; i < parts.length - 1; i++) {
                const dirPath = parts.slice(0, i + 1).join('/');
                if (!expanded.has(dirPath)) {
                    expanded.add(dirPath);
                    changed = true;
                }
            }
            if (changed) setState('expandedDirs', expanded);
            setState('selectedFilePath', activeTab.path);
            renderFileTree();
        }
    });
}

/**
 * Refresh file tree from backend
 */
export async function refreshFileTree() {
    const requestId = ++fileTreeRequestId;
    try {
        statusBar.set('Loading file tree...');
        const treeData = await window.pywebview.api.get_file_tree();
        if (requestId !== fileTreeRequestId) return;
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

/**
 * Render file tree from state data
 */
export function renderFileTree() {
    const container = document.getElementById('file-tree');
    const treeData = getState('fileTreeData');
    const expandedDirs = getState('expandedDirs');
    const selectedPath = getState('selectedFilePath');
    const selectedPaths = getState('selectedFilePaths') || [];
    
    if (!container) return;
    
    if (!treeData || treeData.length === 0) {
        container.innerHTML = '<div class="file-tree-empty">No files in vault</div><div class="file-tree-root-dropzone" aria-label="Vault root actions"></div>';
        return;
    }
    
    // Keep a real flexing surface after short file lists. Delegated context
    // events then reach #file-tree even when the user clicks below the last
    // file, making an empty/new vault easy to populate.
    container.innerHTML = buildTreeHTML(treeData, expandedDirs, selectedPath, selectedPaths) +
        '<div class="file-tree-root-dropzone" aria-label="Vault root actions"></div>';
}

/**
 * Build tree HTML recursively
 */
export function buildTreeHTML(items, expandedDirs, selectedPath, selectedPaths = [], depth = 0) {
    let html = '<ul class="file-tree-list">';
    
    for (const item of items) {
        const isDir = item.type === 'directory';
        const isExpanded = expandedDirs.has(item.path);
        const isSelected = item.path === selectedPath;
        const isMultiSelected = selectedPaths.includes(item.path);
        const hasChildren = isDir && item.children && item.children.length > 0;
        const isDrawioDiagram = !isDir && isDrawioDiagramPath(item.path);
        const isNonMd = !isDir && !isEditableCodeMirrorFile(item.path) && !isDrawioDiagram;
        
        html += `
            <li class="file-tree-item ${isExpanded ? 'expanded' : ''}" data-path="${escapeHtml(item.path)}" data-type="${item.type}">
                <div class="file-tree-node ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isNonMd ? 'non-md' : ''} ${isDrawioDiagram ? 'drawio-diagram' : ''}" draggable="true">
                    ${isDir ? `
                        <span class="node-chevron">${hasChildren ? `
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>` : ''}</span>
                        <span class="node-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </span>
                    ` : `
                        <span class="node-chevron"></span>
                        <span class="node-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                        </span>
                    `}
                    <span class="node-name">${escapeHtml(item.name)}</span>
                </div>
                ${isDir && hasChildren ? `
                    <div class="file-tree-children">
                        ${buildTreeHTML(item.children, expandedDirs, selectedPath, selectedPaths, depth + 1)}
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
    
    // Click delegation for nodes
    container.addEventListener('click', (e) => {
        const node = e.target.closest('.file-tree-node');
        if (!node) return;
        
        const item = node.closest('.file-tree-item');
        if (!item) return;
        
        const path = item.dataset.path;
        const type = item.dataset.type;
        
        if (type === 'directory') {
            toggleDirectory(path);
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
    e.dataTransfer.dropEffect = 'move';
    
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
        alert('Cannot move item into itself');
        return;
    }
    
    try {
        const saveState = await prepareTabsForPathMove(sourcePath);
        if (!saveState.success) {
            alert(saveState.error || 'Save open files before moving them');
            return;
        }
        const result = await window.pywebview.api.move_path(sourcePath, targetDir);
        if (result.success) {
            await refreshFileTree();
            
            // Update open tabs if paths changed
            updateTabsForMovedPath(result.old_path || sourcePath, result.path || sourcePath);
            await refreshTabsForUpdatedLinks(result.updated_links);
            const linkCount = Array.isArray(result.updated_links) ? result.updated_links.length : 0;
            if (linkCount) {
                statusBar.set(`Updated links in ${linkCount} ${linkCount === 1 ? 'note' : 'notes'}`);
                setTimeout(() => statusBar.set('Ready'), 2500);
            }
        } else {
            alert(result.error || 'Failed to move');
        }
    } catch (err) {
        log.error('Move failed:', err);
        alert('Failed to move');
    }
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

    const node = e.target.closest('.file-tree-node');
    const item = node?.closest('.file-tree-item');
    // The event is delegated from #file-tree, so a right-click on its empty
    // space is a vault-root action rather than a no-op.
    const path = item?.dataset.path || '';
    const type = item?.dataset.type || 'root';

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

        case 'delete':
            await deletePath(getState('contextTargetPath'), getState('contextTargetType'));
            break;

        case 'reveal':
            window.pywebview.api.reveal_in_explorer(getState('contextTargetPath'));
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
                alert(err?.message || 'Could not open the PDF preview.');
            }
            break;

        default:
            break;
        }
    });
}


async function mergeSelectedNotes() {
    const sel = getState('selectedFilePaths') || [];
    const ctx = getState('contextTargetPath');
    const openPath = getState('selectedFilePath');
    // Build ordered merge set: open file first, then multi-selected (deduplicated)
    const all = [openPath, ...sel].filter(Boolean);
    const paths = [...new Set(ctx && !all.includes(ctx) ? [ctx, ...all] : all)];
    if (paths.length < 2) return;

    const masterName = paths[0].split('/').pop();
    const sourceNames = paths.slice(1).map(p => p.split('/').pop());

    // Build custom modal with checkboxes
    const existing = document.querySelector('.custom-modal-overlay');
    if (existing) existing.remove();

    const checkedIndices = await new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';

        const sourceRows = sourceNames.map((n, i) =>
            `<label class="merge-file-row">
                <input type="checkbox" class="merge-checkbox" data-index="${i}" checked>
                <span class="merge-file-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                </span>
                <span class="merge-file-name">${escapeHtml(n)}</span>
            </label>`
        ).join('');

        overlay.innerHTML = `
            <div class="custom-modal">
                <h3>Merge Notes</h3>
                <div class="custom-modal-body">
                    <div class="merge-confirm">
                        <div class="merge-dest-row">
                            <span class="merge-dest-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                </svg>
                            </span>
                            <span class="merge-dest-label">Into</span>
                            <span class="merge-dest-name">${escapeHtml(masterName)}</span>
                        </div>
                        <span class="merge-sources-label">Select sources to merge</span>
                        ${sourceRows}
                        <div class="merge-warning">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            Checked notes will be permanently deleted after merging.
                        </div>
                    </div>
                </div>
                <div class="custom-modal-buttons">
                    <button class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                    <button class="custom-modal-btn custom-modal-btn-confirm">Merge</button>
                </div>
            </div>
        `;

        const cancelBtn = overlay.querySelector('.custom-modal-btn-cancel');
        const confirmBtn = overlay.querySelector('.custom-modal-btn-confirm');
        const checkboxes = overlay.querySelectorAll('.merge-checkbox');

        const cleanup = () => {
            overlay.remove();
            document.removeEventListener('keydown', handleKeydown);
        };

        const handleKeydown = (e) => {
            if (e.key === 'Escape') { cleanup(); resolve(null); }
        };

        cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });

        confirmBtn.addEventListener('click', () => {
            const checked = [];
            checkboxes.forEach(cb => { if (cb.checked) checked.push(parseInt(cb.dataset.index)); });
            cleanup();
            resolve(checked);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { cleanup(); resolve(null); }
        });

        document.body.appendChild(overlay);
        document.addEventListener('keydown', handleKeydown);
        setTimeout(() => confirmBtn.focus(), 0);
    });

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
        const result = await window.pywebview.api.merge_notes(mergePaths);
        if (result.success) {
            setState('selectedFilePaths', []);
            for (const p of mergePaths.slice(1)) {
                closeTabsForDeletedPath(p);
            }
            setTimeout(async () => {
                await refreshFileTree();
                setState('selectedFilePath', mergePaths[0]);
            }, 300);
        } else {
            document.querySelectorAll('.file-tree-item.merging').forEach(el => el.classList.remove('merging'));
            alert(result.error || 'Merge failed');
        }
    } catch (err) {
        document.querySelectorAll('.file-tree-item.merging').forEach(el => el.classList.remove('merging'));
        alert('Merge failed: ' + (err.message || err));
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
        const result = await window.pywebview.api.create_file(
            parentDir ? `${parentDir}/${fileName}` : fileName,
            /\.md$/i.test(fileName) ? `# ${fileName.slice(0, -3)}\n\n` : ''
        );
        
        if (result.success) {
            await refreshFileTree();
            await handleFileOpen(result.path);
        } else {
            alert(result.error || 'Failed to create file');
        }
    } catch (err) {
        log.error('Create file failed:', err);
        alert('Failed to create file');
    }
}

async function createNewDrawioDiagramIn(targetPath, targetType) {
    let parentDir = '';
    if (targetType === 'directory') {
        parentDir = targetPath;
    } else if (targetType === 'file') {
        parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    }

    const name = await promptDialog('New Draw.io Diagram', 'Enter diagram name:', 'Untitled.drawio.svg');
    if (!name?.trim()) return;

    let fileName = name.trim();
    if (!isDrawioDiagramPath(fileName)) {
        fileName = fileName.replace(/\.svg$/i, '').replace(/\.drawio$/i, '') + '.drawio.svg';
    }

    try {
        const result = await window.pywebview.api.create_file(
            parentDir ? `${parentDir}/${fileName}` : fileName,
            ''
        );
        if (!result.success) {
            alert(result.error || 'Failed to create diagram');
            return;
        }

        await refreshFileTree();
        openTab(result.path, fileName, 'drawio', { path: result.path, mtime: result.mtime });
    } catch (err) {
        log.error('Create draw.io diagram failed:', err);
        alert('Failed to create diagram');
    }
}

async function createNewFolderIn(targetPath, targetType) {
    let parentDir = '';
    
    if (targetType === 'directory') {
        parentDir = targetPath;
    } else if (targetType === 'file') {
        parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    }
    
    const name = await promptDialog('New Folder', 'Enter folder name:', 'New Folder');
    if (!name) return;
    
    try {
        const result = await window.pywebview.api.create_directory(
            parentDir ? `${parentDir}/${name}` : name
        );
        
        if (result.success) {
            await refreshFileTree();
        } else {
            alert(result.error || 'Failed to create folder');
        }
    } catch (err) {
        log.error('Create folder failed:', err);
        alert('Failed to create folder');
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
    const proposedName = await promptDialog(`Rename ${kind}`, `Enter a new ${kind} name:`, oldName);
    const nextName = String(proposedName || '').trim();
    if (!nextName || nextName === oldName) return;
    if (/[\\/]/.test(nextName)) {
        alert('Choose a name, not a path.');
        return;
    }
    if (/^\.+$/.test(nextName) || Array.from(nextName).some(character => character.charCodeAt(0) < 0x20)) {
        alert('Choose a valid name.');
        return;
    }

    const separator = path.lastIndexOf('/');
    const newPath = separator >= 0 ? `${path.slice(0, separator + 1)}${nextName}` : nextName;
    try {
        const saveState = await prepareTabsForPathMove(path);
        if (!saveState.success) {
            alert(saveState.error || 'Save open files before renaming');
            return;
        }
        const result = await window.pywebview.api.rename_path(path, newPath);
        if (!result.success) {
            alert(result.error || `Failed to rename ${kind}`);
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
        alert(`Failed to rename ${kind}`);
    }
}

async function deletePath(path) {
    const name = path.split('/').pop();
    const confirmed = await confirmDialog(
        'Delete',
        `Delete "${name}"? This cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
        const result = await window.pywebview.api.delete_path(path);
        if (result.success) {
            await refreshFileTree();
            
            // Close any tabs for deleted files
            closeTabsForDeletedPath(path);
        } else {
            alert(result.error || 'Failed to delete');
        }
    } catch (err) {
        log.error('Delete failed:', err);
        alert('Failed to delete');
    }
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
