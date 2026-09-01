import { calendarDayState, isoWeekday, overlayCalendarLinkedNotes } from './calendarModel.js';
import { isISODate } from './dueDateModel.js';

export {
    CALENDAR_TIMELINE_DAYS_BEFORE, CALENDAR_TIMELINE_DAY_COUNT, CALENDAR_TIMELINE_PAGE_DAYS,
    CALENDAR_TIMELINE_EDGE_PAGE_DAYS, CALENDAR_TIMELINE_EDGE_THRESHOLD, CALENDAR_TIMELINE_PREFETCH_DAYS,
    CALENDAR_TIMELINE_PAN_THRESHOLD, CALENDAR_TIMELINE_WHEEL_MIN_DAYS,
    calendarTimelineWindow, shiftCalendarTimelineAnchor, shiftCalendarTimelineEdgeAnchor,
    calendarTimelineEdgeDirection, calendarTimelineWheelPlan, calendarTimelinePanPlan,
} from './timelineModel.js';

function normalizedPath(value) {
    return typeof value === 'string' ? value.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '') : '';
}

function validColor(value) {
    const color = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(color) ? color : '';
}

function validIcon(value) {
    const icon = String(value || '').trim();
    return /^[A-Za-z][A-Za-z0-9]*$/.test(icon) ? icon : '';
}

function timelineNote(candidate, appearances) {
    const path = normalizedPath(candidate?.path);
    if (!path) return null;
    const fileName = String(candidate?.name || path.split('/').pop() || path).trim();
    const appearance = appearances?.[path] || {};
    return {
        path,
        name: fileName,
        label: fileName.replace(/\.md$/i, '') || fileName,
        line: Math.max(1, Math.floor(Number(candidate?.line_num) || 1)),
        mtime: Number.isFinite(Number(candidate?.mtime)) ? Number(candidate.mtime) : 0,
        color: validColor(appearance.color),
        icon: validIcon(appearance.icon),
    };
}

function timelineISOWeekday(date) {
    if (!isISODate(date)) return 0;
    const [year, month, day] = date.split('-').map(Number);
    return isoWeekday(year, month - 1, day);
}

/**
 * Merge saved range rows with unsaved buffers and direct note appearance.
 * Empty dates are materialized here so the backend payload stays activity-only.
 */
export function calendarTimelinePresentation({
    payload,
    range,
    appearances = {},
    currentByPath = new Map(),
    today = '',
    weekend = [6, 7],
} = {}) {
    if (!range?.dates?.length) return { days: [] };
    const requestedDates = new Set(range.dates);
    const savedByDate = new Map();
    for (const candidate of Array.isArray(payload?.days) ? payload.days : []) {
        const date = String(candidate?.date || '');
        if (!requestedDates.has(date) || savedByDate.has(date)) continue;
        savedByDate.set(date, Array.isArray(candidate.notes) ? candidate.notes : []);
    }

    const days = range.dates.map(date => {
        const merged = overlayCalendarLinkedNotes(savedByDate.get(date) || [], date, currentByPath);
        const seen = new Set();
        const notes = [];
        for (const candidate of merged) {
            const note = timelineNote(candidate, appearances);
            if (!note || seen.has(note.path)) continue;
            seen.add(note.path);
            notes.push(note);
        }
        return {
            date,
            isToday: date === today,
            isPast: isISODate(today) && date < today,
            isWeekend: calendarDayState({
                isoDay: timelineISOWeekday(date),
                weekend,
                noteCount: 0,
                dueTitles: [],
            }).isWeekend,
            notes,
        };
    });
    return { days };
}
