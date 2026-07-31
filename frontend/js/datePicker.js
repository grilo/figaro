import {
    dateFromISO,
    datePickerMonth,
    isISODate,
    localISODate,
    shiftISODate,
} from './core/dueDateModel.js';

let activePicker = null;

export function closeDatePicker({ restoreFocus = true } = {}) {
    if (!activePicker) return;
    const { element, anchor, outsideHandler, repositionHandler } = activePicker;
    document.removeEventListener('pointerdown', outsideHandler, true);
    window.removeEventListener('resize', repositionHandler);
    window.removeEventListener('scroll', repositionHandler, true);
    element.remove();
    activePicker = null;
    if (restoreFocus && anchor?.isConnected) anchor.focus();
}

export function openDatePicker({ anchor, value = '', onSelect, now = () => new Date(), locale = undefined }) {
    if (!anchor || typeof onSelect !== 'function') throw new TypeError('Date picker anchor and selection handler are required');
    closeDatePicker({ restoreFocus: false });

    const today = localISODate(now());
    const initial = dateFromISO(value) || dateFromISO(today);
    const state = { year: initial.getFullYear(), month: initial.getMonth(), selected: isISODate(value) ? value : '' };
    const picker = document.createElement('section');
    picker.className = 'ui-date-picker ui-menu';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Choose due date');

    const position = () => positionPicker(picker, anchor);
    const render = focusDate => {
        const monthDate = new Date(state.year, state.month, 1, 12);
        const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(monthDate);
        const days = datePickerMonth(state.year, state.month, { selected: state.selected, today });
        picker.innerHTML = `
            <div class="ui-date-picker-shortcuts" aria-label="Due date shortcuts">
                <button type="button" class="ui-button" data-date-picker-value="${today}">Today</button>
                <button type="button" class="ui-button" data-date-picker-value="${shiftISODate(today, 1)}">Tomorrow</button>
                <button type="button" class="ui-button" data-date-picker-value="${shiftISODate(today, 7)}">Next week</button>
            </div>
            <div class="ui-date-picker-header">
                <button type="button" class="ui-icon-button ui-icon-button--small" data-date-picker-nav="previous" aria-label="Previous month">‹</button>
                <strong aria-live="polite">${escapeHtml(monthLabel)}</strong>
                <button type="button" class="ui-icon-button ui-icon-button--small" data-date-picker-nav="next" aria-label="Next month">›</button>
            </div>
            <div class="ui-date-picker-weekdays" aria-hidden="true">
                ${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => `<span>${day}</span>`).join('')}
            </div>
            <div class="ui-date-picker-grid" role="grid" aria-label="${escapeHtml(monthLabel)}">
                ${days.map(day => `<button type="button" class="ui-date-picker-day${day.inMonth ? '' : ' outside-month'}${day.today ? ' today' : ''}${day.selected ? ' selected' : ''}"
                    data-date-picker-day="${day.date}" aria-label="${escapeHtml(longDateLabel(day.date, locale))}" aria-selected="${day.selected}">${day.day}</button>`).join('')}
            </div>
            <div class="ui-date-picker-footer">
                <button type="button" class="ui-button ui-date-picker-clear" data-date-picker-value="" ${state.selected ? '' : 'disabled'}>Clear due date</button>
            </div>`;
        position();
        const focusTarget = focusDate || state.selected || today;
        const target = picker.querySelector(`[data-date-picker-day="${focusTarget}"]`);
        target?.focus();
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
    render();
    return picker;
}

function positionPicker(picker, anchor) {
    const anchorRect = anchor.getBoundingClientRect();
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

function longDateLabel(value, locale) {
    const date = dateFromISO(value);
    return date ? new Intl.DateTimeFormat(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date) : value;
}

function escapeHtml(text) {
    const element = document.createElement('div');
    element.textContent = String(text || '');
    return element.innerHTML;
}

export default { closeDatePicker, openDatePicker };
