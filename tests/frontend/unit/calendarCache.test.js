import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/app.js', () => ({
    openTab: jest.fn(),
}));

import { setState } from '../frontend/js/state.js';
import { invalidateCalendarCache, refreshCalendarIfVisible, renderCalendar } from '../frontend/js/calendar.js';

const monthData = {
    year: 2025,
    month: 1,
    days_with_notes: [15],
    days_with_links: [20],
    days_with_due_tasks: [],
    calendar: [[0, 0, 0, 15, 0, 0, 0]],
};

async function flushCalendar() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('Calendar cache', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        invalidateCalendarCache();
        setState('currentCalDate', new Date(2025, 0, 15));
        setState('selectedCalDateStr', null);
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue(monthData);
        window.go.desktop.App.GetLinkedNotesForDate.mockResolvedValue([]);
        window.go.desktop.App.GetTasksDueOnDate.mockResolvedValue([]);
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

    test('refreshes the open left-sidebar Calendar after a vault change', async () => {
        const panel = document.getElementById('sidebar-calendar-panel');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');

        renderCalendar();
        await flushCalendar();
        invalidateCalendarCache();

        expect(refreshCalendarIfVisible()).toBe(true);
        await flushCalendar();

        expect(window.go.desktop.App.GetCalendarMonthData).toHaveBeenCalledTimes(2);
        expect(document.querySelectorAll('#calendar-grid .cal-day-header')).toHaveLength(7);
        expect(document.getElementById('calendar-grid').getAttribute('aria-busy')).toBe('false');
    });

    test('does not reload a hidden Calendar panel', () => {
        const panel = document.getElementById('sidebar-calendar-panel');
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');

        expect(refreshCalendarIfVisible()).toBe(false);
        expect(window.go.desktop.App.GetCalendarMonthData).not.toHaveBeenCalled();
    });

    test('marks due-task days and lists unfinished tasks before linked notes', async () => {
        window.go.desktop.App.GetCalendarMonthData.mockResolvedValue({
            ...monthData,
            days_with_due_tasks: [15],
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
});
