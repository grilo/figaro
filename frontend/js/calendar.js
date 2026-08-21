import { backend } from './backend.js';
/**
 * Calendar Module - Monthly calendar widget and date search results
 */

import { log } from './log.js';
import { setState, getState } from './state.js';
import { fileIcon } from './icons.js';
import { openTab } from './tabManager.js';
import { dateFromISO, localISODate } from './core/dueDateModel.js';
import {
    calendarDayState,
    calendarMonthGrid,
    calendarMonthSummaryMap,
    calendarNoteAssociations,
    isoWeekday,
    localeWeekInfo,
    localeWeekdays,
    overlayCalendarLinkedNotes,
    overlayCalendarMonthNotes,
    tooltipPosition,
} from './core/calendarModel.js';

let calendarRequestId = 0;
let linkedNotesRequestId = 0;
let calendarEventsInitialized = false;
const calendarResultsRequestIds = new Map();
const calendarMonthCache = new Map();
const linkedNotesCache = new Map();
const dueTasksCache = new Map();
const calendarDayTooltipId = 'calendar-day-tooltip';
const calendarNoteBaselines = new Map();
let liveCalendarRefreshFrame = null;

function currentCalendarLocale() {
    const candidates = [
        ...(Array.isArray(navigator.languages) ? navigator.languages : []),
        navigator.language,
        Intl.DateTimeFormat().resolvedOptions().locale,
    ];
    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            new Intl.DateTimeFormat(candidate).format();
            return candidate;
        } catch (_) {
            // Some WebKitGTK builds expose C/POSIX as a navigator language.
        }
    }
    return 'en-US';
}

function formatCalendarMonth(year, month, locale) {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
        .format(new Date(year, month, 1, 12));
}

function formatCalendarDate(dateStr, locale) {
    const date = dateFromISO(dateStr);
    return date
        ? new Intl.DateTimeFormat(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date)
        : dateStr;
}

/**
 * Drop cached calendar data after a vault mutation or filesystem event.
 * Rendering remains lazy: a hidden calendar never triggers a replacement scan.
 */
export function invalidateCalendarCache() {
    calendarMonthCache.clear();
    linkedNotesCache.clear();
    dueTasksCache.clear();
}

/** Re-render only when the calendar panel is actually visible. */
export function refreshCalendarIfVisible() {
    const panel = document.getElementById('sidebar-calendar-panel');
    if (panel?.classList.contains('open') && panel.getAttribute('aria-hidden') !== 'true') {
        renderCalendar();
        return true;
    }
    return false;
}

function dirtyCalendarNoteAssociations() {
    const associations = new Map();
    for (const tab of getState('openTabs') || []) {
        if (tab?.type !== 'file' || tab.externalFileId || !tab.dirty || !tab.path || typeof tab._content !== 'string') continue;
        associations.set(tab.path, calendarNoteAssociations(tab.path, tab._content));
    }
    return associations;
}

function rememberCalendarNoteBaseline(path) {
    const tab = (getState('openTabs') || []).find(candidate => (
        candidate?.type === 'file' && !candidate.externalFileId && candidate.path === path
    ));
    if (!tab || typeof tab._content !== 'string') return;
    calendarNoteBaselines.set(path, calendarNoteAssociations(path, tab._content));
}

function updateCalendarNoteBaselineAfterSave(path, content) {
    if (!path || typeof content !== 'string') return;
    const remainsDirty = (getState('openTabs') || []).some(tab => (
        tab?.type === 'file' && !tab.externalFileId && tab.path === path && tab.dirty
    ));
    if (remainsDirty) {
        calendarNoteBaselines.set(path, calendarNoteAssociations(path, content));
    } else {
        calendarNoteBaselines.delete(path);
    }
}

function scheduleLiveCalendarRefresh() {
    if (liveCalendarRefreshFrame !== null) return;
    const refresh = () => {
        liveCalendarRefreshFrame = null;
        // The saved month remains cached; only the small dirty-buffer overlay
        // is recomputed while typing.
        refreshCalendarIfVisible();
    };
    liveCalendarRefreshFrame = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(refresh)
        : setTimeout(refresh, 0);
}

/**
 * Initialize calendar module
 */
export function initCalendar() {
    // Calendar renders in the expandable left-sidebar panel. When a day is
    // clicked, linked notes appear below the grid without creating a tab.
    if (calendarEventsInitialized) return;
    calendarEventsInitialized = true;
    document.addEventListener('calendar-data-changed', () => {
        invalidateCalendarCache();
        refreshCalendarIfVisible();
    });
    document.addEventListener('local-date-changed', () => {
        invalidateCalendarCache();
        refreshCalendarIfVisible();
    });
    document.addEventListener('active-file-dirty', event => {
        rememberCalendarNoteBaseline(event.detail?.path);
    });
    document.addEventListener('file-content-changed', scheduleLiveCalendarRefresh);
    document.addEventListener('vault-file-saved', event => {
        updateCalendarNoteBaselineAfterSave(event.detail?.path, event.detail?.content);
    });
}

/**
 * Render calendar widget in sidebar
 */
export function renderCalendar() {
    const container = document.getElementById('calendar-grid');
    const monthYearEl = document.getElementById('cal-month-year');
    const linkedNotesContainer = document.getElementById('cal-linked-notes');
    
    if (!container || !monthYearEl) return;

    const requestId = ++calendarRequestId;
    
    const currentDate = getState('currentCalDate');
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const storedSelectedDateStr = getState('selectedCalDateStr');
    const todayStr = localISODate();
    const selectedDateStr = storedSelectedDateStr || (
        todayStr.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`) ? todayStr : null
    );
    const locale = currentCalendarLocale();
    
    // Update month/year display
    const monthLabel = formatCalendarMonth(year, month, locale);
    const cacheKey = calendarMonthCacheKey(year, month + 1);
    monthYearEl.textContent = monthLabel;
    container.setAttribute('aria-busy', 'true');
    container.setAttribute('aria-label', monthLabel);
    container.setAttribute('role', 'grid');
    if (!calendarMonthCache.has(cacheKey) || container.dataset.loadingMonth) {
        renderCalendarLoadingSkeleton(container, year, month, locale, monthLabel, cacheKey);
    }
    
    // Get calendar data from backend (backend expects month 1-12, JS getMonth returns 0-11)
    loadCalendarData(year, month + 1).then(data => {
        if (requestId !== calendarRequestId || !container.isConnected) return;
        const visibleData = overlayCalendarMonthNotes(
            data,
            year,
            month + 1,
            calendarNoteBaselines,
            dirtyCalendarNoteAssociations(),
        );
        container.setAttribute('aria-busy', 'false');
        renderCalendarGrid(container, year, month, visibleData, selectedDateStr, locale);
        renderLinkedNotes(linkedNotesContainer, visibleData, selectedDateStr, requestId);
    }).catch(err => {
        if (requestId !== calendarRequestId || !container.isConnected) return;
        log.error('Failed to load calendar data:', err);
        container.setAttribute('aria-busy', 'false');
        delete container.dataset.loadingMonth;
        container.innerHTML = '<div class="cal-error">Failed to load calendar</div>';
    });
}

function calendarMonthCacheKey(year, month) {
    return `${year}-${month}`;
}

function renderCalendarLoadingSkeleton(container, year, month, locale, monthLabel, cacheKey) {
    const weekInfo = localeWeekInfo(locale);
    const dayCellCount = calendarMonthGrid(year, month, weekInfo.firstDay).length * 7;
    const headers = Array.from({ length: 7 }, () => (
        '<div class="cal-day-header" aria-hidden="true"><span class="ui-skeleton calendar-skeleton-weekday"></span></div>'
    )).join('');
    const days = Array.from({ length: dayCellCount }, () => (
        '<span class="ui-skeleton calendar-skeleton-day" aria-hidden="true"></span>'
    )).join('');
    hideCalendarDayTooltip();
    container.dataset.loadingMonth = cacheKey;
    container.innerHTML = `<span class="sr-only" role="status">Loading ${escapeHtml(monthLabel)} calendar…</span>${headers}${days}`;
}

/**
 * Load calendar data from backend
 */
async function loadCalendarData(year, month) {
    const cacheKey = calendarMonthCacheKey(year, month);
    const cached = calendarMonthCache.get(cacheKey);
    if (cached) return cached;

    const request = (async () => {
        try {
            const result = await backend().GetCalendarMonthData(year, month);
            return result;
        } catch (err) {
            // A failed request must not poison a later retry after the bridge
            // reconnects or an external vault becomes available again.
            calendarMonthCache.delete(cacheKey);
            log.error('Calendar data load failed:', err);
            return {
                year,
                month,
                days_with_notes: [],
                days_with_links: [],
                days_with_due_tasks: [],
                day_summaries: [],
                calendar: []
            };
        }
    })();
    calendarMonthCache.set(cacheKey, request);
    return request;
}

/**
 * Render calendar grid
 */
function renderCalendarGrid(container, year, month, data, selectedDateStr, locale = currentCalendarLocale()) {
    const weekInfo = localeWeekInfo(locale);
    const calendar = calendarMonthGrid(year, month, weekInfo.firstDay);
    const weekdays = localeWeekdays(locale, weekInfo.firstDay);
    const daysWithLinks = new Set(Array.isArray(data?.days_with_links) ? data.days_with_links.map(Number) : []);
    const hasStructuredSummaries = Array.isArray(data?.day_summaries);
    const summaries = calendarMonthSummaryMap(data);
    const todayStr = localISODate();
    const visualSelectedDateStr = selectedDateStr || todayStr;

    let html = '';

    // Day headers
    for (const weekday of weekdays) {
        html += `<div class="cal-day-header" role="columnheader" aria-label="${escapeAttr(weekday.long)}">${escapeHtml(weekday.short)}</div>`;
    }

    // Days
    for (const week of calendar) {
        for (const day of week) {
            if (day === 0) {
                html += '<span class="cal-day cal-empty" aria-hidden="true"></span>';
                continue;
            }

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === visualSelectedDateStr;
            const hasLink = !hasStructuredSummaries && daysWithLinks.has(day);
            const summary = summaries.get(day) || { noteCount: 0, dueTitles: [], hasDue: false };
            const state = calendarDayState({
                isoDay: isoWeekday(year, month, day),
                weekend: weekInfo.weekend,
                noteCount: summary.noteCount,
                dueTitles: summary.dueTitles,
                hasDue: summary.hasDue,
                hasLink,
                isToday,
            });

            let classes = 'ui-date-picker-day cal-day';
            if (isSelected) classes += ' selected';
            if (state.isWeekend) classes += ' is-weekend ui-date-picker-day--weekend';
            if (state.noteLevel) classes += ` has-note ui-date-picker-day--note-${state.noteLevel}`;
            if (hasLink) classes += ' has-link';
            if (state.hasDue) classes += ' has-due-task ui-date-picker-day--due';

            const labelParts = [formatCalendarDate(dateStr, locale)];
            if (state.isWeekend) labelParts.push('Weekend');
            if (summary.noteCount) labelParts.push(`${summary.noteCount} ${summary.noteCount === 1 ? 'note' : 'notes'}`);
            if (state.hasDue) {
                labelParts.push(summary.dueTitles.length
                    ? `${summary.dueTitles.length} due ${summary.dueTitles.length === 1 ? 'item' : 'items'}: ${summary.dueTitles.join('; ')}`
                    : 'Due item');
            }
            if (isToday) labelParts.push('Today');

            const commonAttributes = `class="${classes}" data-date="${dateStr}" aria-label="${escapeAttr(labelParts.join('. '))}"`;
            html += state.clickable
                ? `<button type="button" ${commonAttributes} aria-pressed="${isSelected}"${isToday ? ' aria-current="date"' : ''}>${day}</button>`
                : `<span ${commonAttributes} role="gridcell">${day}</span>`;
        }
    }

    hideCalendarDayTooltip();
    delete container.dataset.loadingMonth;
    container.innerHTML = html;

    // Make calendarDayClick globally accessible
    window.calendarDayClick = (dateStr) => {
        setState('selectedCalDateStr', dateStr);
        renderCalendar();
    };

    container.querySelectorAll('button.cal-day[data-date]').forEach(day => {
        day.addEventListener('click', () => window.calendarDayClick(day.dataset.date));
    });
    wireCalendarDayTooltips(container, summaries, locale);
}

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

function hideCalendarDayTooltip(anchor = null) {
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

function wireCalendarDayTooltips(container, summaries, locale) {
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

/**
 * Render linked notes for selected date
 */
function renderLinkedNotes(container, data, selectedDateStr, renderId) {
    if (!container) return;
    const requestId = ++linkedNotesRequestId;
    
    if (!selectedDateStr) {
        container.innerHTML = '<p class="cal-no-selection">Select a date to see due tasks and linked notes</p>';
        return;
    }
    
    Promise.all([loadDueTasks(selectedDateStr), loadLinkedNotes(selectedDateStr)]).then(([tasks, savedNotes]) => {
        if (requestId !== linkedNotesRequestId || renderId !== calendarRequestId || !container.isConnected) return;
        const notes = overlayCalendarLinkedNotes(savedNotes, selectedDateStr, dirtyCalendarNoteAssociations());
        const taskLocations = new Set(tasks.map(task => `${task.file}:${task.line}`));
        const remainingNotes = notes.filter(note => !taskLocations.has(`${note.path}:${note.line_num}`));
        if (tasks.length === 0 && remainingNotes.length === 0) {
            container.innerHTML = '<p class="cal-no-notes">No tasks or notes for this date</p>';
            return;
        }

        let html = '';
        if (tasks.length) {
            html += '<h4>Due tasks</h4>';
            for (const task of tasks) {
                html += `<button type="button" class="cal-due-task-item" data-path="${escapeAttr(task.file)}" data-line="${Number(task.line) || 1}">
                    <span class="cal-due-task-marker" aria-hidden="true"></span>
                    <span><strong>${escapeHtml(task.text || 'Untitled task')}</strong><small>${escapeHtml(task.file_name || task.file)}</small></span>
                </button>`;
            }
        }
        if (remainingNotes.length) html += '<h4>Linked notes</h4>';
        for (const note of remainingNotes) {
            html += `
                <button type="button" class="cal-linked-note-item" data-path="${escapeAttr(note.path)}">
                    <span class="cal-linked-note-icon">${fileIcon(14, 1.5)}</span>
                    <span class="cal-linked-note-name">${escapeHtml(note.name)}</span>
                </button>
            `;
        }
        container.innerHTML = html;
        container.querySelectorAll('.cal-due-task-item').forEach(item => {
            item.addEventListener('click', () => openTab(item.dataset.path, item.dataset.path.split('/').pop(), 'file', {
                path: item.dataset.path,
                line: Number(item.dataset.line),
            }));
        });
        container.querySelectorAll('.cal-linked-note-item').forEach(item => {
            item.addEventListener('click', () => openTab(item.dataset.path, item.dataset.path.split('/').pop(), 'file', { path: item.dataset.path }));
        });
    }).catch(err => {
        if (requestId !== linkedNotesRequestId || renderId !== calendarRequestId || !container.isConnected) return;
        log.error('Failed to load date details:', err);
        container.innerHTML = '<p class="cal-error">Failed to load date details</p>';
    });
}

async function loadDueTasks(dateStr) {
    const cached = dueTasksCache.get(dateStr);
    if (cached) return cached;
    const request = (async () => {
        try {
            return await backend().GetTasksDueOnDate(dateStr) || [];
        } catch (error) {
            dueTasksCache.delete(dateStr);
            log.error('Due tasks load failed:', error);
            return [];
        }
    })();
    dueTasksCache.set(dateStr, request);
    return request;
}

/**
 * Load linked notes for a date
 */
async function loadLinkedNotes(dateStr) {
    const cached = linkedNotesCache.get(dateStr);
    if (cached) return cached;

    const request = (async () => {
        try {
            const result = await backend().GetLinkedNotesForDate(dateStr);
            return result || [];
        } catch (err) {
            linkedNotesCache.delete(dateStr);
            log.error('Linked notes load failed:', err);
            return [];
        }
    })();
    linkedNotesCache.set(dateStr, request);
    return request;
}

/**
 * Load calendar search results for a date (used by calendar tab)
 */
export async function loadCalendarResults(dateStr, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const requestId = (calendarResultsRequestIds.get(containerId) || 0) + 1;
    calendarResultsRequestIds.set(containerId, requestId);
    
    container.innerHTML = '<div class="results-loading">Loading...</div>';
    
    try {
        const results = await backend().SearchFiles(dateStr, false);
        if (calendarResultsRequestIds.get(containerId) !== requestId || !container.isConnected) return;
        
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="results-empty">No notes mention this date</div>';
            return;
        }
        
        let html = '';
        for (const result of results) {
            const firstMatch = result.matches[0] || { text: '', line: 1 };
            const snippet = highlightMatch(firstMatch.text, dateStr);
            html += `
                <div class="result-card" data-path="${escapeAttr(result.path)}">
                    <div class="result-card-title">${escapeHtml(result.name.replace('.md', ''))}</div>
                    <div class="result-card-meta">
                        <span class="result-card-date">${dateStr}</span>
                        <span class="result-card-path">${escapeHtml(result.path)}</span>
                    </div>
                    <div class="result-card-snippet">${snippet}</div>
                </div>
            `;
        }
        container.innerHTML = html;
        
        // Click delegation on result cards
        container.querySelectorAll('.result-card').forEach(card => {
            card.addEventListener('click', () => {
                openTab(card.dataset.path, card.dataset.path.split('/').pop(), 'file', { path: card.dataset.path });
            });
        });
    } catch (err) {
        if (calendarResultsRequestIds.get(containerId) !== requestId || !container.isConnected) return;
        log.error('Calendar results load failed:', err);
        container.innerHTML = '<div class="results-error">Failed to load results</div>';
    }
}

/**
 * Highlight search match in snippet
 */
function highlightMatch(text, query) {
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
}

/**
 * Escape regex special characters
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default {
    initCalendar,
    renderCalendar,
    loadCalendarResults
};
