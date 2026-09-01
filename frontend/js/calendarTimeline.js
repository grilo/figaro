import { calendarTimelinePresentation } from './core/calendarTimelineModel.js';
import {
    calendarTimelineWindow, shiftCalendarTimelineAnchor, shiftCalendarTimelineEdgeAnchor,
    timelineRangeLabel, timelineDayLabels,
} from './core/timelineModel.js';
import { createTimelineViewport, patchTimelineContents } from './timelineViewport.js';
import { localeWeekInfo } from './core/calendarModel.js';
import { isISODate, localISODate } from './core/dueDateModel.js';
import { normalizeFileTreeStyles } from './core/fileTreeModel.js';
import { currentCalendarLocale } from './calendarLocale.js';
import { renderLucideIcon } from './lucideIcons.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function timelineNoteHTML(note, date) {
    const icon = note.icon ? renderLucideIcon(note.icon, {
        size: 14,
        className: 'calendar-timeline-note-icon-svg',
    }) : '';
    const style = note.color ? ` style="--calendar-timeline-note-color:${note.color}"` : '';
    const colorClass = note.color ? ' has-custom-color' : '';
    const iconMarkup = icon
        ? `<span class="calendar-timeline-note-icon" aria-hidden="true">${icon}</span>`
        : '';
    return `<button type="button" class="calendar-timeline-note${colorClass}"
            data-path="${escapeHtml(note.path)}" data-line="${note.line}" data-date="${date}"${style}
            aria-label="Open ${escapeHtml(note.label)} at the first occurrence of ${date}">
        ${iconMarkup}<span class="calendar-timeline-note-label">${escapeHtml(note.label)}</span>
    </button>`;
}

function timelineDayHTML(day, locale) {
    const labels = timelineDayLabels(day.date, locale, day.isToday);
    const state = `${day.isPast ? ' data-past="true"' : ''}${day.isWeekend ? ' data-weekend="true"' : ''}${day.isToday ? ' data-today="true"' : ''}${day.notes.length ? ' data-has-notes="true"' : ''}`;
    const weekendDescription = day.isWeekend ? ', weekend' : '';
    const noteDescription = day.notes.length
        ? `, ${day.notes.length} ${day.notes.length === 1 ? 'note' : 'notes'}`
        : ', no notes';
    return `<article class="calendar-timeline-day" data-date="${day.date}"${state}
            aria-label="${escapeHtml(labels.long)}${weekendDescription}${noteDescription}">
        <div class="calendar-timeline-day-heading" aria-hidden="true">
            <span class="calendar-timeline-weekday">${escapeHtml(labels.weekday)}</span>
            <span class="calendar-timeline-day-number">${escapeHtml(labels.day)}</span>
            <span class="calendar-timeline-month">${escapeHtml(labels.month)}</span>
        </div>
        <span class="calendar-timeline-axis-dot" aria-hidden="true"></span>
        <div class="calendar-timeline-notes">${day.notes.map(note => timelineNoteHTML(note, day.date)).join('')}</div>
    </article>`;
}

/**
 * Calendar Timeline DOM adapter. All native reads and note opening are injected;
 * this controller owns only presentation state, horizontal input, and rendering.
 */
export function createCalendarTimeline(root, {
    loadTimeline,
    loadAppearance,
    openNote,
    currentAssociations = () => new Map(),
    today = () => localISODate(),
    locale = () => currentCalendarLocale(),
    reportError = () => {},
} = {}) {
    if (!root) return null;
    const scroll = root.querySelector('.calendar-timeline-scroll');
    const track = root.querySelector('.calendar-timeline-track');
    const range = root.querySelector('.calendar-timeline-range');
    const message = root.querySelector('.calendar-timeline-message');
    const todayButton = root.querySelector('.calendar-timeline-today');
    const earlierButton = root.querySelector('.calendar-timeline-earlier');
    const laterButton = root.querySelector('.calendar-timeline-later');
    if (!scroll || !track || !range || !message || !todayButton || !earlierButton || !laterButton) return null;

    let anchorDate = '';
    let requestGeneration = 0;
    let disposed = false;
    let hasRendered = false;
    const payloadCache = new Map();
    let appearanceCache = null;

    function timelineDayWidth() {
        const day = track.querySelector('.calendar-timeline-day');
        return day?.getBoundingClientRect().width || 164;
    }

    function renderPresentation(payload, styles, timelineWindow, scrollMode) {
        const resolvedLocale = locale();
        const presentation = calendarTimelinePresentation({
            payload,
            range: timelineWindow,
            appearances: normalizeFileTreeStyles(styles).entries,
            currentByPath: currentAssociations(),
            today: today(),
            weekend: localeWeekInfo(resolvedLocale).weekend,
        });
        const settled = viewport.updateContent(() => {
            patchTimelineContents(track, presentation.days.map(day => timelineDayHTML(day, resolvedLocale)).join(''), 'data-date');
            message.hidden = true;
        }, { mode: scrollMode, date: anchorDate });
        hasRendered = true;
        return settled;
    }

    async function render({
        reload = false,
        scrollMode = 'retain',
        quiet = false,
    } = {}) {
        if (disposed || !isISODate(anchorDate)) return false;
        const timelineWindow = calendarTimelineWindow(anchorDate);
        const key = `${timelineWindow.startDate}\u0000${timelineWindow.endDate}`;
        const nextRangeLabel = timelineRangeLabel(timelineWindow, locale());
        root.setAttribute('aria-busy', 'true');
        if (!quiet) {
            range.textContent = nextRangeLabel;
            message.hidden = false;
            message.dataset.state = 'loading';
            message.textContent = 'Loading timeline…';
        }
        const generation = ++requestGeneration;
        try {
            if (reload) {
                payloadCache.delete(key);
                appearanceCache = null;
            }
            let payloadPromise = payloadCache.get(key);
            if (!payloadPromise) {
                payloadPromise = Promise.resolve(loadTimeline(timelineWindow.startDate, timelineWindow.endDate));
                payloadCache.set(key, payloadPromise);
            }
            if (!appearanceCache) appearanceCache = Promise.resolve(loadAppearance());
            const [payload, styles] = await Promise.all([payloadPromise, appearanceCache]);
            if (disposed || generation !== requestGeneration) return false;
            await renderPresentation(payload, styles, timelineWindow, scrollMode);
            if (disposed || generation !== requestGeneration) return false;
            range.textContent = nextRangeLabel;
            return true;
        } catch (error) {
            payloadCache.delete(key);
            appearanceCache = null;
            if (disposed || generation !== requestGeneration) return false;
            if (!quiet) {
                track.replaceChildren();
                message.hidden = false;
                message.dataset.state = 'error';
                message.textContent = 'Timeline is unavailable right now.';
            }
            reportError(error);
            return false;
        } finally {
            if (!disposed && generation === requestGeneration) root.setAttribute('aria-busy', 'false');
        }
    }

    function activate(requestedAnchor = '') {
        if (!isISODate(anchorDate)) anchorDate = isISODate(requestedAnchor) ? requestedAnchor : today();
        return render({ scrollMode: hasRendered ? 'retain' : 'center' });
    }

    function page(direction) {
        anchorDate = shiftCalendarTimelineAnchor(anchorDate || today(), direction);
        render({ scrollMode: 'center' });
    }

    function returnToToday() {
        anchorDate = today();
        render({ scrollMode: 'center' });
    }

    function showEarlier() {
        page(-1);
    }

    function showLater() {
        page(1);
    }

    function handleClick(event) {
        const note = event.target.closest('.calendar-timeline-note');
        if (!note || !root.contains(note)) return;
        openNote({
            path: note.dataset.path,
            line: Math.max(1, Number(note.dataset.line) || 1),
            date: note.dataset.date,
        });
    }

    async function pageAtEdge(direction) {
        const previousAnchor = anchorDate || today();
        const nextAnchor = shiftCalendarTimelineEdgeAnchor(previousAnchor, direction);
        anchorDate = nextAnchor;
        const rendered = await render({ scrollMode: 'marker', quiet: true });
        if (!rendered && anchorDate === nextAnchor) anchorDate = previousAnchor;
    }

    const viewport = createTimelineViewport({
        scroll, track, daySelector: '.calendar-timeline-day', dayWidth: timelineDayWidth,
        busy: () => disposed || (!hasRendered && root.getAttribute('aria-busy') === 'true'),
        onEdge: pageAtEdge,
    });

    root.addEventListener('click', handleClick);
    todayButton.addEventListener('click', returnToToday);
    earlierButton.addEventListener('click', showEarlier);
    laterButton.addEventListener('click', showLater);

    return {
        activate,
        refresh: () => render(),
        invalidate() {
            payloadCache.clear();
            appearanceCache = null;
        },
        dispose() {
            disposed = true;
            requestGeneration++;
            root.removeEventListener('click', handleClick);
            todayButton.removeEventListener('click', returnToToday);
            earlierButton.removeEventListener('click', showEarlier);
            laterButton.removeEventListener('click', showLater);
            viewport.dispose();
            payloadCache.clear();
            appearanceCache = null;
            track.replaceChildren();
            range.textContent = '';
            message.hidden = true;
            delete message.dataset.state;
            message.textContent = '';
            root.setAttribute('aria-busy', 'false');
        },
        getAnchorDate: () => anchorDate,
    };
}
