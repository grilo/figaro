import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/app.js', () => ({
    openTab: jest.fn(),
}));

import { getState, setState } from '../frontend/js/state.js';
import {
    initCalendar,
    invalidateCalendarCache,
    prepareCalendarOpen,
    refreshCalendarIfVisible,
    renderCalendar,
    setCalendarPresentation,
} from '../frontend/js/calendar.js';

const monthData = {
    year: 2025,
    month: 1,
    days_with_notes: [15],
    days_with_links: [20],
    days_with_due_tasks: [],
    day_summaries: [
        { day: 15, note_count: 1, due_titles: [] },
        { day: 20, note_count: 1, due_titles: [] },
    ],
    calendar: [[0, 0, 0, 15, 0, 0, 0]],
};

async function flushCalendar() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function mountActiveCalendarWorkspace() {
    const host = document.createElement('div');
    host.className = 'tab-panel active';
    host.dataset.tabId = 'calendar-workspace';
    const calendar = document.getElementById('calendar-workspace-view');
    calendar.setAttribute('aria-hidden', 'false');
    host.appendChild(calendar);
    document.getElementById('tab-panels').appendChild(host);
    return calendar;
}

describe('Calendar cache', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true });
        Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
        jest.clearAllMocks();
        invalidateCalendarCache();
        initCalendar();
        setState('currentCalDate', new Date(2025, 0, 15));
        setState('selectedCalDateStr', '2025-01-15');
        setState('calendarPresentation', 'month');
        setState('openTabs', []);
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue(monthData);
        window.go.desktop.App.GetLinkedNotesForDate.mockResolvedValue([]);
        window.go.desktop.App.GetCalendarTimelineData.mockResolvedValue({ days: [] });
        window.go.desktop.App.GetTasksDueOnDate.mockResolvedValue([]);
    });

    test('selects Today on the first opening and restores the last selected day on later openings', async () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const day = now.getDate();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const noteDay = day === daysInMonth ? day - 1 : day + 1;
        const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const noteDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(noteDay).padStart(2, '0')}`;
        setState('currentCalDate', new Date(2001, 0, 1));
        setState('selectedCalDateStr', null);
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue({
            year,
            month: month + 1,
            days_with_notes: [noteDay],
            days_with_links: [],
            days_with_due_tasks: [],
            day_summaries: [{ day: noteDay, note_count: 1, due_titles: [] }],
            calendar: [],
        });

        expect(prepareCalendarOpen()).toBe(todayStr);
        expect(getState('selectedCalDateStr')).toBe(todayStr);
        expect(getState('currentCalDate').getFullYear()).toBe(year);
        expect(getState('currentCalDate').getMonth()).toBe(month);
        renderCalendar();
        await flushCalendar();
        expect(document.querySelector(`[data-date="${todayStr}"]`).classList.contains('selected')).toBe(true);

        document.querySelector(`[data-date="${noteDateStr}"]`).click();
        await flushCalendar();
        expect(getState('selectedCalDateStr')).toBe(noteDateStr);

        // Looking elsewhere does not replace the session selection. Reopening
        // returns the visible month and selection to the last chosen day.
        setState('currentCalDate', new Date(year, month + 1, 1));
        expect(prepareCalendarOpen()).toBe(noteDateStr);
        expect(getState('selectedCalDateStr')).toBe(noteDateStr);
        expect(getState('currentCalDate').getMonth()).toBe(month);
        renderCalendar();
        await flushCalendar();
        expect(document.querySelector(`[data-date="${noteDateStr}"]`).classList.contains('selected')).toBe(true);
    });

    test('shows a shared month-shaped skeleton immediately on a slow cache miss', async () => {
        let resolveMonth;
        window.go.desktop.App.GetCalendarMonthData.mockImplementationOnce(() => (
            new Promise(resolve => { resolveMonth = resolve; })
        ));

        renderCalendar();

        const grid = document.getElementById('calendar-grid');
        expect(grid.getAttribute('aria-busy')).toBe('true');
        expect(grid.dataset.loadingMonth).toBe('2025-1');
        expect(grid.querySelector('[role="status"]').textContent).toBe('Loading January 2025 calendar…');
        expect(grid.querySelectorAll('.calendar-skeleton-weekday.ui-skeleton')).toHaveLength(7);
        expect(grid.querySelectorAll('.calendar-skeleton-day.ui-skeleton')).toHaveLength(35);

        resolveMonth(monthData);
        await flushCalendar();

        expect(grid.getAttribute('aria-busy')).toBe('false');
        expect(grid.dataset.loadingMonth).toBeUndefined();
        expect(grid.querySelector('.ui-skeleton')).toBeNull();
        expect(grid.querySelectorAll('.cal-day-header')).toHaveLength(7);

        renderCalendar();
        expect(grid.querySelector('.ui-skeleton')).toBeNull();
        await flushCalendar();
    });

    test('uses vertical wheel gestures over the month grid to browse months without capturing details scrolling', () => {
        const grid = document.getElementById('calendar-grid');
        const details = document.getElementById('cal-linked-notes');
        setState('currentCalDate', new Date(2025, 0, 31));
        const nextMonth = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY: 1,
            deltaMode: WheelEvent.DOM_DELTA_LINE,
        });

        grid.dispatchEvent(nextMonth);

        expect(nextMonth.defaultPrevented).toBe(true);
        expect(getState('currentCalDate').getFullYear()).toBe(2025);
        expect(getState('currentCalDate').getMonth()).toBe(1);

        const detailsScroll = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY: -1,
            deltaMode: WheelEvent.DOM_DELTA_LINE,
        });
        details.dispatchEvent(detailsScroll);

        expect(detailsScroll.defaultPrevented).toBe(false);
        expect(getState('currentCalDate').getMonth()).toBe(1);
    });

    test('reuses a month response when selecting a day instead of rescanning the vault', async () => {
        renderCalendar();
        await flushCalendar();

        expect(window.go.desktop.App.GetCalendarMonthData).toHaveBeenCalledTimes(1);
        expect(typeof window.calendarDayClick).toBe('function');

        window.calendarDayClick('2025-01-15');
        await flushCalendar();

        expect(window.go.desktop.App.GetCalendarMonthData).toHaveBeenCalledTimes(1);
    });

    test('drops the cached month after a vault change', async () => {
        renderCalendar();
        await flushCalendar();

        invalidateCalendarCache();
        renderCalendar();
        await flushCalendar();

        expect(window.go.desktop.App.GetCalendarMonthData).toHaveBeenCalledTimes(2);
    });

    test('refreshes the selected Calendar workspace after a vault change', async () => {
        mountActiveCalendarWorkspace();

        renderCalendar();
        await flushCalendar();
        invalidateCalendarCache();

        expect(refreshCalendarIfVisible()).toBe(true);
        await flushCalendar();

        expect(window.go.desktop.App.GetCalendarMonthData).toHaveBeenCalledTimes(2);
        expect(document.querySelectorAll('#calendar-grid .cal-day-header')).toHaveLength(7);
        expect(document.getElementById('calendar-grid').getAttribute('aria-busy')).toBe('false');
    });

    test('does not reload a hidden Calendar workspace', () => {
        const panel = document.getElementById('calendar-workspace-view');
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');

        expect(refreshCalendarIfVisible()).toBe(false);
        expect(window.go.desktop.App.GetCalendarMonthData).not.toHaveBeenCalled();
    });

    test('switches between the centered Month split and the session Timeline presentation', async () => {
        mountActiveCalendarWorkspace();
        window.go.desktop.App.GetCalendarTimelineData.mockResolvedValue({
            days: [{
                date: '2025-01-15',
                notes: [{ path: 'notes/plan.md', name: 'plan.md', line_num: 4 }],
            }],
        });

        expect(setCalendarPresentation('timeline')).toBe('timeline');
        await flushCalendar();

        expect(getState('calendarPresentation')).toBe('timeline');
        expect(document.querySelector('[data-calendar-presentation="timeline"]').getAttribute('aria-pressed')).toBe('true');
        expect(document.getElementById('calendar-month-view').hidden).toBe(true);
        expect(document.getElementById('calendar-timeline-view').hidden).toBe(false);
        expect(document.querySelectorAll('.calendar-timeline-day')).toHaveLength(42);
        expect(document.querySelector('.calendar-timeline-note').dataset.line).toBe('4');

        setCalendarPresentation('month');
        await flushCalendar();
        expect(document.querySelector('[data-calendar-presentation="month"]').getAttribute('aria-pressed')).toBe('true');
        expect(document.getElementById('calendar-month-view').hidden).toBe(false);
        expect(document.getElementById('calendar-timeline-view').hidden).toBe(true);
        expect(document.querySelectorAll('#calendar-grid .cal-day-header')).toHaveLength(7);
    });

    test('releases Timeline DOM and cached ranges when Calendar loses the workspace', async () => {
        mountActiveCalendarWorkspace();
        setCalendarPresentation('timeline');
        await flushCalendar();
        expect(document.querySelectorAll('.calendar-timeline-day')).toHaveLength(42);
        expect(window.go.desktop.App.GetCalendarTimelineData).toHaveBeenCalledTimes(1);

        document.dispatchEvent(new CustomEvent('active-tab-changed', {
            detail: { path: null, type: 'kanban' },
        }));

        expect(document.querySelectorAll('.calendar-timeline-day')).toHaveLength(0);
        expect(document.querySelector('.calendar-timeline-range').textContent).toBe('');
        expect(document.getElementById('calendar-timeline-view').getAttribute('aria-busy')).toBe('false');

        renderCalendar();
        await flushCalendar();
        expect(document.querySelectorAll('.calendar-timeline-day')).toHaveLength(42);
        expect(window.go.desktop.App.GetCalendarTimelineData).toHaveBeenCalledTimes(2);
    });

    test('marks due-task days and lists unfinished tasks before linked notes', async () => {
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue({
            ...monthData,
            days_with_due_tasks: [15],
            day_summaries: [
                { day: 15, note_count: 1, due_titles: ['Submit report'] },
                { day: 20, note_count: 1, due_titles: [] },
            ],
        });
        window.go.desktop.App.GetTasksDueOnDate.mockResolvedValue([
            { file: 'tasks.md', file_name: 'tasks.md', line: 3, text: 'Submit report', due_date: '2025-01-15' },
        ]);
        window.go.desktop.App.GetLinkedNotesForDate.mockResolvedValue([
            { path: 'tasks.md', name: 'tasks.md', line_num: 3 },
            { path: 'notes.md', name: 'notes.md', line_num: 1 },
        ]);

        renderCalendar();
        await flushCalendar();
        expect(document.querySelector('[data-date="2025-01-15"]').classList.contains('has-due-task')).toBe(true);

        window.calendarDayClick('2025-01-15');
        await flushCalendar();

        const details = document.getElementById('cal-linked-notes');
        expect(details.textContent).toContain('Due tasks');
        expect(details.textContent).toContain('Submit report');
        expect(details.textContent).toContain('Linked notes');
        expect(details.querySelectorAll('.cal-linked-note-item')).toHaveLength(1);
    });

    test('uses the OS locale week order and marks locale weekends without fading normal days', async () => {
        Object.defineProperty(navigator, 'languages', { value: ['es-ES'], configurable: true });
        Object.defineProperty(navigator, 'language', { value: 'es-ES', configurable: true });
        setState('currentCalDate', new Date(2026, 4, 1));
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue({
            year: 2026,
            month: 5,
            days_with_notes: [],
            days_with_links: [],
            days_with_due_tasks: [],
            day_summaries: [],
            calendar: [],
        });

        renderCalendar();
        await flushCalendar();

        const headers = [...document.querySelectorAll('#calendar-grid .cal-day-header')];
        expect(headers[0].getAttribute('aria-label').toLocaleLowerCase('es-ES')).toBe('lunes');
        const cells = [...document.getElementById('calendar-grid').children].slice(7);
        const mayFirst = cells.findIndex(cell => cell.dataset.date === '2026-05-01');
        expect(mayFirst % 7).toBe(4);
        expect(document.querySelector('[data-date="2026-05-02"]').classList.contains('ui-date-picker-day--weekend')).toBe(true);
        expect(document.querySelector('[data-date="2026-05-03"]').classList.contains('ui-date-picker-day--weekend')).toBe(true);
        expect(document.querySelector('[data-date="2026-05-04"]').classList.contains('no-notes')).toBe(false);
        expect(document.querySelector('[data-date="2026-05-04"].ui-date-picker-day--weekend')).toBeNull();
    });

    test('renders note-density levels and exposes every due title on hover and focus', async () => {
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue({
            ...monthData,
            days_with_notes: [12, 13, 14, 15, 16],
            days_with_links: [],
            days_with_due_tasks: [15],
            day_summaries: [
                { day: 12, note_count: 1, due_titles: [] },
                { day: 13, note_count: 3, due_titles: [] },
                { day: 14, note_count: 6, due_titles: [] },
                { day: 15, note_count: 9, due_titles: ['Publish release notes', 'Review migration guide'] },
                { day: 16, note_count: 10, due_titles: [] },
            ],
        });

        renderCalendar();
        await flushCalendar();

        expect(document.querySelector('[data-date="2025-01-12"]').classList.contains('ui-date-picker-day--note-1')).toBe(true);
        expect(document.querySelector('[data-date="2025-01-13"]').classList.contains('ui-date-picker-day--note-2')).toBe(true);
        expect(document.querySelector('[data-date="2025-01-14"]').classList.contains('ui-date-picker-day--note-3')).toBe(true);
        const dueDay = document.querySelector('[data-date="2025-01-15"]');
        expect(dueDay.classList.contains('ui-date-picker-day--note-4')).toBe(true);
        expect(dueDay.classList.contains('ui-date-picker-day--due')).toBe(true);
        expect(document.querySelector('[data-date="2025-01-16"]').classList.contains('ui-date-picker-day--note-5')).toBe(true);
        expect(dueDay.getAttribute('aria-label')).toContain('Publish release notes; Review migration guide');

        dueDay.dispatchEvent(new Event('pointerenter'));
        const tooltip = document.getElementById('calendar-day-tooltip');
        expect(tooltip.hidden).toBe(false);
        expect(tooltip.textContent).toContain('9 notes');
        expect(tooltip.textContent).toContain('Publish release notes');
        expect(tooltip.textContent).toContain('Review migration guide');
        expect(dueDay.getAttribute('aria-describedby')).toBe('calendar-day-tooltip');

        dueDay.dispatchEvent(new Event('pointerleave'));
        expect(tooltip.hidden).toBe(true);
        dueDay.focus();
        expect(tooltip.hidden).toBe(false);
        dueDay.blur();
        expect(tooltip.hidden).toBe(true);
    });

    test('moves the full Today selection only among actionable days and restores note intensity', async () => {
        const now = new Date();
        const day = now.getDate();
        const noteDay = day === 1 ? 2 : 1;
        const inactiveLinkedDay = [1, 2, 3, 4].find(candidate => candidate !== day && candidate !== noteDay);
        setState('currentCalDate', new Date(now.getFullYear(), now.getMonth(), day));
        setState('selectedCalDateStr', null);
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue({
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            days_with_notes: [day, noteDay],
            // Structured summaries are authoritative: a legacy link-only day
            // can be a completed semantic due link and is not actionable.
            days_with_links: [inactiveLinkedDay],
            days_with_due_tasks: [],
            day_summaries: [
                { day, note_count: 6, due_titles: [] },
                { day: noteDay, note_count: 1, due_titles: [] },
            ],
            calendar: [],
        });

        renderCalendar();
        await flushCalendar();

        let today = document.querySelector('.cal-day[aria-current="date"]');
        expect(today.tagName).toBe('BUTTON');
        expect(today.classList.contains('ui-date-picker-day--note-3')).toBe(true);
        expect(today.classList.contains('selected')).toBe(true);
        const inactiveDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(inactiveLinkedDay).padStart(2, '0')}`;
        const emptyDay = document.querySelector(`[data-date="${inactiveDate}"]`);
        expect(emptyDay.tagName).toBe('SPAN');

        const noteDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(noteDay).padStart(2, '0')}`;
        document.querySelector(`[data-date="${noteDate}"]`).click();
        await flushCalendar();
        today = document.querySelector('.cal-day[aria-current="date"]');
        let note = document.querySelector(`[data-date="${noteDate}"]`);
        expect(today.classList.contains('selected')).toBe(false);
        expect(today.classList.contains('ui-date-picker-day--note-3')).toBe(true);
        expect(note.classList.contains('selected')).toBe(true);

        today.click();
        await flushCalendar();
        today = document.querySelector('.cal-day[aria-current="date"]');
        note = document.querySelector(`[data-date="${noteDate}"]`);
        expect(today.classList.contains('selected')).toBe(true);
        expect(note.classList.contains('selected')).toBe(false);
        expect(note.classList.contains('ui-date-picker-day--note-1')).toBe(true);
    });

    test('reprojects an accepted date shortcut from the dirty editor without waiting for save', async () => {
        mountActiveCalendarWorkspace();
        setState('currentCalDate', new Date(2025, 0, 15));
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue({
            year: 2025,
            month: 1,
            days_with_notes: [],
            days_with_links: [],
            days_with_due_tasks: [],
            day_summaries: [],
            calendar: [],
        });
        renderCalendar();
        await flushCalendar();
        const tab = {
            id: 'tab-plan', type: 'file', path: 'notes/plan.md', title: 'plan.md',
            dirty: true, _content: 'No date yet',
        };
        setState('openTabs', [tab]);
        document.dispatchEvent(new CustomEvent('active-file-dirty', { detail: { path: tab.path } }));
        tab._content = '[2025-01-16](2025-01-16.md)';
        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: tab.path, content: tab._content },
        }));
        await new Promise(resolve => setTimeout(resolve, 25));
        await flushCalendar();

        const tomorrow = document.querySelector('[data-date="2025-01-16"]');
        expect(tomorrow.classList.contains('ui-date-picker-day--note-1')).toBe(true);
        tomorrow.click();
        await flushCalendar();
        const details = document.getElementById('cal-linked-notes');
        expect(details.textContent).toContain('Linked notes');
        expect(details.textContent).toContain('plan.md');
        expect(window.go.desktop.App.SaveFile).not.toHaveBeenCalled();
    });

    test('renders compact empty-date guidance when a selected date has no tasks or linked notes', async () => {
        setState('selectedCalDateStr', '2025-01-15');

        renderCalendar();
        await flushCalendar();

        const guidance = document.querySelector('#cal-linked-notes .cal-no-notes');
        expect(guidance).not.toBeNull();
        expect(guidance.textContent).toBe('No tasks or notes for this date');
        expect(document.querySelector('#cal-linked-notes .cal-due-task-item')).toBeNull();
        expect(document.querySelector('#cal-linked-notes .cal-linked-note-item')).toBeNull();
    });
});
