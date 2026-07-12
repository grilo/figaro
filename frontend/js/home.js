/**
 * Home tab - a lightweight workspace overview built from existing Figaro data.
 */

import { getState } from './state.js';
import { log } from './log.js';

const taskLimit = 6;

export function renderHome(panel) {
    const renderId = (panel._homeRenderId || 0) + 1;
    panel._homeRenderId = renderId;

    panel.innerHTML = `
        <div class="home-view">
            <section class="home-shell" aria-label="Workspace home">
                <header class="home-hero">
                    <div>
                        <h1>Your workspace</h1>
                        <p>Pick up a recent note or make a little progress on what is still open.</p>
                    </div>
                </header>

                <div class="home-grid">
                    <section class="home-card home-tasks-card">
                        <div class="home-card-heading">
                            <div>
                                <p class="home-card-kicker">Momentum</p>
                                <h2>Unfinished tasks</h2>
                            </div>
                            <button type="button" class="home-card-action" data-home-action="kanban">Open board</button>
                        </div>
                        <div class="home-task-list" data-home-tasks>
                            <div class="home-loading">Loading tasks…</div>
                        </div>
                    </section>

                    <section class="home-card home-recent-card">
                        <div class="home-card-heading">
                            <div>
                                <p class="home-card-kicker">Notes</p>
                                <h2>Recent</h2>
                            </div>
                        </div>
                        ${renderRecentFiles()}
                    </section>
                </div>
            </section>
        </div>`;

    panel.onclick = (event) => handleHomeClick(panel, event);
    loadTasks(panel, renderId);
}

function renderRecentFiles() {
    const recentFiles = (getState('recentFiles') || []).filter(item => item?.path);
    if (recentFiles.length === 0) {
        return '<p class="home-empty">Open a note and it will appear here for a quick return.</p>';
    }

    return `<div class="home-list">
        ${recentFiles.map(file => renderFileRow(file.path, file.title || file.path.split('/').pop())).join('')}
    </div>`;
}

function renderFileRow(path, title) {
    return `<button type="button" class="home-list-row" data-home-path="${escapeAttr(path)}">
        <span class="home-row-title">${escapeHtml(title)}</span>
        <span class="home-row-meta">${escapeHtml(path)}</span>
    </button>`;
}

async function loadTasks(panel, renderId) {
    const target = panel.querySelector('[data-home-tasks]');
    if (!target) return;

    try {
        const board = await window.pywebview.api.get_kanban_board();
        if (!panel.isConnected || panel._homeRenderId !== renderId) return;

        const tasks = Object.entries(board || {})
            .filter(([column]) => column.toLocaleLowerCase() !== 'done')
            .flatMap(([column, cards]) => (cards || []).map(card => ({ ...card, column })))
            .filter(task => String(task.tag || task.column).toLocaleLowerCase() !== 'done')
            .slice(0, taskLimit);

        target.innerHTML = tasks.length
            ? tasks.map(renderTaskRow).join('')
            : '<p class="home-empty">Nothing is waiting on the board. Nicely done.</p>';
    } catch (error) {
        log.warn('Unable to load Home tasks:', error);
        if (panel.isConnected && panel._homeRenderId === renderId) {
            target.innerHTML = '<p class="home-empty">Tasks are unavailable right now.</p>';
        }
    }
}

function renderTaskRow(task) {
    const path = task.file || task.path;
    if (!path) return '';
    const line = Number.isFinite(Number(task.line)) ? ` data-home-line="${Number(task.line)}"` : '';
    const label = String(task.tag || task.column || 'task').replace(/^#/, '');
    return `<button type="button" class="home-task-row" data-home-path="${escapeAttr(path)}"${line}>
        <span class="home-task-tag">#${escapeHtml(label)}</span>
        <span class="home-task-text">${escapeHtml(task.text || 'Untitled task')}</span>
        <span class="home-task-source">${escapeHtml(task.file_name || path.split('/').pop())}</span>
    </button>`;
}

async function handleHomeClick(panel, event) {
    const action = event.target.closest('[data-home-action]');
    if (action) {
        if (action.dataset.homeAction === 'kanban') {
            const { openTab } = await import('./tabManager.js');
            openTab('kanban', 'Kanban', 'kanban');
        }
        return;
    }

    const noteButton = event.target.closest('[data-home-path]');
    if (noteButton) {
        const line = Number(noteButton.dataset.homeLine);
        await openFile(noteButton.dataset.homePath, undefined, Number.isFinite(line) && line > 0 ? line : undefined);
    }
}

async function openFile(path, title, line, mtime) {
    const { openTab } = await import('./tabManager.js');
    openTab(path, title || path.split('/').pop(), 'file', { path, line, mtime });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default { renderHome };
