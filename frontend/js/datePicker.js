import {
    dateFromISO,
    isISODate,
    localISODate,
    shiftISODate,
} from './core/dueDateModel.js';
import {
    calendarDayClassName,
    calendarDayLabelParts,
    calendarMonthPresentation,
    localeWeekInfo,
    localeWeekdays,
} from './core/calendarModel.js';
import {
    currentCalendarLocale,
    formatCalendarDate,
    formatCalendarMonth,
} from './calendarLocale.js';
import { hideCalendarDayTooltip, wireCalendarDayTooltips } from './calendarDayTooltip.js';

let activePicker = null;
let configuredMonthDataLoader = null;

export function configureDatePickerCalendarSource({ loadMonthData = null } = {}) {
    if (loadMonthData !== null && typeof loadMonthData !== 'function') {
        throw new TypeError('Date picker calendar source must be a function or null');
    }
    configuredMonthDataLoader = loadMonthData;
}

export function closeDatePicker({ restoreFocus = true } = {}) {
    if (!activePicker) return;
    const { element, anchor, outsideHandler, repositionHandler } = activePicker;
    document.removeEventListener('pointerdown', outsideHandler, true);
    window.removeEventListener('resize', repositionHandler);
    window.removeEventListener('scroll', repositionHandler, true);
    hideCalendarDayTooltip();
    element.remove();
    activePicker = null;
    if (restoreFocus && anchor?.isConnected) anchor.focus();
}

export function openDatePicker({
    anchor,
    anchorRect = null,
    value = '',
    onSelect,
    now = () => new Date(),
    locale = undefined,
    ariaLabel = 'Choose due date',
    loadMonthData = configuredMonthDataLoader,
}) {
    if (!anchor || typeof onSelect !== 'function') throw new TypeError('Date picker anchor and selection handler are required');
    closeDatePicker({ restoreFocus: false });

    const today = localISODate(now());
    const initial = dateFromISO(value) || dateFromISO(today);
    const resolvedLocale = locale || currentCalendarLocale();
    const state = {
        year: initial.getFullYear(),
        month: initial.getMonth(),
        selected: isISODate(value) ? value : today,
        canClear: isISODate(value),
        monthData: new Map(),
        pendingData: new Map(),
    };
    const picker = document.createElement('section');
    picker.className = 'ui-date-picker ui-menu';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', ariaLabel);
    picker.innerHTML = `
        <div class="ui-date-picker-shortcuts" aria-label="Due date shortcuts">
            <button type="button" class="ui-button" data-date-picker-value="${today}">Today</button>
            <button type="button" class="ui-button" data-date-picker-value="${shiftISODate(today, 1)}">Tomorrow</button>
            <button type="button" class="ui-button" data-date-picker-value="${shiftISODate(today, 7)}">Next week</button>
        </div>
        <div class="ui-date-picker-header">
            <button type="button" class="ui-icon-button ui-icon-button--small" data-date-picker-nav="previous" aria-label="Previous month">‹</button>
            <strong aria-live="polite"></strong>
            <button type="button" class="ui-icon-button ui-icon-button--small" data-date-picker-nav="next" aria-label="Next month">›</button>
        </div>
        <div class="ui-date-picker-weekdays" aria-hidden="true"></div>
        <div class="ui-date-picker-grid calendar-grid" role="grid"></div>
        <div class="ui-date-picker-footer">
            <button type="button" class="ui-button ui-date-picker-clear" data-date-picker-value="" ${state.canClear ? '' : 'disabled'}>Clear due date</button>
        </div>`;

    const position = () => positionPicker(picker, anchor, anchorRect);
    const render = (focusDate = null, { requestData = true } = {}) => {
        const key = `${state.year}-${state.month}`;
        const weekInfo = localeWeekInfo(resolvedLocale);
        const weekdays = localeWeekdays(resolvedLocale, weekInfo.firstDay);
        const monthLabel = formatCalendarMonth(state.year, state.month, resolvedLocale);
        const data = state.monthData.get(key) || emptyCalendarMonthData(state.year, state.month);
        const { weeks, summaries } = calendarMonthPresentation({
            year: state.year,
            month: state.month,
            data,
            selectedDateStr: state.selected,
            todayStr: today,
            firstDay: weekInfo.firstDay,
            weekend: weekInfo.weekend,
        });
        const weekdaysElement = picker.querySelector('.ui-date-picker-weekdays');
        const grid = picker.querySelector('.ui-date-picker-grid');
        picker.querySelector('.ui-date-picker-header strong').textContent = monthLabel;
        weekdaysElement.innerHTML = weekdays.map(day => (
            `<span class="cal-day-header" aria-label="${escapeHtml(day.long)}">${escapeHtml(day.short)}</span>`
        )).join('');
        grid.setAttribute('aria-label', monthLabel);
        grid.setAttribute('aria-busy', String(Boolean(loadMonthData) && !state.monthData.has(key)));
        grid.innerHTML = weeks.flatMap(week => week.map(day => {
            if (day.empty) return '<span class="cal-day cal-empty" aria-hidden="true"></span>';
            const classes = calendarDayClassName(day);
            const label = calendarDayLabelParts(
                day,
                formatCalendarDate(day.dateStr, resolvedLocale),
            ).join('. ');
            return `<button type="button" class="${classes}" data-date="${day.dateStr}" data-date-picker-day="${day.dateStr}"
                aria-label="${escapeAttr(label)}" aria-selected="${day.isSelected}"${day.isToday ? ' aria-current="date"' : ''}>${day.day}</button>`;
        })).join('');
        hideCalendarDayTooltip();
        wireCalendarDayTooltips(grid, summaries, resolvedLocale);
        position();
        if (focusDate) picker.querySelector(`[data-date-picker-day="${focusDate}"]`)?.focus();

        if (!requestData || typeof loadMonthData !== 'function'
            || state.monthData.has(key) || state.pendingData.has(key)) return;
        const requestYear = state.year;
        const requestMonth = state.month;
        const request = Promise.resolve().then(() => loadMonthData(requestYear, requestMonth));
        state.pendingData.set(key, request);
        request.then(monthData => {
            state.monthData.set(key, monthData || emptyCalendarMonthData(requestYear, requestMonth));
        }).catch(() => {
            state.monthData.set(key, emptyCalendarMonthData(requestYear, requestMonth));
        }).finally(() => {
            state.pendingData.delete(key);
            if (!picker.isConnected || `${state.year}-${state.month}` !== key) return;
            const activeDate = picker.contains(document.activeElement)
                ? document.activeElement.closest?.('[data-date-picker-day]')?.dataset.datePickerDay || null
                : null;
            render(activeDate, { requestData: false });
        });
    };

    picker.addEventListener('click', event => {
        const nav = event.target.closest('[data-date-picker-nav]');
        if (nav) {
            const delta = nav.dataset.datePickerNav === 'next' ? 1 : -1;
            const next = new Date(state.year, state.month + delta, 1, 12);
            state.year = next.getFullYear();
            state.month = next.getMonth();
            render();
            return;
        }
        const selection = event.target.closest('[data-date-picker-value], [data-date-picker-day]');
        if (!selection) return;
        const nextValue = selection.dataset.datePickerValue ?? selection.dataset.datePickerDay;
        closeDatePicker({ restoreFocus: false });
        if (anchor.isConnected) anchor.focus();
        Promise.resolve().then(() => onSelect(nextValue));
    });
    picker.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDatePicker();
            return;
        }
        const day = event.target.closest('[data-date-picker-day]');
        if (!day) return;
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (!(event.key in offsets)) return;
        event.preventDefault();
        const nextDate = shiftISODate(day.dataset.datePickerDay, offsets[event.key]);
        const parsed = dateFromISO(nextDate);
        if (!parsed) return;
        state.year = parsed.getFullYear();
        state.month = parsed.getMonth();
        render(nextDate);
    });

    const outsideHandler = event => {
        if (!picker.contains(event.target) && event.target !== anchor) closeDatePicker({ restoreFocus: false });
    };
    const repositionHandler = () => closeDatePicker({ restoreFocus: false });
    activePicker = { element: picker, anchor, outsideHandler, repositionHandler };
    document.body.appendChild(picker);
    document.addEventListener('pointerdown', outsideHandler, true);
    window.addEventListener('resize', repositionHandler);
    window.addEventListener('scroll', repositionHandler, true);
    render(state.selected);
    return picker;
}

function emptyCalendarMonthData(year, month) {
    return {
        year,
        month: month + 1,
        days_with_notes: [],
        days_with_links: [],
        days_with_due_tasks: [],
        day_summaries: [],
    };
}

function positionPicker(picker, anchor, requestedRect = null) {
    const anchorRect = requestedRect || anchor.getBoundingClientRect();
    const pickerRect = picker.getBoundingClientRect();
    const margin = 8;
    const width = pickerRect.width || 280;
    const height = pickerRect.height || 342;
    const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - width - margin));
    const below = anchorRect.bottom + 6;
    const top = below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, anchorRect.top - height - 6);
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
}

function escapeHtml(text) {
    const element = document.createElement('div');
    element.textContent = String(text || '');
    return element.innerHTML;
}

function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default { closeDatePicker, configureDatePickerCalendarSource, openDatePicker };
