/**
 * Async calendar regressions.
 */

import { testUtils } from './test_setup.js';
import { setState } from '../frontend/js/state.js';
import { renderCalendar } from '../frontend/js/calendar.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

function calendarData(year, month, day) {
    return {
        year,
        month,
        days_with_notes: [day],
        days_with_links: [],
        calendar: [[day]]
    };
}

describe('calendar async lifecycle', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        setState('selectedCalDateStr', null);
    });

    test('does not render a stale month after rapid month navigation', async () => {
        const slow = deferred();
        const fast = deferred();
        window.pywebview.api.get_calendar_month_data
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);

        setState('currentCalDate', new Date(2025, 0, 1));
        renderCalendar();
        setState('currentCalDate', new Date(2025, 1, 1));
        renderCalendar();

        fast.resolve(calendarData(2025, 2, 2));
        await Promise.resolve();
        await Promise.resolve();

        slow.resolve(calendarData(2025, 1, 1));
        await Promise.resolve();
        await Promise.resolve();

        const grid = document.getElementById('calendar-grid');
        expect(grid.querySelector('[data-date="2025-02-02"]')).not.toBeNull();
        expect(grid.querySelector('[data-date="2025-01-01"]')).toBeNull();
    });
});
