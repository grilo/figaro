import { isISODate } from './dueDateModel.js';

const DEFAULT_WEEK_INFO = Object.freeze({ firstDay: 1, weekend: Object.freeze([6, 7]) });
const FALLBACK_WEEKDAYS = Object.freeze([
    Object.freeze({ short: 'Mon', long: 'Monday' }),
    Object.freeze({ short: 'Tue', long: 'Tuesday' }),
    Object.freeze({ short: 'Wed', long: 'Wednesday' }),
    Object.freeze({ short: 'Thu', long: 'Thursday' }),
    Object.freeze({ short: 'Fri', long: 'Friday' }),
    Object.freeze({ short: 'Sat', long: 'Saturday' }),
    Object.freeze({ short: 'Sun', long: 'Sunday' }),
]);

export function normalizeWeekInfo(value) {
    const firstDay = Number(value?.firstDay);
    const weekend = Array.isArray(value?.weekend)
        ? [...new Set(value.weekend.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b)
        : [];
    if (!Number.isInteger(firstDay) || firstDay < 1 || firstDay > 7 || weekend.length === 0) {
        return { firstDay: DEFAULT_WEEK_INFO.firstDay, weekend: [...DEFAULT_WEEK_INFO.weekend] };
    }
    return { firstDay, weekend };
}

export function localeWeekInfo(locale, LocaleConstructor = globalThis.Intl?.Locale) {
    if (typeof LocaleConstructor !== 'function') return normalizeWeekInfo(null);
    try {
        const localeValue = new LocaleConstructor(locale);
        const value = typeof localeValue.getWeekInfo === 'function'
            ? localeValue.getWeekInfo()
            : localeValue.weekInfo;
        return normalizeWeekInfo(value);
    } catch (_) {
        return normalizeWeekInfo(null);
    }
}

export function localeWeekdays(locale, firstDay, DateTimeFormatConstructor = globalThis.Intl?.DateTimeFormat) {
    const normalizedFirstDay = normalizeWeekInfo({ firstDay, weekend: [6, 7] }).firstDay;
    let weekdays = FALLBACK_WEEKDAYS.map(day => ({ ...day }));
    if (typeof DateTimeFormatConstructor === 'function') {
        try {
            const shortFormat = new DateTimeFormatConstructor(locale, { weekday: 'short', timeZone: 'UTC' });
            const longFormat = new DateTimeFormatConstructor(locale, { weekday: 'long', timeZone: 'UTC' });
            weekdays = weekdays.map((_, index) => {
                const date = new Date(Date.UTC(2024, 0, 1 + index));
                return { short: shortFormat.format(date), long: longFormat.format(date) };
            });
        } catch (_) {
            // Invalid or unavailable locale data keeps the deterministic labels.
        }
    }
    const offset = normalizedFirstDay - 1;
    return weekdays.map((_, index) => weekdays[(offset + index) % weekdays.length]);
}

export function isoWeekday(year, monthIndex, day) {
    const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
    return weekday === 0 ? 7 : weekday;
}

export function calendarMonthGrid(year, monthIndex, firstDay) {
    const normalizedFirstDay = normalizeWeekInfo({ firstDay, weekend: [6, 7] }).firstDay;
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const leadingDays = (isoWeekday(year, monthIndex, 1) - normalizedFirstDay + 7) % 7;
    const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: cellCount }, (_, index) => {
        const day = index - leadingDays + 1;
        return day >= 1 && day <= daysInMonth ? day : 0;
    });
    const weeks = [];
    for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
    return weeks;
}

export function calendarSessionSelectionPlan(selectedDateStr, todayStr) {
    if (isISODate(selectedDateStr)) {
        return { selectedDateStr, initializeFromToday: false };
    }
    if (isISODate(todayStr)) {
        return { selectedDateStr: todayStr, initializeFromToday: true };
    }
    return { selectedDateStr: null, initializeFromToday: false };
}

export function noteIntensityLevel(noteCount) {
    const count = Math.max(0, Math.floor(Number(noteCount) || 0));
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 6) return 3;
    if (count <= 9) return 4;
    return 5;
}

export function calendarMonthSummaryMap(data) {
    const summaries = new Map();
    const hasStructuredSummaries = Array.isArray(data?.day_summaries);
    const ensure = day => {
        if (!summaries.has(day)) summaries.set(day, { noteCount: 0, dueTitles: [], hasDue: false });
        return summaries.get(day);
    };
    for (const raw of hasStructuredSummaries ? data.day_summaries : []) {
        const day = Number(raw?.day);
        if (!Number.isInteger(day) || day < 1 || day > 31) continue;
        const summary = ensure(day);
        summary.noteCount = Math.max(summary.noteCount, Math.max(0, Math.floor(Number(raw?.note_count) || 0)));
        for (const title of Array.isArray(raw?.due_titles) ? raw.due_titles : []) {
            const normalized = String(title || '').trim() || 'Untitled task';
            if (!summary.dueTitles.includes(normalized)) summary.dueTitles.push(normalized);
        }
        summary.hasDue ||= summary.dueTitles.length > 0;
    }
    if (!hasStructuredSummaries) {
        for (const source of [data?.days_with_notes, data?.days_with_links]) {
            for (const value of Array.isArray(source) ? source : []) {
                const day = Number(value);
                if (Number.isInteger(day) && day >= 1 && day <= 31) ensure(day).noteCount = Math.max(1, ensure(day).noteCount);
            }
        }
        for (const value of Array.isArray(data?.days_with_due_tasks) ? data.days_with_due_tasks : []) {
            const day = Number(value);
            if (Number.isInteger(day) && day >= 1 && day <= 31) ensure(day).hasDue = true;
        }
    }
    return summaries;
}

const calendarDateLinkPattern = /\[[^\]\r\n]*\]\((\d{4}-\d{2}-\d{2})\.md\)|\[\[(\d{4}-\d{2}-\d{2})(?:\.md)?(?:\|[^\]\r\n]*)?\]\]/gi;

/**
 * Project the distinct calendar-note associations contributed by one Markdown
 * buffer. Daily-note identity and ordinary date links are one association per
 * file/date. Task deadlines are separate metadata, never special Markdown links.
 */
export function calendarNoteAssociations(path, content) {
    const normalizedPath = String(path || '').replaceAll('\\', '/');
    if (!normalizedPath) return [];
    const name = normalizedPath.split('/').pop() || normalizedPath;
    const lines = String(content || '').split('\n');
    const associations = new Map();
    const dailyMatch = /^(\d{4}-\d{2}-\d{2})\.md$/i.exec(name);
    if (dailyMatch && isISODate(dailyMatch[1])) {
        associations.set(dailyMatch[1], {
            date: dailyMatch[1],
            path: normalizedPath,
            name,
            line_num: 1,
            snippet: String(lines[0] || '').trim(),
        });
    }

    lines.forEach((line, index) => {
        calendarDateLinkPattern.lastIndex = 0;
        let match;
        while ((match = calendarDateLinkPattern.exec(line)) !== null) {
            const date = match[1] || match[2];
            if (!isISODate(date) || associations.has(date)) continue;
            associations.set(date, {
                date,
                path: normalizedPath,
                name,
                line_num: index + 1,
                snippet: line.trim(),
            });
        }
    });

    return [...associations.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function monthPrefix(year, month) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`;
}

function associationsForMonth(associations, prefix) {
    return new Set((associations || [])
        .map(association => String(association?.date || ''))
        .filter(date => date.startsWith(prefix)));
}

/** Replace saved note contributions for dirty files with their current buffers. */
export function overlayCalendarMonthNotes(data, year, month, baselineByPath = new Map(), currentByPath = new Map()) {
    const summaries = calendarMonthSummaryMap(data);
    const prefix = monthPrefix(year, month);
    for (const [path, current] of currentByPath) {
        const baselineDates = associationsForMonth(baselineByPath.get(path), prefix);
        const currentDates = associationsForMonth(current, prefix);
        const changedDates = new Set([...baselineDates, ...currentDates]);
        for (const date of changedDates) {
            const day = Number(date.slice(-2));
            const saved = summaries.get(day) || { noteCount: 0, dueTitles: [], hasDue: false };
            const noteCount = Math.max(0, saved.noteCount - Number(baselineDates.has(date)) + Number(currentDates.has(date)));
            if (noteCount || saved.hasDue || saved.dueTitles.length) {
                summaries.set(day, { ...saved, noteCount });
            } else {
                summaries.delete(day);
            }
        }
    }
    return {
        ...data,
        day_summaries: [...summaries.entries()]
            .sort(([left], [right]) => left - right)
            .map(([day, summary]) => ({
                day,
                note_count: summary.noteCount,
                due_titles: [...summary.dueTitles],
            })),
    };
}

/** Make selected-day rows obey the same dirty-file replacement as the grid. */
export function overlayCalendarLinkedNotes(savedNotes, date, currentByPath = new Map()) {
    const dirtyPaths = new Set(currentByPath.keys());
    const notes = (Array.isArray(savedNotes) ? savedNotes : [])
        .filter(note => !dirtyPaths.has(String(note?.path || '').replaceAll('\\', '/')));
    const seen = new Set(notes.map(note => String(note?.path || '').replaceAll('\\', '/')));
    for (const associations of currentByPath.values()) {
        const association = (associations || []).find(candidate => candidate?.date === date);
        if (!association || seen.has(association.path)) continue;
        seen.add(association.path);
        notes.push({
            path: association.path,
            name: association.name,
            line_num: association.line_num,
            snippet: association.snippet,
            mtime: 0,
        });
    }
    return notes;
}

export function calendarDayState({ isoDay, weekend, noteCount, dueTitles, hasDue = false, hasLink = false, isToday = false }) {
    const normalizedWeekend = normalizeWeekInfo({ firstDay: 1, weekend }).weekend;
    const titles = Array.isArray(dueTitles) ? dueTitles : [];
    const due = Boolean(hasDue || titles.length > 0);
    const count = Math.max(0, Math.floor(Number(noteCount) || 0));
    return {
        isWeekend: normalizedWeekend.includes(Number(isoDay)),
        noteLevel: noteIntensityLevel(count),
        hasDue: due,
        clickable: count > 0 || due || Boolean(hasLink) || Boolean(isToday),
    };
}

export function calendarMonthPresentation({
    year,
    month,
    data,
    selectedDateStr = '',
    todayStr = '',
    firstDay = DEFAULT_WEEK_INFO.firstDay,
    weekend = DEFAULT_WEEK_INFO.weekend,
} = {}) {
    const daysWithLinks = new Set(Array.isArray(data?.days_with_links)
        ? data.days_with_links.map(Number)
        : []);
    const hasStructuredSummaries = Array.isArray(data?.day_summaries);
    const summaries = calendarMonthSummaryMap(data);
    const weeks = calendarMonthGrid(year, month, firstDay).map(week => week.map(day => {
        if (day === 0) return { empty: true };
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const summary = summaries.get(day) || { noteCount: 0, dueTitles: [], hasDue: false };
        const hasLink = !hasStructuredSummaries && daysWithLinks.has(day);
        const isToday = dateStr === todayStr;
        const state = calendarDayState({
            isoDay: isoWeekday(year, month, day),
            weekend,
            noteCount: summary.noteCount,
            dueTitles: summary.dueTitles,
            hasDue: summary.hasDue,
            hasLink,
            isToday,
        });
        return {
            empty: false,
            day,
            dateStr,
            hasLink,
            isSelected: dateStr === selectedDateStr,
            isToday,
            state,
            summary,
        };
    }));
    return { weeks, summaries };
}

export function calendarDayClassName(day) {
    let classes = 'ui-date-picker-day cal-day';
    if (day?.isSelected) classes += ' selected';
    if (day?.state?.isWeekend) classes += ' is-weekend ui-date-picker-day--weekend';
    if (day?.state?.noteLevel) classes += ` has-note ui-date-picker-day--note-${day.state.noteLevel}`;
    if (day?.hasLink) classes += ' has-link';
    if (day?.state?.hasDue) classes += ' has-due-task ui-date-picker-day--due';
    return classes;
}

export function calendarDayLabelParts(day, formattedDate) {
    const labelParts = [formattedDate];
    if (day?.state?.isWeekend) labelParts.push('Weekend');
    if (day?.summary?.noteCount) {
        labelParts.push(`${day.summary.noteCount} ${day.summary.noteCount === 1 ? 'note' : 'notes'}`);
    }
    if (day?.state?.hasDue) {
        labelParts.push(day.summary.dueTitles.length
            ? `${day.summary.dueTitles.length} due ${day.summary.dueTitles.length === 1 ? 'item' : 'items'}: ${day.summary.dueTitles.join('; ')}`
            : 'Due item');
    }
    if (day?.isToday) labelParts.push('Today');
    return labelParts;
}

export function tooltipPosition(anchorRect, tooltipRect, viewport, gap = 6, margin = 8) {
    const width = Math.max(0, Number(tooltipRect?.width) || 0);
    const height = Math.max(0, Number(tooltipRect?.height) || 0);
    const viewportWidth = Math.max(0, Number(viewport?.width) || 0);
    const viewportHeight = Math.max(0, Number(viewport?.height) || 0);
    const anchorLeft = Number(anchorRect?.left) || 0;
    const anchorTop = Number(anchorRect?.top) || 0;
    const anchorBottom = Number(anchorRect?.bottom) || anchorTop;
    const anchorWidth = Math.max(0, Number(anchorRect?.width) || 0);
    const preferredLeft = anchorLeft + (anchorWidth - width) / 2;
    const maxLeft = Math.max(margin, viewportWidth - width - margin);
    const left = Math.min(Math.max(margin, preferredLeft), maxLeft);
    const below = anchorBottom + gap;
    const above = anchorTop - height - gap;
    const preferredTop = below + height <= viewportHeight - margin ? below : above;
    const maxTop = Math.max(margin, viewportHeight - height - margin);
    const top = Math.min(Math.max(margin, preferredTop), maxTop);
    return { left, top };
}
