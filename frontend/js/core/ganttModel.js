import { isISODate, localISODate, shiftISODate } from './dueDateModel.js';
import { CALENDAR_TIMELINE_DAY_COUNT } from './timelineModel.js';

export const GANTT_DAY_WIDTH = 44;
export const GANTT_DAYS = CALENDAR_TIMELINE_DAY_COUNT;
export const GANTT_ROW_HEIGHT = 48;

export function taskKey(task) { return JSON.stringify([task.file, task.line]); }

export function indexTaskSchedules(schedules = []) {
    return new Map(schedules.filter(entry => entry.task).map(entry => [taskKey(entry.task), entry]));
}

// Match the backend's resolved identity exactly. A dirty buffer cannot inherit
// dates from a different task that happens to have taken over the same line.
export function scheduleForTask(task, schedules) {
    const entry = schedules instanceof Map ? schedules.get(taskKey(task))
        : schedules.find(candidate => candidate.task && taskKey(candidate.task) === taskKey(task));
    return entry?.task.source === task.source ? entry : undefined;
}

export function ganttTasks(board, schedules = [], colors = {}) {
    const unique = new Map();
    const scheduleIndex = indexTaskSchedules(schedules);
    for (const [column, cards] of Object.entries(board || {})) {
        for (const card of cards || []) {
            const key = taskKey(card);
            if (unique.has(key) && column !== 'done') continue;
            const schedule = scheduleForTask(card, scheduleIndex);
            const end = schedule ? schedule.end : card.due_date || '';
            unique.set(key, {
                ...card, key, column, color: /^#[\da-f]{6}$/i.test(colors[column] || '') ? colors[column] : '',
                done: column === 'done' || Boolean(card.completed),
                start: schedule ? schedule.start : card.start_date || '', end, scheduleID: schedule?.id || '',
            });
        }
    }
    return [...unique.values()].sort((a, b) => Number(!a.end && !a.start) - Number(!b.end && !b.start));
}

export function dayDistance(from, to) {
    if (!isISODate(from) || !isISODate(to)) return 0;
    return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function ganttBarGeometry(task, firstDay, days = GANTT_DAYS, today = localISODate()) {
    if (!isISODate(task.end) && !isISODate(task.start)) return null;
    const from = task.start || task.end;
    const until = task.end || (today > from ? today : from);
    const start = dayDistance(firstDay, from < until ? from : until);
    const end = dayDistance(firstDay, from > until ? from : until) + 1;
    if (end <= 0 || start >= days) return null;
    return { left: Math.max(0, start) * GANTT_DAY_WIDTH,
        width: (Math.min(days, end) - Math.max(0, start)) * GANTT_DAY_WIDTH,
        clippedStart: start < 0, clippedEnd: end > days };
}

export function moveGanttDates(task, mode, delta, today = localISODate()) {
    const days = Math.round(delta);
    if (!isISODate(task.end) && !isISODate(task.start)) return { start: '', end: '' };
    let start = task.start || '';
    let end = task.end;
    if (mode === 'start') start = shiftISODate(start || end, days);
    else if (mode === 'end') end = shiftISODate(end || (today > start ? today : start), days);
    else { if (start) start = shiftISODate(start, days); if (end) end = shiftISODate(end, days); }
    if (start && end && start > end && mode !== 'move') {
        if (mode === 'start') start = end;
        else end = start;
    }
    return { start, end };
}

export function ganttWindow(count, scrollTop) {
    const start = Math.min(Math.max(0, Math.floor(scrollTop / GANTT_ROW_HEIGHT) - 6), Math.max(0, count - 80));
    return { start, end: Math.min(count, start + 80) };
}

export function ganttSummary(tasks, unresolved = 0) {
    const scheduled = tasks.filter(task => task.end || task.start).length;
    const done = tasks.filter(task => task.done).length;
    return `${scheduled} scheduled · ${tasks.length - scheduled} unscheduled · ${done} done${unresolved ? ` · ${unresolved} need reconnection` : ''}`;
}
