import { formatCalendarDate } from './calendarLocale.js';
import { tooltipPosition } from './core/calendarModel.js';

const calendarDayTooltipId = 'calendar-day-tooltip';

function ensureCalendarDayTooltip() {
    let tooltip = document.getElementById(calendarDayTooltipId);
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = calendarDayTooltipId;
    tooltip.className = 'ui-tooltip cal-day-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
}

export function hideCalendarDayTooltip(anchor = null) {
    const tooltip = document.getElementById(calendarDayTooltipId);
    if (tooltip) tooltip.hidden = true;
    anchor?.removeAttribute('aria-describedby');
}

function showCalendarDayTooltip(anchor, summary, locale) {
    const tooltip = ensureCalendarDayTooltip();
    tooltip.replaceChildren();

    const heading = document.createElement('strong');
    heading.textContent = formatCalendarDate(anchor.dataset.date, locale);
    tooltip.appendChild(heading);
    if (summary.noteCount) {
        const noteCount = document.createElement('span');
        noteCount.className = 'cal-day-tooltip-note-count';
        noteCount.textContent = `${summary.noteCount} ${summary.noteCount === 1 ? 'note' : 'notes'}`;
        tooltip.appendChild(noteCount);
    }
    if (summary.dueTitles.length) {
        const dueLabel = document.createElement('span');
        dueLabel.className = 'cal-day-tooltip-due-label';
        dueLabel.textContent = summary.dueTitles.length === 1 ? 'Due item' : 'Due items';
        tooltip.appendChild(dueLabel);
        const list = document.createElement('ul');
        for (const title of summary.dueTitles) {
            const item = document.createElement('li');
            item.textContent = title;
            list.appendChild(item);
        }
        tooltip.appendChild(list);
    }

    tooltip.hidden = false;
    anchor.setAttribute('aria-describedby', calendarDayTooltipId);
    const position = tooltipPosition(
        anchor.getBoundingClientRect(),
        tooltip.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
    );
    tooltip.style.left = `${position.left}px`;
    tooltip.style.top = `${position.top}px`;
}

export function wireCalendarDayTooltips(container, summaries, locale) {
    let hoveredDay = null;
    let focusedDay = null;
    container.querySelectorAll('button.cal-day[data-date]').forEach(day => {
        const dayNumber = Number(day.dataset.date.slice(-2));
        const summary = summaries.get(dayNumber);
        if (!summary || (!summary.noteCount && summary.dueTitles.length === 0)) return;
        day.addEventListener('pointerenter', () => {
            hoveredDay = day;
            showCalendarDayTooltip(day, summary, locale);
        });
        day.addEventListener('pointerleave', () => {
            hoveredDay = null;
            if (focusedDay !== day) hideCalendarDayTooltip(day);
        });
        day.addEventListener('focus', () => {
            focusedDay = day;
            showCalendarDayTooltip(day, summary, locale);
        });
        day.addEventListener('blur', () => {
            focusedDay = null;
            if (hoveredDay !== day) hideCalendarDayTooltip(day);
        });
    });
}
