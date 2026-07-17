import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/app.js', () => ({
    openTab: jest.fn(),
}));

import { setState } from '../frontend/js/state.js';
import { invalidateCalendarCache, renderCalendar } from '../frontend/js/calendar.js';

const monthData = {
    year: 2025,
    month: 1,
    days_with_notes: [15],
    days_with_links: [20],
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
        window.go.main.App.GetCalendarMonthData.mockResolvedValue(monthData);
        window.go.main.App.GetLinkedNotesForDate.mockResolvedValue([]);
    });

    test('reuses a month response when selecting a day instead of rescanning the vault', async () => {
        renderCalendar();
        await flushCalendar();

        expect(window.go.main.App.GetCalendarMonthData).toHaveBeenCalledTimes(1);
        expect(typeof window.calendarDayClick).toBe('function');

        window.calendarDayClick('2025-01-15');
        await flushCalendar();

        expect(window.go.main.App.GetCalendarMonthData).toHaveBeenCalledTimes(1);
    });

    test('drops the cached month after a vault change', async () => {
        renderCalendar();
        await flushCalendar();

        invalidateCalendarCache();
        renderCalendar();
        await flushCalendar();

        expect(window.go.main.App.GetCalendarMonthData).toHaveBeenCalledTimes(2);
    });
});
