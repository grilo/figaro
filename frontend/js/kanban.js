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
import { mountFloatingMenu } from './floatingMenu.js';
import { createKanbanGantt } from './kanbanGantt.js';
import { indexTaskSchedules, scheduleForTask, taskScheduleUpdatePlan } from './core/ganttModel.js';
import {
    dueDatePresentation,
    dueTaskSummary,
    localISODate,
    millisecondsUntilNextLocalDay,
    startDatePresentation,
} from './core/dueDateModel.js';
import {
    adjacentKanbanColumn,
    applyKanbanCardOrder,
    calibrateKanbanVirtualLayout,
    createKanbanVirtualLayout,
    kanbanCardOrderRef,
    kanbanCardWindow,
    kanbanVirtualIndexAtOffset,
    kanbanVirtualOffset,
    recordKanbanVirtualMeasurements,
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
let activeKanbanCardMenu = null;
let kanbanCardMenuSequence = 0;

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
            <p class="kanban-instruction">Tab focuses cards; arrows move them. Enter opens the note, S sets a start date, and D sets a due date.</p>
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
        if (kanbanViewMode === 'board') {
            ensureKanbanVirtualLayouts(board);
            releaseStatus();
        }
        gantt.setActive(kanbanViewMode === 'gantt');
    }
    const switched = event => { if (event.detail?.type !== 'kanban') session.deactivate(); };
    const session = {
        update: data => gantt.update(data, taskSchedules, kanbanColors, taskScheduleError),
        activate(nextFocusCol = null) {
            activeKanbanWorkspace = session;
            applyKanbanPresentationToViews();
            selectMode();
            if (nextFocusCol) {
                const focused = board.querySelector(
                    `.kanban-column[data-column="${escapeAttribute(nextFocusCol)}"]`,
                );
                focused?.classList.add('focused');
                setTimeout(() => focused?.classList.remove('focused'), 2500);
            }
        },
        deactivate() {
            closeKanbanCardMenu();
            gantt.setActive(false);
            releaseStatus();
        },
        dispose() {
            document.removeEventListener('active-tab-changed', switched);
            closeKanbanCardMenu();
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
        const geometryChanged = view.dataset.density !== resolvedDensity
            || view.dataset.layout !== resolvedLayout;
        view.dataset.density = resolvedDensity;
        view.dataset.layout = resolvedLayout;
        if (geometryChanged) resetKanbanVirtualLayouts(view.querySelector('.kanban-board'));
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
    closeKanbanCardMenu();
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
    kanbanRenderStates.get(container)?.resizeObserver?.disconnect();
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
        layouts: new Map(),
    };
    for (const column of allColumns) {
        const tasks = boardData[column] || [];
        const layout = createKanbanVirtualLayout(tasks.length, KANBAN_CARD_STRIDE_ESTIMATE);
        const range = tasks.length > KANBAN_VIRTUAL_THRESHOLD
            ? kanbanCardWindow(tasks.length, { windowSize: KANBAN_WINDOW_SIZE })
            : { start: 0, end: tasks.length };
        renderState.ranges.set(column, range);
        renderState.layouts.set(column, layout);
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
                    ${renderCards(tasks, range, layout)}
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
        if (card._kanbanActionsInitialized) return;
        card._kanbanActionsInitialized = true;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.kanban-card-menu-trigger, .kanban-card-date')) return;
            const filePath = card.dataset.file;
            const lineNum = parseInt(card.dataset.line, 10);
            if (filePath) {
                workspace().openTab(filePath, filePath.split('/').pop(), 'file', { path: filePath, line: lineNum });
            }
        });
        
        const menuButton = card.querySelector('.kanban-card-menu-trigger');
        if (menuButton) {
            menuButton.addEventListener('click', event => {
                event.stopPropagation();
                if (activeKanbanCardMenu?.anchor === menuButton) closeKanbanCardMenu();
                else openKanbanCardMenu(menuButton, card);
            });
        }
        card.querySelectorAll('.kanban-card-date').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                openTaskDatePicker(button, card, button.dataset.dateField);
            });
        });
        card.addEventListener('contextmenu', event => {
            event.preventDefault();
            openKanbanCardMenu(menuButton, card);
        });
    });
}

function closeKanbanCardMenu({ restoreFocus = false } = {}) {
    const session = activeKanbanCardMenu;
    if (!session) return;
    activeKanbanCardMenu = null;
    document.removeEventListener('pointerdown', session.outside, true);
    session.placement?.close();
    session.menu.remove();
    session.anchor.setAttribute('aria-expanded', 'false');
    session.anchor.removeAttribute('aria-controls');
    if (restoreFocus && session.card.isConnected) session.card.focus({ preventScroll: true });
}

function openKanbanCardMenu(anchor, card) {
    if (!anchor?.isConnected || !card?.isConnected) return;
    closeKanbanCardMenu();
    const menu = document.createElement('div');
    const menuID = `kanban-card-menu-${++kanbanCardMenuSequence}`;
    menu.id = menuID;
    menu.className = 'ui-menu kanban-card-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Actions for ${card.dataset.text}`);
    const hasSchedule = Boolean(card.dataset.startDate || card.dataset.dueDate);
    menu.innerHTML = `<button type="button" class="ui-menu-item" role="menuitem" data-card-action="clear-dates" ${hasSchedule ? '' : 'disabled'}>
            ${calendarIcon()}<span>Clear start and due dates</span>
        </button>
        <button type="button" class="ui-menu-item danger" role="menuitem" data-card-action="remove">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            <span>Remove from board</span>
        </button>`;
    card.append(menu);
    anchor.setAttribute('aria-controls', menuID);
    anchor.setAttribute('aria-expanded', 'true');
    const placement = mountFloatingMenu(anchor, menu, { maximumWidth: 220 });
    const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const outside = event => {
        if (!menu.contains(event.target) && event.target !== anchor) closeKanbanCardMenu();
    };
    activeKanbanCardMenu = { anchor, card, menu, placement, outside };
    document.addEventListener('pointerdown', outside, true);
    menu.addEventListener('click', event => {
        const action = event.target.closest('[data-card-action]')?.dataset.cardAction;
        if (!action) return;
        event.stopPropagation();
        if (action === 'clear-dates') {
            closeKanbanCardMenu();
            updateTaskSchedule(card, { start: '', end: '' });
        } else if (action === 'remove') {
            closeKanbanCardMenu();
            removeTagFromTask(card.dataset.file, Number(card.dataset.line), card.dataset.tag);
        }
    });
    menu.addEventListener('keydown', event => {
        const index = items.indexOf(document.activeElement);
        if (event.key === 'Escape') {
            event.preventDefault();
            closeKanbanCardMenu({ restoreFocus: true });
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
                : (Math.max(0, index) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
        }
    });
    items[0]?.focus({ preventScroll: true });
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
function renderCard(task, index, cardCount) {
    const displayText = truncateKanbanCardText(task.text);
    const schedule = scheduleForTask(task, taskScheduleIndex);
    const startDate = schedule?.start || task.start_date || '';
    const dueDate = schedule?.end || task.due_date || '';
    const start = startDatePresentation(startDate);
    const due = dueDatePresentation(dueDate, localISODate()) || { state: 'unset', label: 'No due date' };
    const cardLabel = `${task.text}. Column ${task.tag}. ${start.label}. ${due.label}`;
    const dateButton = (field, presentation) => {
        const kind = field === 'start' ? 'start' : 'due';
        const action = presentation.state === 'unset' ? `Set task ${kind} date` : `Change task ${kind} date`;
        return `<button type="button" tabindex="-1" class="ui-button kanban-card-date kanban-card-${kind}" data-date-field="${field}" data-date-state="${presentation.state}" aria-label="${escapeAttribute(`${action}, currently ${presentation.label}`)}" title="${escapeAttribute(action)}">
            ${calendarIcon()}<span>${escapeHtml(presentation.label)}</span>
        </button>`;
    };
    return `<div class="kanban-card" role="button" tabindex="0"
         aria-label="${escapeAttribute(cardLabel)}"
         aria-description="Enter opens the source. Arrow keys move the card. S changes its start date. D changes its due date. Delete removes its column tag. Shift F10 opens task actions."
         aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight S D Delete Shift+F10"
         aria-posinset="${index + 1}" aria-setsize="${cardCount}"
         draggable="true"
         data-file="${escapeAttribute(task.file)}"
         data-line="${task.line}"
         data-tag="${escapeAttribute(task.tag)}"
         data-card-index="${index}"
         data-start-date="${escapeAttribute(startDate)}"
         data-due-date="${escapeAttribute(dueDate)}"
         data-schedule-id="${escapeAttribute(schedule?.id || '')}"
         data-text="${escapeAttribute(task.text)}">
        <div class="kanban-card-header">
            <div class="kanban-card-text" title="${escapeAttribute(task.text)}">${escapeHtml(displayText)}</div>
            <button type="button" tabindex="-1" class="ui-icon-button ui-icon-button--small kanban-card-menu-trigger" aria-label="Task actions" aria-haspopup="menu" aria-expanded="false" title="Task actions">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>
            </button>
        </div>
        <div class="kanban-card-dates">
            ${dateButton('start', start)}
            ${dateButton('end', due)}
        </div>
    </div>`;
}

function spacerHeight(layout, start, end) {
    return Math.max(0, kanbanVirtualOffset(layout, end) - kanbanVirtualOffset(layout, start));
}

function renderCards(tasks, range = { start: 0, end: tasks?.length || 0 }, layout = null) {
    if (!tasks || tasks.length === 0) {
        return '<div class="kanban-empty">No tasks</div>';
    }

    const rows = [];
    if (layout && tasks.length > KANBAN_VIRTUAL_THRESHOLD) {
        rows.push(`<div class="kanban-card-spacer" data-edge="start" aria-hidden="true"
            style="height:${spacerHeight(layout, 0, range.start)}px"></div>`);
    }
    tasks.slice(range.start, range.end).forEach((task, offset) => {
        rows.push(renderCard(task, range.start + offset, tasks.length));
    });
    if (layout && tasks.length > KANBAN_VIRTUAL_THRESHOLD) {
        rows.push(`<div class="kanban-card-spacer" data-edge="end" aria-hidden="true"
            style="height:${spacerHeight(layout, range.end, tasks.length)}px"></div>`);
    }
    return rows.join('');
}

function createKanbanCardElement(task, index, cardCount) {
    const template = document.createElement('template');
    template.innerHTML = renderCard(task, index, cardCount);
    return template.content.firstElementChild;
}

function updateKanbanSpacers(cardsContainer, layout, range) {
    const start = cardsContainer.querySelector('.kanban-card-spacer[data-edge="start"]');
    const end = cardsContainer.querySelector('.kanban-card-spacer[data-edge="end"]');
    if (start) start.style.height = `${spacerHeight(layout, 0, range.start)}px`;
    if (end) end.style.height = `${spacerHeight(layout, range.end, layout.count)}px`;
}

function measureKanbanColumn(cardsContainer, layout, range) {
    if (!layout || layout.count <= KANBAN_VIRTUAL_THRESHOLD) return;
    const measurements = [...cardsContainer.querySelectorAll('.kanban-card')].map(card => {
        const rect = card.getBoundingClientRect();
        const margin = Number.parseFloat(getComputedStyle(card).marginBottom) || 0;
        return { index: Number(card.dataset.cardIndex), height: rect.height + margin };
    }).filter(measurement => measurement.height > 0);
    if (!measurements.length) return;
    if (!layout.calibrated) {
        const average = measurements.reduce((total, measurement) => total + measurement.height, 0)
            / measurements.length;
        calibrateKanbanVirtualLayout(layout, average);
    }
    recordKanbanVirtualMeasurements(layout, measurements);
    layout.measuredWidth = cardsContainer.getBoundingClientRect().width;
    updateKanbanSpacers(cardsContainer, layout, range);
}

function closestRetainedCard(cardsContainer, range) {
    const viewport = cardsContainer.getBoundingClientRect();
    const retained = [...cardsContainer.querySelectorAll('.kanban-card')].filter(card => {
        const index = Number(card.dataset.cardIndex);
        return index >= range.start && index < range.end;
    });
    return retained.find(card => card.getBoundingClientRect().bottom > viewport.top) || retained[0] || null;
}

function resetKanbanVirtualLayouts(container) {
    const state = kanbanRenderStates.get(container);
    if (!state || !container?.isConnected) return;
    const stacked = container.closest('.kanban-view-wrapper')?.dataset.layout === 'stacked';
    const boardViewport = container.getBoundingClientRect();
    const boardAnchor = stacked
        ? [...container.querySelectorAll('.kanban-card')].find(card => (
            card.getBoundingClientRect().bottom > boardViewport.top
        ))
        : null;
    const boardAnchorTop = boardAnchor?.getBoundingClientRect().top;
    for (const cardsContainer of container.querySelectorAll('.kanban-column-cards')) {
        const column = cardsContainer.dataset.column;
        const tasks = state.boardData[column] || [];
        if (tasks.length <= KANBAN_VIRTUAL_THRESHOLD) continue;
        const range = state.ranges.get(column);
        const columnAnchor = stacked ? null : closestRetainedCard(cardsContainer, range);
        const columnAnchorTop = columnAnchor?.getBoundingClientRect().top;
        const layout = createKanbanVirtualLayout(tasks.length, KANBAN_CARD_STRIDE_ESTIMATE);
        state.layouts.set(column, layout);
        measureKanbanColumn(cardsContainer, layout, range);
        if (columnAnchor?.isConnected && Number.isFinite(columnAnchorTop)) {
            const shift = columnAnchor.getBoundingClientRect().top - columnAnchorTop;
            if (Math.abs(shift) > 0.5) cardsContainer.scrollTop += shift;
        }
    }
    if (boardAnchor?.isConnected && Number.isFinite(boardAnchorTop)) {
        const shift = boardAnchor.getBoundingClientRect().top - boardAnchorTop;
        if (Math.abs(shift) > 0.5) container.scrollTop += shift;
    }
}

function ensureKanbanVirtualLayouts(container) {
    const state = kanbanRenderStates.get(container);
    if (!state) return;
    const stale = [...container.querySelectorAll('.kanban-column-cards')].some(cards => {
        const layout = state.layouts.get(cards.dataset.column);
        if (!layout || layout.count <= KANBAN_VIRTUAL_THRESHOLD) return false;
        const width = cards.getBoundingClientRect().width;
        return !layout.calibrated
            || !Number.isFinite(layout.measuredWidth)
            || Math.abs(width - layout.measuredWidth) > 0.5;
    });
    if (stale) resetKanbanVirtualLayouts(container);
}

function reconcileKanbanCards(cardsContainer, tasks, range, layout) {
    const continuityCard = closestRetainedCard(cardsContainer, range);
    const continuityTop = continuityCard?.getBoundingClientRect().top;
    const existing = new Map([...cardsContainer.querySelectorAll('.kanban-card')].map(card => (
        [Number(card.dataset.cardIndex), card]
    )));
    let startSpacer = cardsContainer.querySelector('.kanban-card-spacer[data-edge="start"]');
    let endSpacer = cardsContainer.querySelector('.kanban-card-spacer[data-edge="end"]');
    if (!startSpacer) {
        startSpacer = document.createElement('div');
        startSpacer.className = 'kanban-card-spacer';
        startSpacer.dataset.edge = 'start';
        startSpacer.setAttribute('aria-hidden', 'true');
        cardsContainer.prepend(startSpacer);
    }
    if (!endSpacer) {
        endSpacer = document.createElement('div');
        endSpacer.className = 'kanban-card-spacer';
        endSpacer.dataset.edge = 'end';
        endSpacer.setAttribute('aria-hidden', 'true');
        cardsContainer.append(endSpacer);
    }
    cardsContainer.querySelector('.kanban-empty')?.remove();
    for (const [index, card] of existing) {
        if (index < range.start || index >= range.end) {
            if (activeKanbanCardMenu?.card === card) closeKanbanCardMenu();
            card.remove();
            existing.delete(index);
        }
    }
    let reference = endSpacer;
    for (let index = range.end - 1; index >= range.start; index -= 1) {
        const card = existing.get(index) || createKanbanCardElement(tasks[index], index, tasks.length);
        if (card.nextElementSibling !== reference) cardsContainer.insertBefore(card, reference);
        reference = card;
    }
    if (startSpacer.nextElementSibling !== reference) cardsContainer.insertBefore(startSpacer, reference);
    updateKanbanSpacers(cardsContainer, layout, range);
    measureKanbanColumn(cardsContainer, layout, range);
    if (continuityCard?.isConnected && Number.isFinite(continuityTop)) {
        const shift = continuityCard.getBoundingClientRect().top - continuityTop;
        if (Math.abs(shift) > 0.5) cardsContainer.scrollTop += shift;
    }
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
    const layout = state.layouts.get(column);
    reconcileKanbanCards(cardsContainer, tasks, range, layout);
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
        if (card._kanbanKeyboardInitialized) return;
        card._kanbanKeyboardInitialized = true;
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
            if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
                event.preventDefault();
                openKanbanCardMenu(card.querySelector('.kanban-card-menu-trigger'), card);
                return;
            }
            if (event.key.toLowerCase() === 'd') {
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                const dueButton = card.querySelector('[data-date-field="end"]');
                if (dueButton) openTaskDatePicker(dueButton, card, 'end');
                return;
            }
            if (event.key.toLowerCase() === 's') {
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                const startButton = card.querySelector('[data-date-field="start"]');
                if (startButton) openTaskDatePicker(startButton, card, 'start');
                return;
            }
            if (event.key === 'Delete') {
                event.preventDefault();
                removeTagFromTask(card.dataset.file, Number(card.dataset.line), card.dataset.tag);
            }
        });
    });
}

function openTaskDatePicker(anchor, card, field) {
    const start = field === 'start';
    openDatePicker({
        anchor,
        value: start ? card.dataset.startDate || '' : card.dataset.dueDate || '',
        returnFocus: card,
        ariaLabel: start ? 'Choose start date' : 'Choose due date',
        clearLabel: start ? 'Clear start date' : 'Clear due date',
        shortcutsLabel: start ? 'Start date shortcuts' : 'Due date shortcuts',
        onSelect: date => updateTaskSchedule(card, { [field]: date }),
    });
}

async function updateTaskSchedule(card, changes) {
    const filePath = card.dataset.file;
    const lineNum = Number(card.dataset.line);
    const task = (getState('kanbanBoardData')?.[card.dataset.tag] || []).find(item => item.file === filePath && item.line === lineNum);
    if (!task || dirtyKanbanBuffers().has(filePath)) {
        await errorDialog('Save the note first', 'Save your changes before scheduling this task. No task was changed.');
        return;
    }
    const schedule = scheduleForTask(task, taskScheduleIndex);
    const plan = taskScheduleUpdatePlan({
        start: schedule?.start || task.start_date || card.dataset.startDate || '',
        end: schedule?.end || task.due_date || card.dataset.dueDate || '',
        id: schedule?.id || card.dataset.scheduleId || '',
    }, changes);
    if (!plan) {
        await errorDialog('Couldn’t update schedule', 'The selected date is invalid. No task was changed.');
        return;
    }
    const changedFields = ['start', 'end'].filter(field => Object.hasOwn(changes, field));
    const singleField = changedFields.length === 1 ? changedFields[0] : '';
    const label = singleField === 'start' ? 'start date' : singleField === 'end' ? 'due date' : 'schedule';
    const clearing = singleField ? !changes[singleField] : true;
    const mutationId = beginKanbanMutation();
    try {
        statusBar.set(`${clearing ? 'Clearing' : 'Setting'} ${label}…`);
        await backend().SetTaskSchedule(
            { file: task.file, line: task.line, source: task.source },
            plan.start,
            plan.end,
            plan.id,
        );
        if (mutationId !== kanbanMutationId) return;
        statusBar.set(`${label[0].toUpperCase()}${label.slice(1)} ${clearing ? 'cleared' : 'set'}`);
        setTimeout(() => statusBar.set('Ready'), 1000);
        document.dispatchEvent(new CustomEvent('calendar-data-changed'));
        if (!await refreshAfterKanbanMutation(mutationId)) return;
        focusKanbanCard(document.getElementById('kanban-board-main'), task, card.dataset.tag);
    } catch (error) {
        if (mutationId !== kanbanMutationId) return;
        log.error('Set task schedule failed:', error);
        await errorDialog('Couldn’t update schedule', error, 'The task dates could not be updated.');
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
        if (card._kanbanDragInitialized) return;
        card._kanbanDragInitialized = true;
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
        const layout = state.layouts.get(column);
        measureKanbanColumn(cards, layout, state.ranges.get(column));
        let frame = 0;
        let idleTimer = 0;
        cards.onscroll = () => {
            cards.classList.add('is-scrolling');
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => cards.classList.remove('is-scrolling'), 120);
            if (frame) return;
            frame = scheduleKanbanWindowUpdate(() => {
                frame = 0;
                const activeState = kanbanRenderStates.get(container);
                if (!activeState) return;
                if (
                    Date.now() < (activeState.focusProtection?.until || 0)
                    && cards.contains(document.activeElement)
                ) return;
                const activeLayout = activeState.layouts.get(column);
                const anchorIndex = kanbanVirtualIndexAtOffset(activeLayout, cards.scrollTop);
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
    let boardIdleTimer = 0;
    container.onscroll = () => {
        const wrapper = container.closest('.kanban-view-wrapper');
        if (wrapper?.dataset.layout !== 'stacked') return;
        const columnCards = [...container.querySelectorAll('.kanban-column-cards')];
        columnCards.forEach(cards => cards.classList.add('is-scrolling'));
        clearTimeout(boardIdleTimer);
        boardIdleTimer = setTimeout(() => {
            columnCards.forEach(cards => cards.classList.remove('is-scrolling'));
        }, 120);
        if (boardFrame) return;
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
                const activeLayout = activeState.layouts.get(column);
                const anchorIndex = kanbanVirtualIndexAtOffset(activeLayout, relativeTop);
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

    if (typeof ResizeObserver === 'function') {
        const observedWidths = new WeakMap();
        const resizeObserver = new ResizeObserver(entries => {
            const widthChanged = entries.some(entry => {
                const width = entry.contentRect?.width ?? entry.target.getBoundingClientRect().width;
                const previous = observedWidths.get(entry.target);
                observedWidths.set(entry.target, width);
                return Number.isFinite(previous) && Math.abs(width - previous) > 0.5;
            });
            if (!widthChanged || state.resizeFrame) return;
            state.resizeFrame = scheduleKanbanWindowUpdate(() => {
                state.resizeFrame = 0;
                if (kanbanRenderStates.get(container) === state) resetKanbanVirtualLayouts(container);
            });
        });
        for (const cards of container.querySelectorAll('.kanban-column-cards')) {
            observedWidths.set(cards, cards.getBoundingClientRect().width);
            resizeObserver.observe(cards);
        }
        state.resizeObserver = resizeObserver;
    }
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
