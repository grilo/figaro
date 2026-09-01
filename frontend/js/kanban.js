import { backend } from './backend.js';
/**
 * Kanban Module - Task board with drag-drop, column management
 */

import { log } from './log.js';
import { setState, getState } from './state.js';
import { statusBar } from './statusBar.js';
import { confirmDialog, errorDialog, promptDialog } from './dialogs.js';
import { ACCENT_COLOR_PALETTE } from './colorPalette.js';
import { openColorPalettePicker } from './colorPalettePicker.js';
import { openDatePicker } from './datePicker.js';
import { createKanbanGantt } from './kanbanGantt.js';
import { indexTaskSchedules, scheduleForTask } from './core/ganttModel.js';
import {
    dueDatePresentation,
    dueTaskSummary,
    localISODate,
    millisecondsUntilNextLocalDay,
} from './core/dueDateModel.js';
import {
    adjacentKanbanColumn,
    applyKanbanCardOrder,
    kanbanCardOrderRef,
    kanbanCardWindow,
    reorderKanbanCardRefs,
} from './core/kanbanKeyboardModel.js';

let draggedCard = null;
let kanbanColumns = [];
let savedKanbanColumns = ['todo', 'wip', 'done'];
let savedKanbanBoardData = {};
let kanbanColors = {};
const persistedColumns = new Set();
let kanbanBoardRequestId = 0;
let kanbanMutationId = 0;
let liveRefreshFrame = null;
let liveRefreshInitialized = false;
let dueDayTimer = null;
const rememberedKanbanOrder = new Map();
const kanbanRenderStates = new WeakMap();
let workspacePorts = null;
let taskSchedules = [];
let taskScheduleIndex = new Map();
let taskScheduleError = '';
let kanbanViewMode = 'board';
let activeKanbanWorkspace = null;
let scheduleRequestId = 0;

function rememberTaskSchedules(entries) {
    taskSchedules = entries || [];
    taskScheduleIndex = indexTaskSchedules(taskSchedules);
}

const KANBAN_VIRTUAL_THRESHOLD = 120;
const KANBAN_WINDOW_SIZE = 96;
const KANBAN_CARD_STRIDE_ESTIMATE = 91;

export function configureKanbanWorkspace(ports) {
    if (typeof ports?.openTab !== 'function' || typeof ports?.openFile !== 'function') {
        throw new TypeError('Kanban workspace ports are incomplete');
    }
    workspacePorts = Object.freeze({ ...ports });
}

/** One sidebar workspace, two projections, and the application's own footer. */
export function mountKanbanWorkspace(panel, focusCol = null) {
    activeKanbanWorkspace?.dispose();
    panel.innerHTML = `<div class="kanban-view-wrapper">
        <div class="kanban-view-header">
            <div class="ui-segmented-control ui-segmented-control--quiet" role="group" aria-label="Kanban view">
                <button type="button" class="ui-button" data-kanban-view="board">Board</button>
                <button type="button" class="ui-button" data-kanban-view="gantt">Gantt</button>
            </div>
            <p class="kanban-instruction">Tab focuses cards; arrows move them. Enter opens the note, D sets a due date.</p>
        </div>
        <p class="ui-notice ui-notice--danger kanban-schedule-notice" role="alert" hidden></p>
        <div class="kanban-board" id="kanban-board-main"></div><div class="kanban-gantt-host"></div></div>`;
    const board = panel.querySelector('.kanban-board');
    const wrapper = panel.querySelector('.kanban-view-wrapper');
    const gantt = createKanbanGantt(panel.querySelector('.kanban-gantt-host'), {
        async saveSchedule(task, dates, id) {
            if (dirtyKanbanBuffers().has(task.file)) throw new Error('Save changes to this note before scheduling it. Your Markdown has not been changed.');
            const finishActivity = statusBar.beginDelayedActivity();
            ++scheduleRequestId;
            statusBar.set('Saving schedule…');
            try {
                await backend().SetTaskSchedule({ file: task.file, line: task.line, source: task.source }, dates.start, dates.end, id);
                document.dispatchEvent(new CustomEvent('calendar-data-changed'));
                const request = ++scheduleRequestId;
                try {
                    const entries = await backend().GetTaskSchedules();
                    if (request === scheduleRequestId) rememberTaskSchedules(entries);
                }
                catch (error) { throw new Error(`Dates saved, but the view could not refresh. Reopen Kanban to reload them. ${error.message || error}`, { cause: error }); }
                taskScheduleError = '';
                renderKanbanSnapshot(getState('kanbanBoardData') || {});
                statusBar.set('Schedule saved');
                statusBar.clearAfter(1500, 'Schedule saved');
            } catch (error) { statusBar.clear(); throw error; }
            finally { finishActivity(); }
        },
        openTask: task => workspace().openTab(task.file, task.file_name, 'file', { path: task.file, line: task.line }),
        setStatus: text => {
            const region = document.querySelector('.status-right');
            if (region) { region.dataset.mode = 'gantt'; region.setAttribute('aria-label', 'Gantt status'); }
            const content = document.getElementById('gantt-status-content');
            if (content) content.textContent = text;
        },
    });
    function releaseStatus() {
        const region = document.querySelector('.status-right');
        if (region?.dataset.mode === 'gantt') { region.dataset.mode = 'buffer'; region.setAttribute('aria-label', 'Active buffer status'); }
    }
    function selectMode() {
        wrapper.dataset.view = kanbanViewMode;
        board.hidden = kanbanViewMode !== 'board';
        wrapper.querySelector('.kanban-instruction').hidden = kanbanViewMode !== 'board';
        wrapper.querySelectorAll('[data-kanban-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kanbanView === kanbanViewMode)));
        if (kanbanViewMode === 'board') releaseStatus();
        gantt.setActive(kanbanViewMode === 'gantt');
    }
    const switched = event => { if (event.detail?.type !== 'kanban') session.dispose(); };
    const session = {
        update: data => gantt.update(data, taskSchedules, kanbanColors, taskScheduleError),
        dispose() {
            document.removeEventListener('active-tab-changed', switched);
            gantt.dispose(); releaseStatus();
            if (activeKanbanWorkspace === session) activeKanbanWorkspace = null;
        },
    };
    activeKanbanWorkspace = session;
    document.addEventListener('active-tab-changed', switched);
    wrapper.querySelectorAll('[data-kanban-view]').forEach(button => button.addEventListener('click', () => {
        kanbanViewMode = button.dataset.kanbanView; selectMode();
    }));
    applyKanbanPresentationToViews();
    selectMode();
    renderKanbanBoard('kanban-board-main', focusCol);
    return session;
}

function workspace() {
    if (!workspacePorts) throw new Error('Kanban workspace ports were not configured');
    return workspacePorts;
}

export const KANBAN_CARD_TEXT_LIMIT = 120;
export const KANBAN_DENSITIES = ['comfortable', 'compact'];
export const KANBAN_LAYOUTS = ['side-by-side', 'stacked'];

function normalizeKanbanDensity(value) {
    return KANBAN_DENSITIES.includes(value) ? value : 'comfortable';
}

function normalizeKanbanLayout(value) {
    return KANBAN_LAYOUTS.includes(value) ? value : 'side-by-side';
}

/** Apply stored presentation preferences to mounted boards and Settings controls. */
export function applyKanbanPresentationToViews(
    density = getState('kanbanDensity'),
    layout = getState('kanbanLayout'),
) {
    const resolvedDensity = normalizeKanbanDensity(density);
    const resolvedLayout = normalizeKanbanLayout(layout);
    document.querySelectorAll('.kanban-view-wrapper').forEach(view => {
        view.dataset.density = resolvedDensity;
        view.dataset.layout = resolvedLayout;
    });
    document.querySelectorAll('[data-kanban-density]').forEach(button => {
        const selected = button.dataset.kanbanDensity === resolvedDensity;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-kanban-layout]').forEach(button => {
        const selected = button.dataset.kanbanLayout === resolvedLayout;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
}

/** Persist a board density preference without touching task data or layout state. */
export function setKanbanDensity(density) {
    const resolved = normalizeKanbanDensity(density);
    setState('kanbanDensity', resolved);
    applyKanbanPresentationToViews(resolved);
    return resolved;
}

/** Persist the board flow without changing any task data. */
export function setKanbanLayout(layout) {
    const resolved = normalizeKanbanLayout(layout);
    setState('kanbanLayout', resolved);
    applyKanbanPresentationToViews(undefined, resolved);
    return resolved;
}

/** Bind the Kanban controls that live in Settings instead of the board itself. */
export function initKanbanPresentationSettings(root = document) {
    if (!root?.querySelector?.('[data-kanban-density], [data-kanban-layout]')) return;
    if (root.dataset.kanbanPresentationInitialized === 'true') {
        applyKanbanPresentationToViews();
        return;
    }
    root.dataset.kanbanPresentationInitialized = 'true';
    root.addEventListener('click', event => {
        const densityButton = event.target.closest?.('[data-kanban-density]');
        if (densityButton && root.contains(densityButton)) {
            setKanbanDensity(densityButton.dataset.kanbanDensity);
            return;
        }
        const layoutButton = event.target.closest?.('[data-kanban-layout]');
        if (layoutButton && root.contains(layoutButton)) {
            setKanbanLayout(layoutButton.dataset.kanbanLayout);
        }
    });
    applyKanbanPresentationToViews();
}

/**
 * Initialize kanban module
 */
export function initKanban() {
    if (!liveRefreshInitialized) {
        liveRefreshInitialized = true;
        document.addEventListener('file-content-changed', scheduleLiveKanbanRefresh);
        document.addEventListener('task-schedules-changed', () => refreshKanbanData().catch(() => {}));
        document.addEventListener('vault-file-saved', event => {
            const { path, content } = event.detail || {};
            applySavedKanbanSnapshot(path, content);
        });
    }
    applyKanbanPresentationToViews();
    scheduleDueDayRefresh();
    refreshKanbanData().catch(() => {});
}

function scheduleDueDayRefresh() {
    if (dueDayTimer !== null) return;
    dueDayTimer = setTimeout(() => {
        dueDayTimer = null;
        renderKanbanSnapshot(getState('kanbanBoardData') || {});
        document.dispatchEvent(new CustomEvent('local-date-changed'));
        scheduleDueDayRefresh();
    }, millisecondsUntilNextLocalDay());
}

function scheduleLiveKanbanRefresh() {
    if (liveRefreshFrame !== null) return;
    const refresh = () => {
        liveRefreshFrame = null;
        refreshKanbanFromDirtyBuffers();
    };
    // Repaint on the next frame instead of asking the backend to rediscover
    // the vault after every keystroke. The dirty editor snapshots are already
    // in state and are the authoritative source until they are saved.
    liveRefreshFrame = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(refresh)
        : setTimeout(refresh, 0);
}

function standaloneHashtags(line) {
    const matches = [];
    const seen = new Set();
    const expression = /#([a-zA-Z][a-zA-Z0-9_-]*)\b/g;
    let match;
    while ((match = expression.exec(String(line || ''))) !== null) {
        const before = match.index > 0 ? line.slice(0, match.index) : '';
        const after = line.slice(match.index + match[0].length);
        if (before && !/\s$/u.test(before)) continue;
        if (after && !/^\s/u.test(after)) continue;
        const tag = match[1].toLowerCase();
        if (/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(tag) || seen.has(tag)) continue;
        seen.add(tag);
        matches.push(tag);
    }
    return matches;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeDisplayHashtag(value, tag) {
    const expression = new RegExp(`#${escapeRegExp(tag)}\\b`, 'gi');
    return String(value).replace(expression, (match, offset, source) => {
        const before = offset > 0 ? source.slice(0, offset) : '';
        const after = source.slice(offset + match.length);
        if ((before && !/\s$/u.test(before)) || (after && !/^\s/u.test(after))) return match;
        return '';
    }).replace(/\s{2,}/g, ' ').trim();
}

/** Parse one dirty Markdown snapshot using the backend Kanban card contract. */
export function kanbanCardsForBuffer(file, content) {
    const fileName = String(file || '').replaceAll('\\', '/').split('/').pop() || String(file || '');
    const cards = [];
    String(content || '').split('\n').forEach((line, index) => {
        const tags = standaloneHashtags(line);
        const completed = tags.includes('done');
        for (const tag of tags) {
            const display = removeDisplayHashtag(
                line.trim().replace(/^[-*+]\s*\[[ x]\]\s*/i, ''),
                tag
            );
            cards.push({
                source: line,
                file,
                file_name: fileName,
                line: index + 1,
                text: display,
                tag,
                ...(completed ? { completed: true } : {}),
            });
        }
    });
    return cards;
}

function dirtyKanbanBuffers() {
    const snapshots = new Map();
    for (const tab of getState('openTabs') || []) {
        if (tab?.type === 'file' && tab.dirty && tab.path && typeof tab._content === 'string') {
            snapshots.set(tab.path, tab._content);
        }
    }
    return snapshots;
}

/** Replace saved cards for dirty files with their current in-memory cards. */
export function overlayDirtyKanbanBuffers(boardData, snapshots = dirtyKanbanBuffers()) {
    const board = {};
    const dirtyPaths = new Set(snapshots.keys());
    for (const [column, tasks] of Object.entries(boardData || {})) {
        board[column] = (tasks || []).filter(task => !dirtyPaths.has(task.file));
    }
    for (const [file, content] of snapshots) {
        for (const card of kanbanCardsForBuffer(file, content)) {
            if (!board[card.tag]) board[card.tag] = [];
            board[card.tag].push(card);
        }
    }
    return board;
}

function applyRememberedKanbanOrder(boardData) {
    const board = { ...(boardData || {}) };
    for (const [column, refs] of rememberedKanbanOrder) {
        board[column] = applyKanbanCardOrder(board[column] || [], refs);
    }
    return board;
}

function replaceKanbanCardsForFile(boardData, filePath, cards) {
    const board = {};
    for (const [column, tasks] of Object.entries(boardData || {})) {
        board[column] = (tasks || []).filter(task => task.file !== filePath);
    }
    for (const card of cards) {
        if (!board[card.tag]) board[card.tag] = [];
        board[card.tag].push(card);
    }
    return board;
}

function savedColumnsForBoard(boardData) {
    const systemColumns = ['todo', 'wip', 'done'];
    const customColumns = new Set();
    for (const [column, tasks] of Object.entries(boardData || {})) {
        if (!systemColumns.includes(column) && (tasks || []).length) customColumns.add(column);
    }
    return [...customColumns].sort().concat(systemColumns);
}

/**
 * Commit a Figaro-saved buffer into the frontend Kanban snapshot without
 * requesting the complete board again. Native watcher events acknowledge the
 * same write shortly afterwards; app.js skips that redundant reload while
 * external writes continue to use refreshKanbanData().
 */
export function applySavedKanbanSnapshot(filePath, content) {
    const path = String(filePath || '');
    if (!path || typeof content !== 'string') return false;

    // Invalidate an earlier initial/external request before it can replace the
    // just-saved snapshot with stale cards.
    kanbanBoardRequestId++;
    savedKanbanBoardData = replaceKanbanCardsForFile(
        savedKanbanBoardData,
        path,
        kanbanCardsForBuffer(path, content),
    );
    savedKanbanColumns = savedColumnsForBoard(savedKanbanBoardData);
    kanbanColumns = appendDirtyColumns(savedKanbanColumns);
    const boardData = applyRememberedKanbanOrder(overlayDirtyKanbanBuffers(savedKanbanBoardData));
    persistedColumns.clear();
    for (const column of savedKanbanColumns) persistedColumns.add(column);
    setState('kanbanColumns', kanbanColumns);
    setState('kanbanCompletionColumns', [...savedKanbanColumns]);
    setState('kanbanBoardData', boardData);
    renderKanbanSnapshot(boardData);
    // Own saves skip the expensive board refetch, but task references may have
    // shifted. Refresh metadata for the persistent sidebar reminders as well.
    if (typeof backend().GetTaskSchedules === 'function') {
        const request = ++scheduleRequestId;
        Promise.resolve().then(() => backend().GetTaskSchedules()).then(entries => {
            if (request !== scheduleRequestId) return;
            rememberTaskSchedules(entries);
            taskScheduleError = '';
            renderKanbanSnapshot(getState('kanbanBoardData') || {});
        }).catch(error => {
            if (request !== scheduleRequestId) return;
            taskScheduleError = `Couldn’t reload task schedules: ${error.message || error}`;
            activeKanbanWorkspace?.update(getState('kanbanBoardData') || {});
        });
    }
    return true;
}

function appendDirtyColumns(columns) {
    const result = [...columns];
    const seen = new Set(result);
    const discovered = new Set();
    for (const [file, content] of dirtyKanbanBuffers()) {
        for (const card of kanbanCardsForBuffer(file, content)) {
            if (!seen.has(card.tag)) discovered.add(card.tag);
        }
    }
    for (const systemColumn of ['todo', 'wip', 'done']) {
        if (!seen.has(systemColumn)) {
            result.push(systemColumn);
            seen.add(systemColumn);
        }
    }
    const systemIndex = result.findIndex(column => ['todo', 'wip', 'done'].includes(column));
    const insertion = systemIndex < 0 ? result.length : systemIndex;
    result.splice(insertion, 0, ...[...discovered].sort());
    return result;
}

/** Cap card copy without splitting surrogate pairs; the ellipsis is included. */
export function truncateKanbanCardText(value, limit = KANBAN_CARD_TEXT_LIMIT) {
    const text = String(value || '');
    const characters = Array.from(text);
    if (characters.length <= limit) return text;
    return characters.slice(0, Math.max(0, limit - 1)).join('') + '…';
}

// Refresh Kanban from the backend after startup, a save, or a native
// filesystem change. Fetch the board once: its cards also drive the badges and
// any open board rather than each surface issuing its own vault query.
export async function refreshKanbanData({ focusCol = null, container = getBoardContainer() } = {}) {
    const requestId = ++kanbanBoardRequestId;
    const scheduleRequest = ++scheduleRequestId;
    try {
        const [columnResult, savedBoard, schedules] = await Promise.all([
            backend().GetKanbanColumns(),
            backend().GetKanbanBoard(),
            Promise.resolve().then(() => backend().GetTaskSchedules()).then(entries => ({ entries })).catch(error => ({ error })),
        ]);
        if (requestId !== kanbanBoardRequestId) return false;
        applyKanbanColumns(columnResult);
        if (scheduleRequest === scheduleRequestId) {
            rememberTaskSchedules(schedules.entries);
            taskScheduleError = schedules.error ? `Couldn’t load schedules: ${schedules.error.message || schedules.error}. Reopen Kanban to retry; no metadata was changed.` : '';
        }
        savedKanbanBoardData = savedBoard || {};
        const boardData = applyRememberedKanbanOrder(overlayDirtyKanbanBuffers(savedKanbanBoardData));
        setState('kanbanBoardData', boardData);
        persistedColumns.clear();
        for (const column of savedKanbanColumns) persistedColumns.add(column);
        renderKanbanSnapshot(boardData, focusCol, container);
        return true;
    } catch (err) {
        if (requestId !== kanbanBoardRequestId) return false;
        log.error('Failed to refresh Kanban:', err);
        return false;
    }
}

// Reproject the existing saved board with dirty tabs only. This is the hot
// typing path and intentionally never calls the backend.
function refreshKanbanFromDirtyBuffers() {
    const boardData = applyRememberedKanbanOrder(overlayDirtyKanbanBuffers(savedKanbanBoardData));
    kanbanColumns = appendDirtyColumns(savedKanbanColumns);
    setState('kanbanColumns', kanbanColumns);
    setState('kanbanBoardData', boardData);
    renderKanbanSnapshot(boardData);
}

function applyKanbanColumns(result) {
    if (result && result.columns) {
        savedKanbanColumns = [...result.columns];
        kanbanColors = result.colors || {};
    } else {
        savedKanbanColumns = [...(result || [])];
        kanbanColors = {};
    }
    kanbanColumns = appendDirtyColumns(savedKanbanColumns);
    setState('kanbanColumns', kanbanColumns);
    setState('kanbanCompletionColumns', [...savedKanbanColumns]);
}

function renderKanbanBadges(boardData) {
    const container = document.getElementById('kanban-badges');
    if (!container) return;

    let html = '';
    for (const column of kanbanColumns) {
        const count = (boardData[column] || []).length;
        const color = kanbanColors[column];
        if (color && count > 0) {
            html += `<span class="ui-badge badge" style="background:${color};color:var(--button-text)">${count}</span>`;
        }
    }
    const reminder = dueTaskSummary(boardData, localISODate());
    if (reminder.dueToday > 0) {
        html += `<span class="ui-badge ui-badge--warning badge kanban-due-badge">Due ${reminder.dueToday}</span>`;
    }
    container.innerHTML = html;

    const button = document.getElementById('sidebar-kanban');
    if (button) {
        const hasDueToday = reminder.dueToday > 0;
        button.classList.toggle('kanban-due-today', hasDueToday);
        button.dataset.dueTodayCount = String(reminder.dueToday);
        const label = hasDueToday
            ? `Kanban — ${reminder.dueToday} ${reminder.dueToday === 1 ? 'task' : 'tasks'} due today`
            : 'Kanban';
        button.title = label;
        button.setAttribute('aria-label', label);
    }
}

function renderKanbanSnapshot(boardData, focusCol = null, container = getBoardContainer()) {
    const notice = container?.closest('.kanban-view-wrapper')?.querySelector('.kanban-schedule-notice');
    if (notice) { notice.hidden = !taskScheduleError; notice.textContent = taskScheduleError; }
    boardData = Object.fromEntries(Object.entries(boardData || {}).map(([column, cards]) => [column, cards.map(task => {
        const schedule = scheduleForTask(task, taskScheduleIndex);
        return schedule ? { ...task, due_date: schedule.end, start_date: schedule.start } : task;
    })]));
    setState('kanbanBoardData', boardData);
    renderKanbanBadges(boardData);
    activeKanbanWorkspace?.update(boardData);
    if (!container || !container.isConnected) return;
    const boardScroll = {
        left: container.scrollLeft,
        top: container.scrollTop,
        columns: [...container.querySelectorAll('.kanban-column-cards')].map(cards => ({
            column: cards.dataset.column,
            top: cards.scrollTop,
        })),
    };
    renderColumns(container, boardData, focusCol);
    container.scrollLeft = boardScroll.left;
    container.scrollTop = boardScroll.top;
    for (const { column, top } of boardScroll.columns) {
        const cards = container.querySelector(`.kanban-column-cards[data-column="${escapeAttribute(column)}"]`);
        if (cards) cards.scrollTop = top;
    }
    initKanbanDragDrop(container);
    initKanbanKeyboard(container);
    initKanbanWindowing(container);
}

/**
 * Render kanban board
 * @param {string} containerId - Container element ID
 * @param {string} focusCol - Column to highlight (optional)
 */
export async function renderKanbanBoard(containerId, focusCol = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="kanban-loading" role="status" aria-live="polite" aria-label="Loading Kanban board">
        <div class="kanban-skeleton-column" aria-hidden="true"><span class="ui-skeleton kanban-skeleton-heading"></span><span class="ui-skeleton kanban-skeleton-card"></span><span class="ui-skeleton kanban-skeleton-card"></span><span class="ui-skeleton kanban-skeleton-card"></span></div>
        <div class="kanban-skeleton-column" aria-hidden="true"><span class="ui-skeleton kanban-skeleton-heading"></span><span class="ui-skeleton kanban-skeleton-card"></span><span class="ui-skeleton kanban-skeleton-card"></span></div>
        <div class="kanban-skeleton-column" aria-hidden="true"><span class="ui-skeleton kanban-skeleton-heading"></span><span class="ui-skeleton kanban-skeleton-card"></span><span class="ui-skeleton kanban-skeleton-card"></span><span class="ui-skeleton kanban-skeleton-card"></span></div>
    </div>`;
    const refreshed = await refreshKanbanData({ focusCol, container });
    if (!container.isConnected) return;
    // A newer request may already have painted this shared board container.
    // Never replace that valid snapshot with an error from the stale request.
    if (!refreshed) {
        if (!container.querySelector('.kanban-loading')) return;
        container.innerHTML = '<div class="kanban-error">Failed to load board</div>';
        return;
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
    const renderState = {
        allColumns,
        boardData,
        ranges: new Map(),
        rowStrides: new Map(),
    };
    for (const column of allColumns) {
        const tasks = boardData[column] || [];
        const range = tasks.length > KANBAN_VIRTUAL_THRESHOLD
            ? kanbanCardWindow(tasks.length, { windowSize: KANBAN_WINDOW_SIZE })
            : { start: 0, end: tasks.length };
        renderState.ranges.set(column, range);
        renderState.rowStrides.set(column, KANBAN_CARD_STRIDE_ESTIMATE);
        const isSystem = ['todo', 'wip', 'done'].includes(column);
        const isFocused = column === focusCol;
        const selectedColor = ACCENT_COLOR_PALETTE.includes(kanbanColors[column]) ? kanbanColors[column] : '';
        const colorLabel = selectedColor
            ? `Change color for #${column}; selected color ${selectedColor}`
            : `Set color for #${column}; no color selected`;
        const colorIndicator = selectedColor
            ? `<span class="kanban-column-color-indicator" style="--kanban-column-color:${selectedColor}" aria-hidden="true"></span>`
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 0 20"></path><path d="M2 12h20"></path></svg>';
        html += `
            <div class="kanban-column ${isFocused ? 'focused' : ''}" data-column="${column}">
                <div class="kanban-column-header">
                    <span class="kanban-column-title">#${column}</span>
                    <div class="kanban-column-actions">
                        <button class="ui-icon-button ui-icon-button--small kanban-column-btn color-col" title="${escapeAttribute(colorLabel)}" aria-label="${escapeAttribute(colorLabel)}" data-column="${column}" data-selected-color="${selectedColor}">
                            ${colorIndicator}
                        </button>
                        ${!isSystem ? `
                            <button class="ui-icon-button ui-icon-button--small kanban-column-btn rename-col" title="Rename column" data-column="${column}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="ui-icon-button ui-icon-button--small ui-icon-button--danger kanban-column-btn delete-col" title="Delete column" data-column="${column}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="kanban-column-cards" data-column="${column}">
                    ${renderCards(tasks, range, KANBAN_CARD_STRIDE_ESTIMATE)}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    kanbanRenderStates.set(container, renderState);
    
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
    
    initKanbanCardActions(container);

    // Auto-clear focus highlight after 2.5s
    if (focusCol) {
        setTimeout(() => {
            const focusedCol = container.querySelector('.kanban-column.focused');
            if (focusedCol) focusedCol.classList.remove('focused');
        }, 2500);
    }
}

function initKanbanCardActions(root) {
    root.querySelectorAll('.kanban-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.kanban-card-delete, .kanban-card-date-control')) return;
            const filePath = card.dataset.file;
            const lineNum = parseInt(card.dataset.line, 10);
            if (filePath) {
                workspace().openTab(filePath, filePath.split('/').pop(), 'file', { path: filePath, line: lineNum });
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

        const dueButton = card.querySelector('.kanban-card-date-control');
        if (dueButton) {
            dueButton.addEventListener('click', event => {
                event.stopPropagation();
                openTaskDueDatePicker(dueButton, card);
            });
        }
    });
}

/**
 * Show color picker popup near a button
 */
function showColorPicker(anchorBtn, columnName) {
    return openColorPalettePicker(anchorBtn, {
        currentColor: kanbanColors[columnName] || '',
        emptyLabel: 'No color',
        label: `Choose color for #${columnName}`,
        onSelect: color => setColumnColor(columnName, color),
    });
}

/**
 * Set color for a column
 */
async function setColumnColor(columnName, color) {
    const mutationId = beginKanbanMutation();
    try {
        const result = await backend().SetColumnColor(columnName, color);
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
function renderCards(
    tasks,
    range = { start: 0, end: tasks?.length || 0 },
    rowStride = KANBAN_CARD_STRIDE_ESTIMATE,
) {
    if (!tasks || tasks.length === 0) {
        return '<div class="kanban-empty">No tasks</div>';
    }

    const rows = [];
    if (range.start > 0) {
        rows.push(`<div class="kanban-card-spacer" aria-hidden="true"
            style="height:${range.start * rowStride}px"></div>`);
    }
    tasks.slice(range.start, range.end).forEach((task, offset) => {
        const index = range.start + offset;
        const displayText = truncateKanbanCardText(task.text);
        const due = dueDatePresentation(task.due_date, localISODate());
        const schedule = scheduleForTask(task, taskScheduleIndex);
        const dueControl = due
            ? `<button type="button" tabindex="-1" class="ui-button kanban-card-date-control kanban-card-due" data-due-state="${due.state}" data-due-date="${task.due_date}" aria-label="Change due date: ${escapeAttribute(due.label)}" title="Change due date">
                    ${calendarIcon()}<span>${escapeHtml(due.label)}</span>
                </button>`
            : `<button type="button" tabindex="-1" class="ui-icon-button ui-icon-button--small kanban-card-date-control kanban-card-due-action" aria-label="Set due date" title="Set due date">${calendarIcon()}</button>`;
        rows.push(`
        <div class="kanban-card" role="button" tabindex="0"
             aria-label="${escapeAttribute(`${task.text}. Column ${task.tag}. Source ${task.file_name}`)}"
             aria-description="Enter opens the source. Arrow keys move the card. D changes its due date. Delete removes its column tag."
             aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight D Delete"
             aria-posinset="${index + 1}" aria-setsize="${tasks.length}"
             draggable="true" 
             data-file="${escapeAttribute(task.file)}"
             data-line="${task.line}"
             data-tag="${escapeAttribute(task.tag)}"
             data-card-index="${index}"
             data-text="${escapeAttribute(task.text)}">
            <div class="kanban-card-text" title="${escapeAttribute(task.text)}">${escapeHtml(displayText)}</div>
            ${schedule?.start ? `<span class="kanban-card-schedule">Started ${escapeHtml(schedule.start)}</span>` : ''}
            <div class="kanban-card-meta">
                <span class="kanban-card-meta-main">${due ? dueControl : ''}<span class="kanban-card-source">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        ${escapeHtml(task.file_name)}
                    </span></span>
                <span class="kanban-card-actions">${due ? '' : dueControl}<button tabindex="-1" class="ui-icon-button ui-icon-button--small ui-icon-button--danger kanban-card-delete" aria-label="Remove tag">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button></span>
            </div>
        </div>
    `);
    });
    if (range.end < tasks.length) {
        rows.push(`<div class="kanban-card-spacer" aria-hidden="true"
            style="height:${(tasks.length - range.end) * rowStride}px"></div>`);
    }
    return rows.join('');
}

function renderKanbanColumnWindow(container, column, { anchorIndex = 0, selectedIndex = -1 } = {}) {
    const state = kanbanRenderStates.get(container);
    const cardsContainer = container.querySelector(
        `.kanban-column-cards[data-column="${escapeAttribute(column)}"]`,
    );
    const tasks = state?.boardData?.[column] || [];
    if (!state || !cardsContainer) return false;
    const protection = state.focusProtection;
    const protectedIndex = protection?.column === column && Date.now() < protection.until
        ? protection.index
        : -1;
    const range = tasks.length > KANBAN_VIRTUAL_THRESHOLD
        ? kanbanCardWindow(tasks.length, {
            anchorIndex,
            selectedIndex: protectedIndex >= 0 ? protectedIndex : selectedIndex,
            windowSize: KANBAN_WINDOW_SIZE,
        })
        : { start: 0, end: tasks.length };
    state.ranges.set(column, range);
    const rowStride = state.rowStrides.get(column) || KANBAN_CARD_STRIDE_ESTIMATE;
    cardsContainer.innerHTML = renderCards(tasks, range, rowStride);
    initKanbanCardActions(cardsContainer);
    initKanbanCardDrag(cardsContainer);
    initKanbanKeyboard(container, cardsContainer);
    if (
        protectedIndex >= range.start
        && protectedIndex < range.end
        && document.activeElement === document.body
    ) {
        cardsContainer.querySelector(`[data-card-index="${protectedIndex}"]`)
            ?.focus({ preventScroll: true });
    }
    return true;
}

function focusKanbanCardAt(container, column, index) {
    const state = kanbanRenderStates.get(container);
    const tasks = state?.boardData?.[column] || [];
    if (index < 0 || index >= tasks.length) return false;
    let card = container.querySelector(
        `.kanban-column-cards[data-column="${escapeAttribute(column)}"] [data-card-index="${index}"]`,
    );
    if (!card) {
        renderKanbanColumnWindow(container, column, { selectedIndex: index });
        card = container.querySelector(
            `.kanban-column-cards[data-column="${escapeAttribute(column)}"] [data-card-index="${index}"]`,
        );
    }
    if (!card) return false;
    card.focus({ preventScroll: true });
    state.focusProtection = { column, index, until: Date.now() + 500 };
    card.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
}

function focusKanbanCard(container, ref, column) {
    const state = kanbanRenderStates.get(container);
    const candidateColumns = column ? [column] : (state?.allColumns || []);
    for (const candidateColumn of candidateColumns) {
        const index = (state?.boardData?.[candidateColumn] || []).findIndex(card => (
            card.file === ref.file
            && Number(card.line) === Number(ref.line)
            && card.text === ref.text
        ));
        if (index >= 0) return focusKanbanCardAt(container, candidateColumn, index);
    }

    const match = [...(container?.querySelectorAll?.('.kanban-card') || [])].find(card => (
        card.dataset.file === ref.file
        && Number(card.dataset.line) === Number(ref.line)
        && (!column || card.dataset.tag === column)
    ));
    if (!match) return false;
    match.focus({ preventScroll: true });
    match.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
}

async function reorderCardWithKeyboard(container, card, offset) {
    const column = card.dataset.tag;
    const focusedRef = kanbanCardOrderRef(card);
    const state = kanbanRenderStates.get(container);
    const columnCards = state?.boardData?.[column] || [];
    const index = Number(card.dataset.cardIndex);
    const result = reorderKanbanCardRefs(columnCards.map(kanbanCardOrderRef), index, offset);
    if (!result.changed) {
        statusBar.set(offset < 0 ? 'Task is already first' : 'Task is already last');
        return false;
    }

    const mutationId = beginKanbanMutation();
    try {
        statusBar.set('Reordering task…');
        const saved = await backend().SetKanbanCardOrder(column, result.refs);
        if (mutationId !== kanbanMutationId) return false;
        if (!saved?.success) {
            await errorDialog('Couldn’t reorder task', saved?.error, 'The task order was not changed.');
            statusBar.set('Ready');
            return false;
        }
        rememberedKanbanOrder.set(column, result.refs);
        savedKanbanBoardData = {
            ...savedKanbanBoardData,
            [column]: applyKanbanCardOrder(savedKanbanBoardData[column] || [], result.refs),
        };
        const boardData = applyRememberedKanbanOrder(getState('kanbanBoardData') || {});
        setState('kanbanBoardData', boardData);
        renderKanbanSnapshot(boardData, null, container);
        focusKanbanCard(container, focusedRef, column);
        statusBar.set('Task reordered');
        setTimeout(() => statusBar.set('Ready'), 1000);
        return true;
    } catch (error) {
        if (mutationId !== kanbanMutationId) return false;
        log.error('Reorder task failed:', error);
        await errorDialog('Couldn’t reorder task', error, 'The task order was not changed.');
        statusBar.set('Ready');
        return false;
    }
}

function nextKanbanCardLocation(state, column, index, offset) {
    const columnIndex = state.allColumns.indexOf(column);
    if (columnIndex < 0) return null;
    const inColumn = index + offset;
    const currentTasks = state.boardData[column] || [];
    if (inColumn >= 0 && inColumn < currentTasks.length) return { column, index: inColumn };

    for (
        let nextColumnIndex = columnIndex + offset;
        nextColumnIndex >= 0 && nextColumnIndex < state.allColumns.length;
        nextColumnIndex += offset
    ) {
        const nextColumn = state.allColumns[nextColumnIndex];
        const tasks = state.boardData[nextColumn] || [];
        if (tasks.length) {
            return { column: nextColumn, index: offset > 0 ? 0 : tasks.length - 1 };
        }
    }
    return null;
}

function initKanbanKeyboard(container, root = container) {
    root.querySelectorAll('.kanban-card').forEach(card => {
        card.addEventListener('keydown', event => {
            if (event.target !== card || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'Tab') {
                const state = kanbanRenderStates.get(container);
                const target = state && nextKanbanCardLocation(
                    state,
                    card.dataset.tag,
                    Number(card.dataset.cardIndex),
                    event.shiftKey ? -1 : 1,
                );
                if (target) {
                    event.preventDefault();
                    focusKanbanCardAt(container, target.column, target.index);
                }
                return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                reorderCardWithKeyboard(container, card, event.key === 'ArrowUp' ? -1 : 1);
                return;
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const columns = [...container.querySelectorAll('.kanban-column')].map(column => column.dataset.column);
                const target = adjacentKanbanColumn(columns, card.dataset.tag, event.key === 'ArrowLeft' ? -1 : 1);
                if (target) moveCard(card, target, { restoreFocus: true });
                else statusBar.set(event.key === 'ArrowLeft' ? 'Task is already in the first column' : 'Task is already in the last column');
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                card.click();
                return;
            }
            if (event.key.toLowerCase() === 'd') {
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                const dueButton = card.querySelector('.kanban-card-date-control');
                if (dueButton) openTaskDueDatePicker(dueButton, card);
                return;
            }
            if (event.key === 'Delete') {
                event.preventDefault();
                removeTagFromTask(card.dataset.file, Number(card.dataset.line), card.dataset.tag);
            }
        });
    });
}

function openTaskDueDatePicker(anchor, card) {
    openDatePicker({
        anchor,
        value: card.dataset.dueDate || anchor.dataset.dueDate || '',
        returnFocus: card,
        onSelect: dueDate => setTaskDueDate(
            card,
            dueDate,
        ),
    });
}

async function setTaskDueDate(card, dueDate) {
    const filePath = card.dataset.file;
    const lineNum = Number(card.dataset.line);
    const task = (getState('kanbanBoardData')?.[card.dataset.tag] || []).find(item => item.file === filePath && item.line === lineNum);
    if (!task || dirtyKanbanBuffers().has(filePath)) {
        await errorDialog('Save the note first', 'Save your changes before scheduling this task. No task was changed.');
        return;
    }
    const mutationId = beginKanbanMutation();
    try {
        statusBar.set(dueDate ? 'Setting due date…' : 'Clearing due date…');
        await backend().SetTaskDueDate({ file: task.file, line: task.line, source: task.source }, dueDate);
        if (mutationId !== kanbanMutationId) return;
        statusBar.set(dueDate ? 'Due date set' : 'Due date cleared');
        setTimeout(() => statusBar.set('Ready'), 1000);
        document.dispatchEvent(new CustomEvent('calendar-data-changed'));
        if (!await refreshAfterKanbanMutation(mutationId)) return;
        focusKanbanCard(document.getElementById('kanban-board-main'), task, card.dataset.tag);
    } catch (error) {
        if (mutationId !== kanbanMutationId) return;
        log.error('Set task due date failed:', error);
        await errorDialog('Couldn’t update due date', error, 'The due date could not be updated.');
        statusBar.set('Ready');
    }
}

function calendarIcon() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>';
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
        
        initKanbanCardDrag(cardsContainer);
    });
}

function initKanbanCardDrag(root) {
    root.querySelectorAll('.kanban-card').forEach(card => {
        card.addEventListener('dragstart', (event) => {
            draggedCard = card;
            card.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', card.dataset.file);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            draggedCard = null;
        });
    });
}

function scheduleKanbanWindowUpdate(callback) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
    return setTimeout(callback, 0);
}

function initKanbanWindowing(container) {
    const state = kanbanRenderStates.get(container);
    if (!state) return;
    for (const cards of container.querySelectorAll('.kanban-column-cards')) {
        const column = cards.dataset.column;
        if ((state.boardData[column] || []).length <= KANBAN_VIRTUAL_THRESHOLD) continue;
        let frame = 0;
        cards.onscroll = () => {
            if (frame) return;
            frame = scheduleKanbanWindowUpdate(() => {
                frame = 0;
                const activeState = kanbanRenderStates.get(container);
                if (!activeState) return;
                if (
                    Date.now() < (activeState.focusProtection?.until || 0)
                    && cards.contains(document.activeElement)
                ) return;
                const stride = activeState.rowStrides.get(column) || KANBAN_CARD_STRIDE_ESTIMATE;
                const anchorIndex = Math.floor(cards.scrollTop / stride);
                const range = kanbanCardWindow((activeState.boardData[column] || []).length, {
                    anchorIndex,
                    windowSize: KANBAN_WINDOW_SIZE,
                });
                const current = activeState.ranges.get(column);
                if (range.start !== current?.start || range.end !== current?.end) {
                    renderKanbanColumnWindow(container, column, { anchorIndex });
                }
            });
        };
        if (cards.scrollTop > 0) cards.onscroll();
    }

    let boardFrame = 0;
    container.onscroll = () => {
        const wrapper = container.closest('.kanban-view-wrapper');
        if (wrapper?.dataset.layout !== 'stacked' || boardFrame) return;
        boardFrame = scheduleKanbanWindowUpdate(() => {
            boardFrame = 0;
            const activeState = kanbanRenderStates.get(container);
            if (!activeState) return;
            const boardRect = container.getBoundingClientRect();
            for (const cards of container.querySelectorAll('.kanban-column-cards')) {
                const column = cards.dataset.column;
                const tasks = activeState.boardData[column] || [];
                if (tasks.length <= KANBAN_VIRTUAL_THRESHOLD) continue;
                const relativeTop = Math.max(0, boardRect.top - cards.getBoundingClientRect().top);
                const stride = activeState.rowStrides.get(column) || KANBAN_CARD_STRIDE_ESTIMATE;
                const anchorIndex = Math.floor(relativeTop / stride);
                const range = kanbanCardWindow(tasks.length, {
                    anchorIndex,
                    windowSize: KANBAN_WINDOW_SIZE,
                });
                const current = activeState.ranges.get(column);
                if (range.start !== current?.start || range.end !== current?.end) {
                    renderKanbanColumnWindow(container, column, { anchorIndex });
                }
            }
        });
    };
    if (container.scrollTop > 0) container.onscroll();
}

/**
 * Move card to new column
 */
async function moveCard(card, targetColumn, { restoreFocus = false } = {}) {
    const filePath = card.dataset.file;
    const lineNum = parseInt(card.dataset.line, 10);
    const oldTag = card.dataset.tag;
    const focusedRef = kanbanCardOrderRef(card);
    const mutationId = beginKanbanMutation();
    
    try {
        statusBar.set('Moving task...');
        const result = await backend().UpdateTaskTag(filePath, lineNum, oldTag, targetColumn);
        if (mutationId !== kanbanMutationId) return;
        
        if (result.success) {
            statusBar.set('Task moved');
            setTimeout(() => statusBar.set('Ready'), 1000);
            if (!await refreshAfterKanbanMutation(mutationId)) return;
            if (restoreFocus) {
                focusKanbanCard(getBoardContainer(), focusedRef, targetColumn);
            }
            
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
    return ++kanbanMutationId;
}

async function refreshAfterKanbanMutation(mutationId) {
    if (mutationId !== kanbanMutationId) return false;
    const refreshed = await refreshKanbanData();
    return refreshed && mutationId === kanbanMutationId;
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
        const result = await backend().RenameKanbanColumn(oldName, sanitized);
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
        const result = await backend().DeleteKanbanColumn(name);
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
        const result = await backend().RemoveTagFromTask(filePath, lineNum, tag);
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
            workspace().openFile(activeTab.path);
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

function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
