import { dateFromISO, localISODate } from './core/dueDateModel.js';
import { localeWeekInfo } from './core/calendarModel.js';
import { currentCalendarLocale } from './calendarLocale.js';
import { openDatePicker, closeDatePicker } from './datePicker.js';
import { enhanceSettingsPicker } from './settingsPicker.js';
import { createTimelineViewport, patchTimelineContents } from './timelineViewport.js';
import { calendarTimelineWindow, shiftCalendarTimelineEdgeAnchor, timelineDayLabels, timelineRangeLabel, CALENDAR_TIMELINE_PREFETCH_DAYS } from './core/timelineModel.js';
import {
    GANTT_DAYS, GANTT_DAY_WIDTH, GANTT_ROW_HEIGHT, ganttBarGeometry,
    ganttTasks, ganttSummary, ganttWindow, moveGanttDates,
} from './core/ganttModel.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
})[char]);

/** DOM/pointer adapter; dates, projection, and geometry live in the pure model. */
export function createKanbanGantt(root, { saveSchedule, openTask, setStatus, now = () => new Date() }) {
    let dateWindow = calendarTimelineWindow(localISODate(now()));
    let firstDay = dateWindow.startDate;
    let centered = false;
    let tasks = [];
    let unresolved = [];
    let active = false;
    let disposed = false;
    let pending = false;
    let loadError = '';
    let drag = null;
    let ignoreClick = false;
    let inspector = null;
    let datePopup = null;
    let picker = null;
    let pendingFocusKey = null;
    let windowKey = '';
    let rowsFrame = null;
    const locale = currentCalendarLocale();
    const { weekend } = localeWeekInfo(locale);
    const dateLabel = date => date ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(dateFromISO(date)) : 'Not set';
    root.className = 'kanban-gantt';
    root.innerHTML = `<div class="kanban-gantt-toolbar">
        <button type="button" class="ui-icon-button" data-range="-7" aria-label="Previous week">‹</button>
        <button type="button" class="ui-button" data-range="today">Today</button>
        <button type="button" class="ui-icon-button" data-range="7" aria-label="Next week">›</button>
        <span class="kanban-gantt-range"></span>
        <span class="kanban-gantt-help">Drag bars to move · Drag ends to resize</span>
        </div><div class="kanban-gantt-notice" hidden></div>
        <div class="kanban-gantt-reconnect" hidden></div>
        <div class="kanban-gantt-scroll" tabindex="0" aria-label="Task timeline; scroll horizontally for dates">
            <div class="kanban-gantt-grid"><div class="kanban-gantt-heading"><strong class="kanban-gantt-name">Tasks</strong><div class="kanban-gantt-days"></div></div><div class="kanban-gantt-rows"></div></div>
        </div><p class="kanban-gantt-empty" role="status" hidden>No tasks yet. Add #todo, #wip, or a custom column tag to a note.</p>`;
    const scroll = root.querySelector('.kanban-gantt-scroll');
    const rows = root.querySelector('.kanban-gantt-rows');
    const empty = root.querySelector('.kanban-gantt-empty');
    const help = root.querySelector('.kanban-gantt-help');
    const notice = root.querySelector('.kanban-gantt-notice');
    notice.hidden = false;
    notice.setAttribute('role', 'status');
    notice.textContent = 'Loading task schedules…';
    const labelWidth = () => root.querySelector('.kanban-gantt-heading > .kanban-gantt-name')?.getBoundingClientRect().width || 210;
    function setDateWindow(anchor) {
        // Narrow Gantt days need more cells than note-pill days to retain the
        // same two-week buffers on either side of a wide desktop viewport.
        const count = Math.max(GANTT_DAYS, Math.ceil(Math.max(0, scroll.clientWidth - labelWidth()) / GANTT_DAY_WIDTH) + 2 * CALENDAR_TIMELINE_PREFETCH_DAYS + 7);
        dateWindow = calendarTimelineWindow(anchor, { dayCount: count, daysBefore: Math.floor(count / 2) });
        firstDay = dateWindow.startDate;
        root.style.setProperty('--gantt-lane-width', `${count * GANTT_DAY_WIDTH}px`);
    }
    const viewport = createTimelineViewport({
        scroll, track: root.querySelector('.kanban-gantt-grid'), daySelector: '.kanban-gantt-day',
        dayWidth: () => GANTT_DAY_WIDTH, inset: labelWidth,
        busy: () => !active || disposed || pending || Boolean(drag) || Boolean(loadError),
        shouldHandleWheel: event => !event.target.closest?.('.kanban-gantt-name'),
        onEdge(direction) {
            return viewport.updateContent(() => {
                setDateWindow(shiftCalendarTimelineEdgeAnchor(dateWindow.anchorDate, direction));
                renderHeading(); renderRows(true);
            });
        },
    });

    function updateStatus() { if (active) setStatus(ganttSummary(tasks, unresolved.length)); }
    function showError(error) {
        notice.className = 'kanban-gantt-notice ui-notice ui-notice--danger';
        notice.hidden = false;
        notice.setAttribute('role', 'alert');
        notice.textContent = error?.message || String(error);
    }
    function closeInspector(restoreFocus = true) {
        if (!inspector) return;
        const key = inspector.dataset.taskKey;
        document.removeEventListener('pointerdown', dismissInspectorOutside, true);
        document.removeEventListener('keydown', dismissInspectorOnEscape);
        if (datePopup?.isConnected) closeDatePicker({ restoreFocus: false });
        datePopup = null;
        picker?.destroy?.(); picker = null;
        inspector.remove(); inspector = null;
        if (restoreFocus) {
            if (pending) pendingFocusKey = key;
            else focusTask(key);
        }
    }

    function dismissInspectorOutside(event) {
        // The calendar is portalled to body, but belongs to this inspector.
        if (inspector?.contains(event.target) || datePopup?.contains(event.target)) return;
        closeInspector(false); // Let the clicked control receive focus and its action.
    }

    function dismissInspectorOnEscape(event) {
        // Nested pickers consume Escape first. Listen on document so dismissal
        // also works if disabling a control during persistence drops its focus.
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        closeInspector();
    }

    function focusTask(key) {
        [...root.querySelectorAll('[data-task]')].find(el => el.dataset.task === key)?.focus({ preventScroll: true });
    }

    async function persist(task, dates, id = task.scheduleID, closeOnSuccess = true) {
        if (pending || disposed || loadError) return false;
        pending = true;
        root.setAttribute('aria-busy', 'true');
        root.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try {
            await saveSchedule(task, dates, id || '');
            if (disposed) return false;
            notice.hidden = true;
            if (closeOnSuccess) closeInspector();
            return true;
        } catch (error) {
            if (!disposed) showError(error);
            return false;
        } finally {
            pending = false;
            if (!disposed) {
                root.removeAttribute('aria-busy');
                root.querySelectorAll('button').forEach(button => { button.disabled = false; });
                renderRows(true);
                if (active && pendingFocusKey) focusTask(pendingFocusKey);
                pendingFocusKey = null;
            }
        }
    }

    function editTask(task, reconnect = null) {
        if (pending || loadError) return;
        closeInspector(false);
        let target = task;
        const dates = { start: reconnect?.start ?? task.start, end: reconnect?.end ?? task.end };
        inspector = document.createElement('section');
        inspector.className = 'ui-menu kanban-gantt-inspector';
        inspector.dataset.taskKey = task.key;
        inspector.setAttribute('role', 'dialog');
        inspector.setAttribute('aria-label', reconnect ? 'Reconnect saved schedule' : 'Edit task schedule');
        const owner = inspector;
        inspector.innerHTML = `<strong>${escape(reconnect ? `Reconnect: ${reconnect.text}` : task.text)}</strong>
            <span class="kanban-gantt-source">${escape(task.file)}:${task.line}</span>
            ${reconnect ? '<label>Task<div class="ui-picker"><button type="button" class="ui-picker-trigger"><span data-picker-value></span><span aria-hidden="true">⌄</span></button><div class="ui-picker-menu ui-menu" hidden></div></div></label>' : ''}
            <div class="kanban-gantt-dates"><label>Start<button type="button" class="ui-button" data-date="start"></button></label>
            <label>End<button type="button" class="ui-button" data-date="end"></button></label></div>
            <p class="kanban-gantt-source">Saved separately from your Markdown. End is the due date; start without end shows ongoing work.</p>
            <p class="ui-notice ui-notice--danger" role="alert" hidden></p>
            <div class="kanban-gantt-inspector-actions">
                <button type="button" class="ui-button" data-edit="open">Open note</button>
                <button type="button" class="ui-button" data-edit="clear">Unscheduled</button>
                ${reconnect ? '<button type="button" class="ui-button ui-button--primary" data-edit="reconnect">Reconnect</button>' : ''}
            </div>`;
        root.appendChild(inspector);
        if (reconnect) {
            picker = enhanceSettingsPicker({
                trigger: inspector.querySelector('.ui-picker-trigger'), menu: inspector.querySelector('.ui-picker-menu'),
                options: tasks.filter(candidate => !candidate.scheduleID).map(candidate => ({ value: candidate.key, label: `${candidate.text} — ${candidate.file}:${candidate.line}` })),
                value: task.key, ariaLabel: 'Reconnect to task',
                onChange: value => { target = tasks.find(candidate => candidate.key === value); },
            });
        }
        const updateDates = () => inspector?.querySelectorAll('[data-date]').forEach(button => {
            button.textContent = dateLabel(dates[button.dataset.date]);
            button.setAttribute('aria-label', `${button.dataset.date === 'start' ? 'Start' : 'End'} date: ${button.textContent}`);
        });
        const applyDates = async (nextDates, control) => {
            if (inspector !== owner || pending || disposed) return;
            if (await persist(target, nextDates, reconnect?.id || target.scheduleID, false)) {
                Object.assign(dates, nextDates);
                if (inspector === owner) updateDates();
            }
            if (inspector === owner && control?.isConnected) control.focus({ preventScroll: true });
        };
        updateDates();
        inspector.addEventListener('click', event => {
            const date = event.target.closest('[data-date]');
            if (date) {
                const field = date.dataset.date;
                datePopup = openDatePicker({ anchor: date, value: dates[field], ariaLabel: `Choose ${field} date`, clearLabel: `Clear ${field} date`, onSelect: value => {
                    if (inspector !== owner || pending || disposed) return;
                    if (reconnect) { dates[field] = value; updateDates(); }
                    else return applyDates({ ...dates, [field]: value }, date);
                } });
                return;
            }
            const action = event.target.closest('[data-edit]')?.dataset.edit;
            if (action === 'open') openTask(target);
            if (action === 'clear') {
                if (reconnect) { dates.start = ''; dates.end = ''; updateDates(); }
                else applyDates({ start: '', end: '' }, event.target.closest('[data-edit]'));
            }
            if (action === 'reconnect') {
                persist(target, dates, reconnect?.id || target.scheduleID);
            }
        });
        document.addEventListener('pointerdown', dismissInspectorOutside, true);
        document.addEventListener('keydown', dismissInspectorOnEscape);
        inspector.querySelector('button')?.focus();
    }

    function renderHeading() {
        const today = localISODate(now());
        const days = dateWindow.dates.map(iso => {
            const date = dateFromISO(iso);
            const isWeekend = weekend.includes(date.getDay() || 7);
            const labels = timelineDayLabels(iso, locale, iso === today);
            return `<div class="kanban-gantt-day${isWeekend ? ' is-weekend' : ''}${iso === today ? ' is-today' : ''}" data-date="${iso}" title="${escape(labels.long)}"><span>${escape(labels.weekday)}</span><strong>${escape(labels.day)}</strong></div>`;
        }).join('');
        patchTimelineContents(root.querySelector('.kanban-gantt-days'), days, 'data-date');
        root.querySelector('.kanban-gantt-range').textContent = timelineRangeLabel(dateWindow, locale);
        // One shared background per row rather than thousands of day-cell nodes.
        const bands = dateWindow.dates.map((iso, index) => {
            const day = dateFromISO(iso).getDay() || 7;
            const tint = weekend.includes(day) ? 'var(--hover-bg)' : 'transparent';
            return `${tint} ${index * GANTT_DAY_WIDTH}px ${(index + 1) * GANTT_DAY_WIDTH}px`;
        });
        root.style.setProperty('--gantt-weekends', `linear-gradient(to right, ${bands.join(',')})`);
        const todayIndex = dateWindow.dates.indexOf(today);
        root.style.setProperty('--gantt-today', todayIndex >= 0 ? `${todayIndex * GANTT_DAY_WIDTH}px` : '-10px');
    }

    function renderRows(force = false) {
        if (drag || disposed) return;
        const range = ganttWindow(tasks.length, scroll.scrollTop);
        const key = `${range.start}:${range.end}`;
        if (!force && key === windowKey) return;
        windowKey = key;
        const focusKey = rows.contains(document.activeElement) ? document.activeElement.dataset.task : null;
        empty.hidden = Boolean(tasks.length);
        help.hidden = !tasks.length;
        if (!tasks.length) { rows.replaceChildren(); return; }
        const markup = `<div data-timeline-key="before" style="height:${range.start * GANTT_ROW_HEIGHT}px" aria-hidden="true"></div>` + tasks.slice(range.start, range.end).map(task => {
            const bar = ganttBarGeometry(task, firstDay, dateWindow.dates.length, localISODate(now()));
            return `<div class="kanban-gantt-row" data-timeline-key="${escape(task.key)}" data-done="${task.done}">
                <div class="kanban-gantt-name"><button type="button" class="ui-button ui-button--quiet" data-task="${escape(task.key)}" title="${escape(`${task.text} — ${task.file}:${task.line}`)}"><span>${task.done ? '✓ ' : ''}${escape(task.text)}</span><small>#${escape(task.column)} · ${escape(task.file_name)}</small></button></div>
                <div class="kanban-gantt-lane">${bar ? `<button type="button" class="ui-button kanban-gantt-bar" data-task="${escape(task.key)}" aria-label="${escape(`${task.text}: ${task.start ? `${dateLabel(task.start)} to ` : ''}${task.end ? dateLabel(task.end) : 'ongoing'}${task.done ? ', done' : ''}`)}" style="left:${bar.left + 3}px;width:${Math.max(10, bar.width - 6)}px;--gantt-color:${task.color || 'var(--accent-color)'}" data-done="${task.done}">
                    ${bar.clippedStart ? '' : '<span class="kanban-gantt-handle" data-resize="start" aria-hidden="true"></span>'}<span class="kanban-gantt-bar-label">${escape(task.text)}</span>${bar.clippedEnd ? '' : '<span class="kanban-gantt-handle" data-resize="end" aria-hidden="true"></span>'}
                </button>` : `<button type="button" class="ui-button ui-button--quiet kanban-gantt-unscheduled" data-task="${escape(task.key)}">${task.end || task.start ? `${escape(dateLabel(task.start || task.end))} · Outside this range` : 'Unscheduled · Set dates'}</button>`}</div></div>`;
        }).join('') + `<div data-timeline-key="after" style="height:${Math.max(0, tasks.length - range.end) * GANTT_ROW_HEIGHT}px" aria-hidden="true"></div>`;
        patchTimelineContents(rows, markup, 'data-timeline-key');
        if (focusKey && !rows.contains(document.activeElement)) focusTask(focusKey);
        rows.querySelectorAll('button').forEach(button => { button.disabled = pending || Boolean(loadError); });
    }

    root.addEventListener('click', event => {
        if (event.target.closest('.kanban-gantt-inspector')) return;
        if (ignoreClick && event.detail !== 0) { ignoreClick = false; return; }
        const range = event.target.closest('[data-range]')?.dataset.range;
        if (range) {
            setDateWindow(range === 'today' ? localISODate(now()) : shiftCalendarTimelineEdgeAnchor(dateWindow.anchorDate, Number(range)));
            renderHeading(); renderRows(true); viewport.center(dateWindow.anchorDate); return;
        }
        const reconnect = event.target.closest('[data-reconnect]');
        if (reconnect) {
            const task = tasks.find(candidate => !candidate.scheduleID);
            if (task) editTask(task, unresolved.find(entry => entry.id === reconnect.dataset.reconnect));
            else showError('There are no tasks without a saved schedule to reconnect to.');
            return;
        }
        const button = event.target.closest('[data-task]');
        if (button) editTask(tasks.find(task => task.key === button.dataset.task));
    });
    const scheduleRows = () => {
        if (rowsFrame !== null || disposed) return;
        const request = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
        rowsFrame = request(() => {
            rowsFrame = null;
            renderRows();
        });
    };
    scroll.addEventListener('scroll', scheduleRows, { passive: true });

    function endDrag(cancel = false) {
        if (!drag) return;
        const previous = drag; drag = null;
        root.classList.remove('is-dragging');
        if (previous.element.hasPointerCapture?.(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId);
        ignoreClick = previous.moved;
        // Keep the native click target alive through pointerup. Replacing a
        // stationary bar here suppresses the browser's subsequent click.
        if (!previous.moved) return;
        renderRows(true);
        if (!cancel && previous.delta) persist(previous.task, moveGanttDates(previous.task, previous.mode, previous.delta, localISODate(now())));
        updateStatus();
    }
    scroll.addEventListener('pointerdown', event => {
        if (event.button !== 0 || pending || loadError) return;
        ignoreClick = false;
        const bar = event.target.closest('.kanban-gantt-bar');
        if (!bar) return; // The shared Calendar timeline widget owns empty-space panning.
        closeInspector(false);
        drag = { element: bar, pointerId: event.pointerId, x: event.clientX, scroll: scroll.scrollLeft,
            task: tasks.find(task => task.key === bar.dataset.task),
            mode: event.target.closest('[data-resize]')?.dataset.resize || 'move', delta: 0, moved: false };
        drag.element.setPointerCapture?.(event.pointerId);
    });
    scroll.addEventListener('pointermove', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const movement = event.clientX - drag.x;
        if (Math.abs(movement) < 4 && !drag.moved) return;
        drag.moved = true;
        root.classList.add('is-dragging');
        event.preventDefault();
        drag.delta = Math.round((movement + scroll.scrollLeft - drag.scroll) / GANTT_DAY_WIDTH);
        const dates = moveGanttDates(drag.task, drag.mode, drag.delta, localISODate(now()));
        const geometry = ganttBarGeometry(dates, firstDay, dateWindow.dates.length);
        if (geometry) {
            drag.element.style.left = `${geometry.left + 3}px`;
            drag.element.style.width = `${Math.max(10, geometry.width - 6)}px`;
        }
        drag.element.querySelector('.kanban-gantt-bar-label').textContent = `${dates.start || dates.end} – ${dates.end}`;
    });
    scroll.addEventListener('pointerup', () => endDrag());
    scroll.addEventListener('pointercancel', () => endDrag(true));
    scroll.addEventListener('lostpointercapture', () => endDrag(true));
    const cancel = event => { if (event.key === 'Escape' && drag) { event.preventDefault(); endDrag(true); } };
    root.addEventListener('keydown', cancel);
    rows.addEventListener('keydown', event => {
        const button = event.target.closest('[data-task]');
        if (!button || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        const index = tasks.findIndex(task => task.key === button.dataset.task);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tasks.length - 1
            : Math.min(tasks.length - 1, Math.max(0, index + (event.key === 'ArrowUp' ? -1 : 1)));
        event.preventDefault();
        scroll.scrollTop = next * GANTT_ROW_HEIGHT;
        renderRows(true);
        [...rows.querySelectorAll('.kanban-gantt-name [data-task]')].find(el => el.dataset.task === tasks[next]?.key)?.focus({ preventScroll: true });
    });

    renderHeading();
    return {
        update(board, schedules, colors, error = '') {
            if (disposed) return;
            endDrag(true);
            tasks = ganttTasks(board, schedules, colors);
            unresolved = schedules.filter(entry => !entry.task && entry.end);
            loadError = error;
            if (loadError) showError(loadError);
            else notice.hidden = true;
            const reconnect = root.querySelector('.kanban-gantt-reconnect');
            reconnect.hidden = !unresolved.length;
            reconnect.innerHTML = unresolved.map(entry => `<button type="button" class="ui-button ui-button--warning" data-reconnect="${escape(entry.id)}">Reconnect ${escape(entry.text)} · ${escape(entry.file)}</button>`).join('');
            renderRows(true); updateStatus();
        },
        setActive(value) {
            active = value; root.hidden = !active;
            if (active) {
                if (!centered) { setDateWindow(dateWindow.anchorDate); renderHeading(); renderRows(true); viewport.center(dateWindow.anchorDate); centered = true; }
                updateStatus();
            } else { viewport.cancelPan(); endDrag(true); closeInspector(false); }
        },
        dispose() {
            active = false;
            viewport.dispose();
            endDrag(true);
            closeInspector(false);
            disposed = true;
            if (rowsFrame !== null) {
                const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
                cancelFrame(rowsFrame);
                rowsFrame = null;
            }
            scroll.removeEventListener('scroll', scheduleRows);
            tasks = [];
            unresolved = [];
            root.replaceChildren();
        },
    };
}
