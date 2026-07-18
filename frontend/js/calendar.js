import { backend } from './backend.js';
/**
 * Calendar Module - Monthly calendar widget and date search results
 */

import { log } from './log.js';
import { setState, getState } from './state.js';
import { fileIcon } from './icons.js';
import { openTab } from './tabManager.js';

let calendarRequestId = 0;
let linkedNotesRequestId = 0;
const calendarResultsRequestIds = new Map();
const calendarMonthCache = new Map();
const linkedNotesCache = new Map();

/**
 * Drop cached calendar data after a vault mutation or filesystem event.
 * Rendering remains lazy: a hidden calendar never triggers a replacement scan.
 */
export function invalidateCalendarCache() {
    calendarMonthCache.clear();
    linkedNotesCache.clear();
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

/**
 * Initialize calendar module
 */
export function initCalendar() {
    // Calendar renders in the expandable left-sidebar panel. When a day is
    // clicked, linked notes appear below the grid without creating a tab.
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
    const selectedDateStr = getState('selectedCalDateStr');
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    monthYearEl.textContent = `${monthNames[month]} ${year}`;
    container.setAttribute('aria-busy', 'true');
    
    // Get calendar data from backend (backend expects month 1-12, JS getMonth returns 0-11)
    loadCalendarData(year, month + 1).then(data => {
        if (requestId !== calendarRequestId || !container.isConnected) return;
        container.setAttribute('aria-busy', 'false');
        renderCalendarGrid(container, year, month, data, selectedDateStr);
        renderLinkedNotes(linkedNotesContainer, data, selectedDateStr, requestId);
    }).catch(err => {
        if (requestId !== calendarRequestId || !container.isConnected) return;
        log.error('Failed to load calendar data:', err);
        container.setAttribute('aria-busy', 'false');
        container.innerHTML = '<div class="cal-error">Failed to load calendar</div>';
    });
}

/**
 * Load calendar data from backend
 */
async function loadCalendarData(year, month) {
    const cacheKey = `${year}-${month}`;
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
function renderCalendarGrid(container, year, month, data, selectedDateStr) {
    const calendar = Array.isArray(data?.calendar) ? data.calendar : [];
    const days_with_notes = Array.isArray(data?.days_with_notes) ? data.days_with_notes : [];
    const days_with_links = Array.isArray(data?.days_with_links) ? data.days_with_links : [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let html = '';
    
    // Day headers
    const dayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    for (const day of dayHeaders) {
        html += `<div class="cal-day-header">${day}</div>`;
    }
    
    // Days
    for (const week of calendar) {
        for (const day of week) {
            if (day === 0) {
                html += '<div class="cal-day cal-empty"></div>';
                continue;
            }
            
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDateStr;
            const hasNote = days_with_notes.includes(day);
            const hasLink = days_with_links.includes(day);
            
            let classes = 'cal-day';
            if (isToday) classes += ' today';
            if (isSelected) classes += ' selected';
            if (hasNote) classes += ' has-note';
            if (hasLink) classes += ' has-link';
            if (!hasNote && !hasLink && !isToday) classes += ' no-notes';
            
            const clickable = hasNote || hasLink || isToday;
            const clickHandler = clickable ? `onclick="window.calendarDayClick('${dateStr}')"` : '';
            
            html += `<div class="${classes}" data-date="${dateStr}" ${clickHandler}>${day}</div>`;
        }
    }
    
    container.innerHTML = html;
    
    // Make calendarDayClick globally accessible
    window.calendarDayClick = (dateStr) => {
        setState('selectedCalDateStr', dateStr);
        renderCalendar();
    };
}

/**
 * Render linked notes for selected date
 */
function renderLinkedNotes(container, data, selectedDateStr, renderId) {
    if (!container) return;
    const requestId = ++linkedNotesRequestId;
    
    if (!selectedDateStr) {
        container.innerHTML = '<p class="cal-no-selection">Select a date to see linked notes</p>';
        return;
    }
    
    // Load linked notes for selected date
    loadLinkedNotes(selectedDateStr).then(notes => {
        if (requestId !== linkedNotesRequestId || renderId !== calendarRequestId || !container.isConnected || getState('selectedCalDateStr') !== selectedDateStr) return;
        if (notes.length === 0) {
            container.innerHTML = '<p class="cal-no-notes">No notes link to this date</p>';
            return;
        }
        
        let html = '<h4>Linked Notes</h4>';
        for (const note of notes) {
            html += `
                <div class="cal-linked-note-item" data-path="${note.path}" onclick="window.openLinkedNote('${note.path}')">
                    <span class="cal-linked-note-icon">${fileIcon(14, 1.5)}</span>
                    <span class="cal-linked-note-name">${escapeHtml(note.name)}</span>
                </div>
            `;
        }
        container.innerHTML = html;
        
        window.openLinkedNote = (path) => {
            openTab(path, path.split('/').pop(), 'file', { path });
        };
    }).catch(err => {
        if (requestId !== linkedNotesRequestId || renderId !== calendarRequestId || !container.isConnected || getState('selectedCalDateStr') !== selectedDateStr) return;
        log.error('Failed to load linked notes:', err);
        container.innerHTML = '<p class="cal-error">Failed to load linked notes</p>';
    });
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
