/**
 * Kanban Module - Task board with drag-drop, column management
 */

import { log } from './log.js';
import { setState, getState } from './state.js';
import { openTab } from './app.js';
import { statusBar } from './statusBar.js';
import { confirmDialog, errorDialog, promptDialog } from './dialogs.js';

let draggedCard = null;
let kanbanColumns = [];
let kanbanColors = {};
const persistedColumns = new Set();
let kanbanBoardRequestId = 0;
let kanbanColumnsRequestId = 0;
let kanbanBadgeRequestId = 0;
let kanbanMutationId = 0;

const COLOR_PALETTE = [
    '', '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#22c55e', '#14b8a6', '#3b82f6', '#6366f1',
    '#a855f7', '#ec4899', '#6b7280'
];

/**
 * Initialize kanban module
 */
export function initKanban() {
    refreshKanbanData().catch(() => {});
}

// Refresh lightweight Kanban state after the backend finishes an initial or
// externally-triggered vault index. If the board is visible, update it too.
export async function refreshKanbanData() {
    await loadKanbanColumns();
    await updateKanbanBadges();
    const container = getBoardContainer();
    if (container) await renderKanbanBoard(container.id);
}

/**
 * Update kanban badge counts in the sidebar header
 */
async function updateKanbanBadges() {
    const requestId = ++kanbanBadgeRequestId;
    try {
        const boardData = await window.pywebview.api.get_kanban_board();
        if (requestId !== kanbanBadgeRequestId) return;
        setState('kanbanBoardData', boardData);
        
        const container = document.getElementById('kanban-badges');
        if (!container) return;
        
        let html = '';
        for (const col of kanbanColumns) {
            const count = (boardData[col] || []).length;
            const color = kanbanColors[col];
            if (color && count > 0) {
                html += `<span class="badge" style="background:${color};color:#fff">${count}</span>`;
            }
        }
        container.innerHTML = html;
    } catch (err) {
        if (requestId !== kanbanBadgeRequestId) return;
        log.error('Failed to update kanban badges:', err);
    }
}

/**
 * Load kanban columns from backend
 */
async function loadKanbanColumns() {
    const requestId = ++kanbanColumnsRequestId;
    try {
        const result = await window.pywebview.api.get_kanban_columns();
        if (requestId !== kanbanColumnsRequestId) return false;
        if (result && result.columns) {
            kanbanColumns = result.columns;
            kanbanColors = result.colors || {};
        } else {
            kanbanColumns = result || [];
            kanbanColors = {};
        }
        setState('kanbanColumns', kanbanColumns);
        return true;
    } catch (err) {
        if (requestId !== kanbanColumnsRequestId) return false;
        log.error('Failed to load kanban columns:', err);
        kanbanColumns = ['todo', 'wip', 'done'];
        kanbanColors = {};
        setState('kanbanColumns', kanbanColumns);
        return false;
    }
}

/**
 * Render kanban board
 * @param {string} containerId - Container element ID
 * @param {string} focusCol - Column to highlight (optional)
 */
export async function renderKanbanBoard(containerId, focusCol = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const requestId = ++kanbanBoardRequestId;
    
    container.innerHTML = '<div class="kanban-loading">Loading board...</div>';
    
    try {
        // Load board data
        const boardData = await window.pywebview.api.get_kanban_board();
        if (requestId !== kanbanBoardRequestId || !container.isConnected) return;
        setState('kanbanBoardData', boardData);
        
        // Always reload columns to pick up newly discovered tags
        await loadKanbanColumns();
        if (requestId !== kanbanBoardRequestId || !container.isConnected) return;
        
        persistedColumns.clear();
        for (const col of kanbanColumns) persistedColumns.add(col);
        
        // Render columns
        renderColumns(container, boardData, focusCol);
        
        // Set up drag-drop
        initKanbanDragDrop(container);
        
    } catch (err) {
        if (requestId !== kanbanBoardRequestId || !container.isConnected) return;
        log.error('Failed to render kanban board:', err);
        container.innerHTML = '<div class="kanban-error">Failed to load board</div>';
    }
}

/**
 * Render kanban columns
 */
function renderColumns(container, boardData, focusCol) {
    let html = '';
    
    // Preserve persisted column order, append new columns
    const allColumns = [...persistedColumns];
    for (const col of kanbanColumns) {
        if (!persistedColumns.has(col)) allColumns.push(col);
    }
    for (const column of allColumns) {
        const tasks = boardData[column] || [];
        const isSystem = ['todo', 'wip', 'done'].includes(column);
        const isFocused = column === focusCol;
        html += `
            <div class="kanban-column ${isFocused ? 'focused' : ''}" data-column="${column}">
                <div class="kanban-column-header">
                    <span class="kanban-column-title">#${column}</span>
                    <div class="kanban-column-actions">
                        <button class="kanban-column-btn color-col" title="Set color" data-column="${column}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 0 20"></path><path d="M2 12h20"></path></svg>
                        </button>
                        ${!isSystem ? `
                            <button class="kanban-column-btn rename-col" title="Rename column" data-column="${column}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="kanban-column-btn delete-col" title="Delete column" data-column="${column}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="kanban-column-cards" data-column="${column}">
                    ${renderCards(tasks)}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // Event listeners for color picker
    container.querySelectorAll('.color-col').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showColorPicker(btn, btn.dataset.column);
        });
    });
    
    container.querySelectorAll('.rename-col').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            renameColumn(btn.dataset.column);
        });
    });
    
    container.querySelectorAll('.delete-col').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteColumn(btn.dataset.column);
        });
    });
    
    // Add click handlers for cards
    container.querySelectorAll('.kanban-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.kanban-card-delete')) return;
            const filePath = card.dataset.file;
            const lineNum = parseInt(card.dataset.line, 10);
            if (filePath) {
                openTab(filePath, filePath.split('/').pop(), 'file', { path: filePath, line: lineNum });
            }
        });
        
        // Delete button
        const deleteBtn = card.querySelector('.kanban-card-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const filePath = card.dataset.file;
                const lineNum = parseInt(card.dataset.line, 10);
                const tag = card.dataset.tag;
                removeTagFromTask(filePath, lineNum, tag);
            });
        }
    });
    
    // Auto-clear focus highlight after 2.5s
    if (focusCol) {
        setTimeout(() => {
            const focusedCol = container.querySelector('.kanban-column.focused');
            if (focusedCol) focusedCol.classList.remove('focused');
        }, 2500);
    }
}

/**
 * Show color picker popup near a button
 */
function showColorPicker(anchorBtn, columnName) {
    // Remove existing picker
    document.querySelectorAll('.kanban-color-picker').forEach(p => p.remove());
    
    const picker = document.createElement('div');
    picker.className = 'kanban-color-picker';
    
    const currentColor = kanbanColors[columnName] || '';
    
    let swatchesHtml = '';
    for (const c of COLOR_PALETTE) {
        const isActive = c === currentColor;
        const label = c === '' ? '✕' : '';
        swatchesHtml += `
            <button class="kanban-color-swatch ${isActive ? 'active' : ''}" 
                    data-color="${c}" 
                    style="${c ? `background:${c}` : ''}"
                    title="${c || 'No color'}">${label}</button>`;
    }
    
    picker.innerHTML = swatchesHtml;
    
    // Position near the button
    const rect = anchorBtn.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.top = (rect.bottom + 4) + 'px';
    picker.style.left = (rect.left - 80) + 'px';
    
    document.body.appendChild(picker);
    
    // Click handler
    picker.addEventListener('click', async (e) => {
        const swatch = e.target.closest('.kanban-color-swatch');
        if (!swatch) return;
        const color = swatch.dataset.color;
        await setColumnColor(columnName, color);
        picker.remove();
    });
    
    // Close on outside click
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!picker.contains(e.target) && e.target !== anchorBtn) {
                picker.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 0);
}

/**
 * Set color for a column
 */
async function setColumnColor(columnName, color) {
    const mutationId = beginKanbanMutation();
    try {
        const result = await window.pywebview.api.set_column_color(columnName, color);
        if (mutationId !== kanbanMutationId) return;
        if (result.success) {
            kanbanColors = result.colors;
            await refreshAfterKanbanMutation(mutationId);
        }
    } catch (err) {
        if (mutationId !== kanbanMutationId) return;
        log.error('Set column color failed:', err);
    }
}

/**
 * Render task cards for a column
 */
function renderCards(tasks) {
    if (!tasks || tasks.length === 0) {
        return '<div class="kanban-empty">No tasks</div>';
    }
    
    return tasks.map(task => `
        <div class="kanban-card" 
             draggable="true" 
             data-file="${escapeHtml(task.file)}" 
             data-line="${task.line}"
             data-tag="${task.tag}">
            <div class="kanban-card-text">${escapeHtml(task.text)}</div>
            <div class="kanban-card-meta">
                <span class="kanban-card-source">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    ${escapeHtml(task.file_name)}
                </span>
                <button class="kanban-card-delete" aria-label="Remove tag">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * Initialize drag-drop for kanban
 */
function initKanbanDragDrop(container) {
    const columns = container.querySelectorAll('.kanban-column');
    
    columns.forEach(column => {
        const cardsContainer = column.querySelector('.kanban-column-cards');
        
        // Column drop zone
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            column.classList.add('drag-over');
        });
        
        column.addEventListener('dragleave', (e) => {
            // Only remove if leaving the column entirely
            if (!column.contains(e.relatedTarget)) {
                column.classList.remove('drag-over');
            }
        });
        
        column.addEventListener('drop', (e) => {
            e.preventDefault();
            column.classList.remove('drag-over');
            
            if (draggedCard) {
                const targetColumn = column.dataset.column;
                const sourceColumn = draggedCard.dataset.tag;
                
                if (targetColumn !== sourceColumn) {
                    moveCard(draggedCard, targetColumn);
                }
            }
            draggedCard = null;
        });
        
        // Card drag events
        const cards = cardsContainer.querySelectorAll('.kanban-card');
        cards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                draggedCard = card;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.file);
            });
            
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                draggedCard = null;
            });
        });
    });
}

/**
 * Move card to new column
 */
async function moveCard(card, targetColumn) {
    const filePath = card.dataset.file;
    const lineNum = parseInt(card.dataset.line, 10);
    const oldTag = card.dataset.tag;
    const mutationId = beginKanbanMutation();
    
    try {
        statusBar.set('Moving task...');
        const result = await window.pywebview.api.update_task_tag(filePath, lineNum, oldTag, targetColumn);
        if (mutationId !== kanbanMutationId) return;
        
        if (result.success) {
            statusBar.set('Task moved');
            setTimeout(() => statusBar.set('Ready'), 1000);
            if (!await refreshAfterKanbanMutation(mutationId)) return;
            
            // Reload active file if it's the one we modified
            reloadActiveFileIfNeeded(filePath);
        } else {
            await errorDialog('Couldn’t move task', result.error, 'The task could not be moved.');
            statusBar.set('Ready');
        }
    } catch (err) {
        if (mutationId !== kanbanMutationId) return;
        log.error('Move task failed:', err);
        await errorDialog('Couldn’t move task', err, 'The task could not be moved.');
        statusBar.set('Ready');
    }
}

/**
 * Get the active board container element
 */
function getBoardContainer() {
    return document.getElementById('kanban-board-main') || document.getElementById('kanban-board');
}

function beginKanbanMutation() {
    kanbanBoardRequestId++;
    kanbanColumnsRequestId++;
    kanbanBadgeRequestId++;
    return ++kanbanMutationId;
}

async function refreshAfterKanbanMutation(mutationId) {
    if (mutationId !== kanbanMutationId) return false;
    const container = getBoardContainer();
    if (container) await renderKanbanBoard(container.id);
    if (mutationId !== kanbanMutationId) return false;
    await updateKanbanBadges();
    return mutationId === kanbanMutationId;
}

/**
 * Rename column
 */
async function renameColumn(oldName) {
    const newName = await promptDialog('Rename column', `Choose a new hashtag for #${oldName}.`, oldName, {
        icon: 'edit',
        label: 'Column hashtag',
        confirmLabel: 'Rename column',
        help: 'Spaces become hyphens. Use letters, numbers, underscores, and hyphens.',
        validate: value => {
            const sanitized = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
            if (!/^[a-z][a-z0-9_-]*$/i.test(sanitized)) return 'Start with a letter and use only letters, numbers, underscores, or hyphens.';
            if (sanitized !== oldName && kanbanColumns.includes(sanitized)) return `#${sanitized} already exists.`;
            return '';
        },
    });
    if (!newName || newName === oldName) return;
    
    const sanitized = newName.trim().toLowerCase().replace(/\s+/g, '-');

    const mutationId = beginKanbanMutation();
    
    try {
        const result = await window.pywebview.api.rename_kanban_column(oldName, sanitized);
        if (mutationId !== kanbanMutationId) return;
        if (result.success) {
            kanbanColumns = result.columns;
            kanbanColors = result.colors || {};
            setState('kanbanColumns', kanbanColumns);
            if (!await refreshAfterKanbanMutation(mutationId)) return;
            
            // Reload active file if it has the old tag
            reloadActiveFileIfNeeded(null, oldName);
        } else {
            await errorDialog('Couldn’t rename column', result.error, 'The column could not be renamed.');
        }
    } catch (err) {
        if (mutationId !== kanbanMutationId) return;
        log.error('Rename column failed:', err);
        await errorDialog('Couldn’t rename column', err, 'The column could not be renamed.');
    }
}

/**
 * Delete column
 */
async function deleteColumn(name) {
    const confirmed = await confirmDialog(
        'Delete column?',
        `#${name} will be removed from every task that uses it. The notes remain in the vault.`,
        true,
        false,
        { confirmLabel: 'Delete column' }
    );
    if (!confirmed) return;

    const mutationId = beginKanbanMutation();
    
    try {
        const result = await window.pywebview.api.delete_kanban_column(name);
        if (mutationId !== kanbanMutationId) return;
        if (result.success) {
            kanbanColumns = result.columns;
            kanbanColors = result.colors || {};
            setState('kanbanColumns', kanbanColumns);
            if (!await refreshAfterKanbanMutation(mutationId)) return;
            
            // Reload active file if it has the deleted tag
            reloadActiveFileIfNeeded(null, name);
        } else {
            await errorDialog('Couldn’t delete column', result.error, 'The column could not be deleted.');
        }
    } catch (err) {
        if (mutationId !== kanbanMutationId) return;
        log.error('Delete column failed:', err);
        await errorDialog('Couldn’t delete column', err, 'The column could not be deleted.');
    }
}

/**
 * Remove tag from task (delete button on card)
 */
async function removeTagFromTask(filePath, lineNum, tag) {
    const mutationId = beginKanbanMutation();
    try {
        const result = await window.pywebview.api.remove_tag_from_task(filePath, lineNum, tag);
        if (mutationId !== kanbanMutationId) return;
        if (result.success) {
            statusBar.set('Tag removed');
            setTimeout(() => statusBar.set('Ready'), 1000);
            if (!await refreshAfterKanbanMutation(mutationId)) return;
            
            // Reload active file
            reloadActiveFileIfNeeded(filePath);
        } else {
            await errorDialog('Couldn’t remove tag', result.error, 'The tag could not be removed from this task.');
        }
    } catch (err) {
        if (mutationId !== kanbanMutationId) return;
        log.error('Remove tag failed:', err);
        await errorDialog('Couldn’t remove tag', err, 'The tag could not be removed from this task.');
    }
}

/**
 * Reload active file if it matches the modified file
 */
function reloadActiveFileIfNeeded(filePath, tag = null) {
    const tabs = getState('openTabs');
    const activeTab = tabs.find(t => t.id === getState('activeTabId'));
    
    if (activeTab && activeTab.type === 'file') {
        const shouldReload = filePath ? activeTab.path === filePath : 
            (tag && activeTab.path && checkFileHasTag(activeTab.path, tag));
        
        if (shouldReload) {
            import('./app.js').then(({ handleFileOpen }) => {
                handleFileOpen(activeTab.path);
            });
        }
    }
}

/**
 * Check if file has a specific tag (simplified - would need backend call for accuracy)
 */
function checkFileHasTag(_filePath, _tag) {
    return true;
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
    initKanban,
    refreshKanbanData,
    renderKanbanBoard
};
