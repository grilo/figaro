import { backend } from './backend.js';
/**
 * Workspace Home — a daily launchpad assembled from ordinary vault data.
 */

import { getState } from './state.js';
import { log } from './log.js';
import { openTab } from './tabManager.js';
import { fileIcon, folderIcon } from './icons.js';
import { homeCollections, todayPresentation } from './core/homeModel.js';
import { createOpenTodayNote } from './usecases/openTodayNote.js';
import { dueDatePresentation, localISODate, sortTasksByDue } from './core/dueDateModel.js';

export const homeTaskLimit = 6;
export const homeCollectionLimit = 5;

export function renderHome(panel, { now = () => new Date(), locale = undefined } = {}) {
    if (!panel._homeLocalDateHandler) {
        panel._homeLocalDateHandler = () => {
            if (panel.querySelector('.home-view')) renderHome(panel);
        };
        document.addEventListener('local-date-changed', panel._homeLocalDateHandler);
    }
    const renderId = (panel._homeRenderId || 0) + 1;
    panel._homeRenderId = renderId;

    const today = todayPresentation(now(), locale);
    const recentFiles = (getState('recentFiles') || []).filter(item => item?.path);
    const collections = homeCollections({
        tree: getState('fileTreeData') || [],
        recentPaths: recentFiles.map(item => item.path),
        todayPath: today.path,
        rediscoverySeed: today.path,
        limit: homeCollectionLimit,
    });

    panel.innerHTML = `
        <div class="home-view">
            <section class="home-shell" aria-label="Today">
                <header class="home-hero">
                    <div class="home-hero-copy">
                        <p class="home-eyebrow">${escapeHtml(today.eyebrow)}</p>
                        <h1>Today</h1>
                        <p>Capture what is new, review what is waiting, and return to the notes that matter.</p>
                    </div>
                    <div class="home-hero-actions">
                        <button type="button" class="ui-button ui-button--primary home-today-action" data-home-action="today">
                            ${collections.todayExists ? 'Open today’s note' : 'Create today’s note'}
                        </button>
                        <button type="button" class="ui-button home-quick-note-action" data-home-action="quick-note">Quick note</button>
                    </div>
                </header>
                <div class="ui-notice ui-notice--warning home-due-reminder" data-home-due-reminder role="status" hidden></div>
                <p class="home-notice" data-home-notice role="status" aria-live="polite"></p>

                <div class="home-grid">
                    <section class="home-card home-inbox-card">
                        <div class="home-card-heading">
                            <div>
                                <p class="home-card-kicker">Capture</p>
                                <h2>Inbox <span class="ui-badge ui-badge--muted home-card-count">${collections.inboxCount}</span></h2>
                            </div>
                            <button type="button" class="ui-button home-card-action" data-home-action="inbox">Show in tree</button>
                        </div>
                        ${renderInbox(collections.inbox)}
                    </section>

                    <section class="home-card home-tasks-card">
                        <div class="home-card-heading">
                            <div>
                                <p class="home-card-kicker">Next</p>
                                <h2>Open tasks</h2>
                            </div>
                            <button type="button" class="ui-button home-card-action" data-home-action="kanban">Open board</button>
                        </div>
                        <div class="home-task-list" data-home-tasks>
                            <div class="home-loading">Loading tasks…</div>
                        </div>
                    </section>

                    <section class="home-card home-pinned-card">
                        <div class="home-card-heading">
                            <div>
                                <p class="home-card-kicker">Keep close</p>
                                <h2>Pinned</h2>
                            </div>
                        </div>
                        <div class="home-list" data-home-pinned>
                            <div class="home-loading">Loading pinned items…</div>
                        </div>
                        ${renderRediscovery(collections.rediscover)}
                    </section>

                    <section class="home-card home-recent-card">
                        <div class="home-card-heading">
                            <div>
                                <p class="home-card-kicker">Continue</p>
                                <h2>Recent notes</h2>
                            </div>
                        </div>
                        ${renderRecentFiles(recentFiles)}
                    </section>
                </div>
            </section>
        </div>`;

    panel.onclick = event => handleHomeClick(panel, event);
    loadTasks(panel, renderId, today.path.slice(0, -3));
    loadPinnedItems(panel, renderId, today, recentFiles);
}

function renderInbox(inbox) {
    if (!inbox.length) {
        return '<p class="home-empty">Inbox is clear. Quick notes will wait here until you organize them.</p>';
    }
    return `<div class="home-list">
        ${inbox.map(item => renderFileRow(item.path, item.name || item.path.split('/').pop(), 'Inbox')).join('')}
    </div>`;
}

function renderRecentFiles(recentFiles) {
    if (recentFiles.length === 0) {
        return '<p class="home-empty">Open a note and it will appear here for a quick return.</p>';
    }
    return `<div class="home-list">
        ${recentFiles.map(file => renderFileRow(file.path, file.title || file.path.split('/').pop())).join('')}
    </div>`;
}

function renderPinnedItems(items) {
    if (!items.length) {
        return '<p class="home-empty">Pin a note or folder from the file tree to keep it within reach.</p>';
    }
    return items.map(item => item.type === 'directory'
        ? renderDirectoryRow(item.path, item.name || item.path.split('/').pop())
        : renderFileRow(item.path, item.name || item.path.split('/').pop(), 'Pinned note')).join('');
}

function renderRediscovery(item) {
    if (!item) return '';
    const title = item.name || item.path.split('/').pop();
    return `<div class="home-rediscovery">
        <p class="home-card-kicker">Rediscover</p>
        <button type="button" class="home-list-row home-rediscovery-row" data-home-path="${escapeAttr(item.path)}">
            <span class="home-row-icon" aria-hidden="true">${fileIcon(14, 1.6)}</span>
            <span class="home-row-copy">
                <span class="home-row-title">${escapeHtml(title)}</span>
                <span class="home-row-meta">A note from elsewhere in your vault</span>
            </span>
        </button>
    </div>`;
}

function renderFileRow(path, title, meta = path) {
    return `<button type="button" class="home-list-row" data-home-path="${escapeAttr(path)}">
        <span class="home-row-icon" aria-hidden="true">${fileIcon(14, 1.6)}</span>
        <span class="home-row-copy">
            <span class="home-row-title">${escapeHtml(title)}</span>
            <span class="home-row-meta">${escapeHtml(meta)}</span>
        </span>
    </button>`;
}

function renderDirectoryRow(path, title) {
    return `<button type="button" class="home-list-row" data-home-directory="${escapeAttr(path)}">
        <span class="home-row-icon" aria-hidden="true">${folderIcon(14, 1.6)}</span>
        <span class="home-row-copy">
            <span class="home-row-title">${escapeHtml(title)}</span>
            <span class="home-row-meta">Pinned folder</span>
        </span>
    </button>`;
}

async function loadPinnedItems(panel, renderId, today, recentFiles) {
    const target = panel.querySelector('[data-home-pinned]');
    if (!target) return;
    try {
        const styles = await backend().GetFileTreeStyles();
        if (!panel.isConnected || panel._homeRenderId !== renderId) return;
        const collections = homeCollections({
            tree: getState('fileTreeData') || [],
            styles,
            recentPaths: recentFiles.map(item => item.path),
            todayPath: today.path,
            rediscoverySeed: today.path,
            limit: homeCollectionLimit,
        });
        target.innerHTML = renderPinnedItems(collections.pinned);
    } catch (error) {
        log.warn('Unable to load Home pins:', error);
        if (panel.isConnected && panel._homeRenderId === renderId) {
            target.innerHTML = '<p class="home-empty">Pinned items are unavailable right now.</p>';
        }
    }
}

async function loadTasks(panel, renderId, todayDate) {
    const target = panel.querySelector('[data-home-tasks]');
    if (!target) return;

    try {
        const [tasks, dueSummary] = await Promise.all([
            backend().GetHomeTasks(homeTaskLimit),
            backend().GetDueTaskSummary(),
        ]);
        if (!panel.isConnected || panel._homeRenderId !== renderId) return;

        const sortedTasks = sortTasksByDue(tasks, todayDate);
        target.innerHTML = sortedTasks.length
            ? sortedTasks.map(task => renderTaskRow(task, todayDate)).join('')
            : '<p class="home-empty">No unfinished tasks. Add #todo to a line when something needs attention.</p>';
        renderDueReminder(panel, dueSummary);
    } catch (error) {
        log.warn('Unable to load Home tasks:', error);
        if (panel.isConnected && panel._homeRenderId === renderId) {
            target.innerHTML = '<p class="home-empty">Tasks are unavailable right now.</p>';
        }
    }
}

function renderTaskRow(task, todayDate = localISODate()) {
    const path = task.file || task.path;
    if (!path) return '';
    const line = Number.isFinite(Number(task.line)) ? ` data-home-line="${Number(task.line)}"` : '';
    const label = String(task.tag || task.column || 'task').replace(/^#/, '');
    const due = dueDatePresentation(task.due_date, todayDate);
    const dueMarkup = due
        ? `<span class="home-task-due" data-due-state="${due.state}">${escapeHtml(due.label)}</span>`
        : '<span class="home-task-due-spacer" aria-hidden="true"></span>';
    return `<button type="button" class="home-task-row" data-home-path="${escapeAttr(path)}"${line}>
        <span class="home-task-tag">#${escapeHtml(label)}</span>
        <span class="home-task-text">${escapeHtml(task.text || 'Untitled task')}</span>
        ${dueMarkup}
        <span class="home-task-source">${escapeHtml(task.file_name || path.split('/').pop())}</span>
    </button>`;
}

function renderDueReminder(panel, summary) {
    const reminder = panel.querySelector('[data-home-due-reminder]');
    if (!reminder) return;
    const dueToday = Number(summary?.due_today || 0);
    const overdue = Number(summary?.overdue || 0);
    if (dueToday + overdue === 0) {
        reminder.hidden = true;
        reminder.innerHTML = '';
        return;
    }
    const parts = [];
    if (dueToday) parts.push(`${dueToday} due today`);
    if (overdue) parts.push(`${overdue} overdue`);
    reminder.innerHTML = `<span class="home-due-reminder-icon" aria-hidden="true">${calendarIcon()}</span>
        <span><strong>Tasks need attention</strong><small>${parts.join(' · ')}</small></span>
        <button type="button" class="ui-button ui-button--warning" data-home-action="kanban">Review tasks</button>`;
    reminder.hidden = false;
}

function calendarIcon() {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>';
}

async function handleHomeClick(panel, event) {
    const action = event.target.closest('[data-home-action]');
    if (action) {
        if (action.dataset.homeAction === 'kanban') {
            openTab('kanban', 'Kanban', 'kanban');
        } else if (action.dataset.homeAction === 'quick-note') {
            document.getElementById('create-inbox-note')?.click();
        } else if (action.dataset.homeAction === 'inbox') {
            revealDirectory('Inbox');
        } else if (action.dataset.homeAction === 'today') {
            await openToday(panel, action);
        }
        return;
    }

    const directoryButton = event.target.closest('[data-home-directory]');
    if (directoryButton) {
        revealDirectory(directoryButton.dataset.homeDirectory);
        return;
    }

    const noteButton = event.target.closest('[data-home-path]');
    if (noteButton) {
        const line = Number(noteButton.dataset.homeLine);
        await openFile(noteButton.dataset.homePath, undefined, Number.isFinite(line) && line > 0 ? line : undefined);
    }
}

async function openToday(panel, button) {
    if (button.disabled) return;
    const notice = panel.querySelector('[data-home-notice]');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Opening today…';
    notice?.classList.remove('error');
    if (notice) notice.textContent = '';

    const openTodayNote = createOpenTodayNote({
        getTodayPath: () => backend().GetTodayLink(),
        getTree: () => getState('fileTreeData') || [],
        createFile: (path, content) => backend().CreateFile(path, content),
        afterCreate: path => document.dispatchEvent(new CustomEvent('vault-tree-refresh-requested', { detail: { path } })),
        openFile: ({ path, mtime }) => openFile(path, path.split('/').pop(), undefined, mtime),
    });

    try {
        await openTodayNote();
    } catch (error) {
        log.error('Unable to open today’s note:', error);
        if (notice) {
            notice.textContent = error?.message || 'Today’s note could not be opened.';
            notice.classList.add('error');
        }
        if (button.isConnected) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = originalLabel;
            button.focus();
        }
    }
}

function revealDirectory(path) {
    document.dispatchEvent(new CustomEvent('vault-directory-reveal-requested', { detail: { path } }));
}

async function openFile(path, title, line, mtime) {
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
