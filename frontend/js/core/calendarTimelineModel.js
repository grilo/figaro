import { calendarDayState, isoWeekday, overlayCalendarLinkedNotes } from './calendarModel.js';
import { isISODate, shiftISODate } from './dueDateModel.js';

export const CALENDAR_TIMELINE_DAYS_BEFORE = 21;
export const CALENDAR_TIMELINE_DAY_COUNT = 42;
export const CALENDAR_TIMELINE_PAGE_DAYS = 14;
export const CALENDAR_TIMELINE_EDGE_PAGE_DAYS = 7;
export const CALENDAR_TIMELINE_EDGE_THRESHOLD = 24;
export const CALENDAR_TIMELINE_PREFETCH_DAYS = 14;
export const CALENDAR_TIMELINE_PAN_THRESHOLD = 4;
export const CALENDAR_TIMELINE_WHEEL_MIN_DAYS = 3;

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

/** Build a centered six-week window with more than two spare weeks per side. */
export function calendarTimelineWindow(anchorDate) {
    if (!isISODate(anchorDate)) return null;
    const startDate = shiftISODate(anchorDate, -CALENDAR_TIMELINE_DAYS_BEFORE);
    const dates = Array.from({ length: CALENDAR_TIMELINE_DAY_COUNT }, (_unused, index) => (
        shiftISODate(startDate, index)
    ));
    return {
        anchorDate,
        startDate,
        endDate: dates.at(-1),
        dates,
    };
}

export function shiftCalendarTimelineAnchor(anchorDate, direction) {
    if (!isISODate(anchorDate)) return '';
    const sign = Math.sign(Number(direction) || 0);
    return sign ? shiftISODate(anchorDate, sign * CALENDAR_TIMELINE_PAGE_DAYS) : anchorDate;
}

export function shiftCalendarTimelineEdgeAnchor(anchorDate, direction) {
    if (!isISODate(anchorDate)) return '';
    const sign = Math.sign(Number(direction) || 0);
    return sign ? shiftISODate(anchorDate, sign * CALENDAR_TIMELINE_EDGE_PAGE_DAYS) : anchorDate;
}

/** Decide whether a genuinely scrollable Timeline entered either prefetch buffer. */
export function calendarTimelineEdgeDirection({
    scrollLeft,
    scrollWidth,
    clientWidth,
    busy = false,
    threshold = CALENDAR_TIMELINE_EDGE_THRESHOLD,
} = {}) {
    if (busy) return 0;
    const width = Math.max(0, Number(scrollWidth) || 0);
    const viewport = Math.max(0, Number(clientWidth) || 0);
    const maximum = Math.max(0, width - viewport);
    const edge = Math.max(0, Number(threshold) || 0);
    if (maximum <= edge * 2) return 0;
    const position = Math.max(0, Math.min(maximum, Number(scrollLeft) || 0));
    if (position <= edge) return -1;
    if (maximum - position <= edge) return 1;
    return 0;
}

/** Normalize either wheel axis into an intentionally brisk three-day minimum. */
export function calendarTimelineWheelPlan({
    deltaX,
    deltaY,
    deltaMode = 0,
    clientWidth = 0,
    dayWidth,
    modified = false,
} = {}) {
    if (modified) return { handled: false, left: 0 };
    const x = Number(deltaX) || 0;
    const y = Number(deltaY) || 0;
    const dominant = Math.abs(x) > Math.abs(y) ? x : y;
    if (!dominant) return { handled: false, left: 0 };
    const minimum = Math.max(1, Number(dayWidth) || 1) * CALENDAR_TIMELINE_WHEEL_MIN_DAYS;
    const mode = Number(deltaMode) || 0;
    const scale = mode === 1
        ? 16
        : (mode === 2 ? Math.max(minimum, Number(clientWidth) || 0) : 1);
    const pixels = dominant * scale;
    return {
        handled: true,
        left: Math.sign(pixels) * Math.max(minimum, Math.abs(pixels)),
    };
}

/** Project one pointer movement onto a bounded horizontal pan position. */
export function calendarTimelinePanPlan({
    startClientX,
    clientX,
    startScrollLeft,
    scrollWidth,
    clientWidth,
    threshold = CALENDAR_TIMELINE_PAN_THRESHOLD,
} = {}) {
    const delta = (Number(clientX) || 0) - (Number(startClientX) || 0);
    const maximum = Math.max(0, (Number(scrollWidth) || 0) - (Number(clientWidth) || 0));
    const target = (Number(startScrollLeft) || 0) - delta;
    return {
        moved: Math.abs(delta) >= Math.max(0, Number(threshold) || 0),
        scrollLeft: Math.max(0, Math.min(maximum, target)),
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
