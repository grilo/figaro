import { dateFromISO, isISODate, shiftISODate } from './dueDateModel.js';

export const CALENDAR_TIMELINE_DAYS_BEFORE = 21;
export const CALENDAR_TIMELINE_DAY_COUNT = 42;
export const CALENDAR_TIMELINE_PAGE_DAYS = 14;
export const CALENDAR_TIMELINE_EDGE_PAGE_DAYS = 7;
export const CALENDAR_TIMELINE_EDGE_THRESHOLD = 24;
export const CALENDAR_TIMELINE_PREFETCH_DAYS = 14;
export const CALENDAR_TIMELINE_PAN_THRESHOLD = 4;
export const CALENDAR_TIMELINE_WHEEL_MIN_DAYS = 3;

/** Consecutive inputs accumulate at the destination, not the in-flight frame. */
export function timelineScrollTarget(current, pending, delta, maximum) {
    return Math.max(0, Math.min(Math.max(0, maximum), (pending ?? current) + delta));
}

/** Build a centered six-week window with more than two spare weeks per side. */
export function calendarTimelineWindow(anchorDate, { daysBefore = CALENDAR_TIMELINE_DAYS_BEFORE, dayCount = CALENDAR_TIMELINE_DAY_COUNT } = {}) {
    if (!isISODate(anchorDate)) return null;
    const startDate = shiftISODate(anchorDate, -daysBefore);
    const dates = Array.from({ length: dayCount }, (_unused, index) => (
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

export function timelineRangeLabel(window, locale) {
    const start = dateFromISO(window?.startDate);
    const end = dateFromISO(window?.endDate);
    if (!start || !end) return '';
    const startLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(start);
    const endLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(end);
    return `${startLabel} – ${endLabel}`;
}

export function timelineDayLabels(dateStr, locale, isToday) {
    const date = dateFromISO(dateStr);
    if (!date) return { weekday: '', day: '', month: '', long: dateStr };
    return {
        weekday: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date),
        day: new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date),
        month: isToday ? 'Today' : new Intl.DateTimeFormat(locale, { month: 'short' }).format(date),
        long: new Intl.DateTimeFormat(locale, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        }).format(date),
    };
}
