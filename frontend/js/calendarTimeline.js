import {
    CALENDAR_TIMELINE_PREFETCH_DAYS,
    calendarTimelineEdgeDirection,
    calendarTimelinePanPlan,
    calendarTimelinePresentation,
    calendarTimelineWheelPlan,
    calendarTimelineWindow,
    shiftCalendarTimelineAnchor,
    shiftCalendarTimelineEdgeAnchor,
} from './core/calendarTimelineModel.js';
import { localeWeekInfo } from './core/calendarModel.js';
import { dateFromISO, isISODate, localISODate } from './core/dueDateModel.js';
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

function timelineRangeLabel(window, locale) {
    const start = dateFromISO(window?.startDate);
    const end = dateFromISO(window?.endDate);
    if (!start || !end) return '';
    const startLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(start);
    const endLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(end);
    return `${startLabel} – ${endLabel}`;
}

function timelineDayLabels(dateStr, locale, isToday) {
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
    let edgePaging = false;
    let restoringScroll = false;
    let panSession = null;
    let suppressClick = false;
    let suppressClickTimer = null;
    const payloadCache = new Map();
    let appearanceCache = null;

    function dayTrackLeft(day) {
        return day.getBoundingClientRect().left - track.getBoundingClientRect().left;
    }

    function timelineDayWidth() {
        const day = track.querySelector('.calendar-timeline-day');
        return day?.getBoundingClientRect().width || 164;
    }

    function setScrollLeftImmediately(value) {
        const left = Math.max(0, Number(value) || 0);
        if (typeof scroll.scrollTo === 'function') {
            scroll.scrollTo({ left, top: scroll.scrollTop, behavior: 'instant' });
        } else {
            scroll.scrollLeft = left;
        }
    }

    function nextFrame(callback) {
        return new Promise(resolve => {
            const run = () => {
                callback();
                resolve();
            };
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
            else setTimeout(run, 0);
        });
    }

    function centerAnchor() {
        const anchor = track.querySelector(`[data-date="${CSS.escape(anchorDate)}"]`);
        if (!anchor) return;
        const target = dayTrackLeft(anchor) - ((scroll.clientWidth - anchor.getBoundingClientRect().width) / 2);
        setScrollLeftImmediately(target);
    }

    function captureViewportMarker() {
        const position = scroll.scrollLeft;
        const days = [...track.querySelectorAll('.calendar-timeline-day')];
        const marker = days.find(day => (
            dayTrackLeft(day) + Math.max(1, day.getBoundingClientRect().width) > position
        ))
            || days.at(-1);
        return marker ? {
            date: marker.dataset.date,
            viewportOffset: dayTrackLeft(marker) - position,
        } : null;
    }

    function restoreViewportMarker(marker) {
        if (!marker?.date) return false;
        const day = track.querySelector(`[data-date="${CSS.escape(marker.date)}"]`);
        if (!day) return false;
        setScrollLeftImmediately(dayTrackLeft(day) - marker.viewportOffset);
        return true;
    }

    async function renderPresentation(payload, styles, timelineWindow, {
        scrollMode,
        scrollMarker,
        previousScrollLeft,
    }) {
        const resolvedLocale = locale();
        const presentation = calendarTimelinePresentation({
            payload,
            range: timelineWindow,
            appearances: normalizeFileTreeStyles(styles).entries,
            currentByPath: currentAssociations(),
            today: today(),
            weekend: localeWeekInfo(resolvedLocale).weekend,
        });
        track.innerHTML = presentation.days.map(day => timelineDayHTML(day, resolvedLocale)).join('');
        message.hidden = true;
        restoringScroll = true;
        try {
            await nextFrame(() => {
                if (scrollMode === 'marker' && restoreViewportMarker(scrollMarker)) return;
                if (scrollMode === 'retain') {
                    setScrollLeftImmediately(Math.min(previousScrollLeft, scroll.scrollWidth - scroll.clientWidth));
                    return;
                }
                centerAnchor();
            });
            // Keep programmatic restoration out of edge detection until the
            // browser has dispatched the resulting scroll event in its next frame.
            await nextFrame(() => {});
        } finally {
            restoringScroll = false;
        }
        hasRendered = true;
    }

    async function render({
        reload = false,
        scrollMode = 'retain',
        scrollMarker = null,
        quiet = false,
    } = {}) {
        if (disposed || !isISODate(anchorDate)) return false;
        const timelineWindow = calendarTimelineWindow(anchorDate);
        const key = `${timelineWindow.startDate}\u0000${timelineWindow.endDate}`;
        const previousScrollLeft = scroll.scrollLeft;
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
            await renderPresentation(payload, styles, timelineWindow, {
                scrollMode,
                scrollMarker,
                previousScrollLeft,
            });
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
        if (suppressClick) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick = false;
            return;
        }
        const note = event.target.closest('.calendar-timeline-note');
        if (!note || !root.contains(note)) return;
        openNote({
            path: note.dataset.path,
            line: Math.max(1, Number(note.dataset.line) || 1),
            date: note.dataset.date,
        });
    }

    function handleWheel(event) {
        const plan = calendarTimelineWheelPlan({
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaMode: event.deltaMode,
            clientWidth: scroll.clientWidth,
            dayWidth: timelineDayWidth(),
            modified: event.ctrlKey || event.metaKey || event.altKey,
        });
        if (!plan.handled) return;
        event.preventDefault();
        if (typeof scroll.scrollBy === 'function') {
            scroll.scrollBy({ left: plan.left, behavior: 'smooth' });
        } else {
            scroll.scrollLeft += plan.left;
        }
    }

    function beginPan(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (event.button !== 0 || event.isPrimary === false || target?.closest('button, a, input, textarea, select')) return;
        panSession = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startScrollLeft: scroll.scrollLeft,
            moved: false,
        };
        scroll.classList.add('is-panning');
        scroll.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    function movePan(event) {
        if (!panSession || event.pointerId !== panSession.pointerId) return;
        const plan = calendarTimelinePanPlan({
            startClientX: panSession.startClientX,
            clientX: event.clientX,
            startScrollLeft: panSession.startScrollLeft,
            scrollWidth: scroll.scrollWidth,
            clientWidth: scroll.clientWidth,
        });
        panSession.moved ||= plan.moved;
        if (!panSession.moved) return;
        event.preventDefault();
        setScrollLeftImmediately(plan.scrollLeft);
    }

    function finishPan(event, suppressDraggedClick = false) {
        if (!panSession || event.pointerId !== panSession.pointerId) return;
        const completed = panSession;
        panSession = null;
        scroll.classList.remove('is-panning');
        if (scroll.hasPointerCapture?.(completed.pointerId)) {
            scroll.releasePointerCapture(completed.pointerId);
        }
        if (completed.moved && suppressDraggedClick) {
            suppressClick = true;
            clearTimeout(suppressClickTimer);
            suppressClickTimer = setTimeout(() => { suppressClick = false; }, 0);
            event.preventDefault();
        }
        handleScroll();
    }

    function endPan(event) {
        finishPan(event, true);
    }

    function handleScroll() {
        const direction = calendarTimelineEdgeDirection({
            scrollLeft: scroll.scrollLeft,
            scrollWidth: scroll.scrollWidth,
            clientWidth: scroll.clientWidth,
            busy: edgePaging || restoringScroll || panSession !== null || root.getAttribute('aria-busy') === 'true',
            threshold: timelineDayWidth() * CALENDAR_TIMELINE_PREFETCH_DAYS,
        });
        if (!direction) return;
        const marker = captureViewportMarker();
        const previousAnchor = anchorDate || today();
        const nextAnchor = shiftCalendarTimelineEdgeAnchor(previousAnchor, direction);
        anchorDate = nextAnchor;
        edgePaging = true;
        render({ scrollMode: 'marker', scrollMarker: marker, quiet: true })
            .then(rendered => {
                if (!rendered && anchorDate === nextAnchor) anchorDate = previousAnchor;
            })
            .finally(() => { edgePaging = false; });
    }

    function handleKeydown(event) {
        if (event.target !== scroll) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const dayWidth = timelineDayWidth();
            scroll.scrollBy?.({ left: event.key === 'ArrowLeft' ? -dayWidth : dayWidth, behavior: 'smooth' });
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            scroll.scrollTo?.({ left: event.key === 'Home' ? 0 : scroll.scrollWidth, behavior: 'smooth' });
        }
    }

    root.addEventListener('click', handleClick);
    scroll.addEventListener('wheel', handleWheel, { passive: false });
    scroll.addEventListener('scroll', handleScroll);
    scroll.addEventListener('keydown', handleKeydown);
    scroll.addEventListener('pointerdown', beginPan);
    scroll.addEventListener('pointermove', movePan);
    scroll.addEventListener('pointerup', endPan);
    scroll.addEventListener('pointercancel', finishPan);
    scroll.addEventListener('lostpointercapture', finishPan);
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
            scroll.removeEventListener('wheel', handleWheel);
            scroll.removeEventListener('scroll', handleScroll);
            scroll.removeEventListener('keydown', handleKeydown);
            scroll.removeEventListener('pointerdown', beginPan);
            scroll.removeEventListener('pointermove', movePan);
            scroll.removeEventListener('pointerup', endPan);
            scroll.removeEventListener('pointercancel', finishPan);
            scroll.removeEventListener('lostpointercapture', finishPan);
            todayButton.removeEventListener('click', returnToToday);
            earlierButton.removeEventListener('click', showEarlier);
            laterButton.removeEventListener('click', showLater);
            clearTimeout(suppressClickTimer);
            panSession = null;
            scroll.classList.remove('is-panning');
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
