import { testUtils } from './test_setup.js';
import {
    closeDatePicker,
    configureDatePickerCalendarSource,
    openDatePicker,
} from '../frontend/js/datePicker.js';

describe('Due date picker', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        closeDatePicker({ restoreFocus: false });
        configureDatePickerCalendarSource({ loadMonthData: null });
    });

    test('offers shortcuts, a keyboard grid, clear, and focus restoration', async () => {
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        const onSelect = jest.fn();
        const picker = openDatePicker({
            anchor,
            value: '2026-08-14',
            now: () => new Date(2026, 7, 4, 12),
            locale: 'en-US',
            onSelect,
        });

        expect(picker.getAttribute('role')).toBe('dialog');
        expect(picker.querySelectorAll('.ui-date-picker-day')).toHaveLength(31);
        expect(picker.querySelectorAll('.cal-empty')).toHaveLength(11);
        expect([...picker.querySelectorAll('.ui-date-picker-weekdays .cal-day-header')]
            .map(day => day.textContent.trim())).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
        expect(picker.querySelector('.ui-date-picker-grid').classList.contains('calendar-grid')).toBe(true);
        expect(picker.querySelector('[data-date-picker-day="2026-08-14"]').classList.contains('selected')).toBe(true);
        expect(picker.querySelector('.ui-date-picker-clear').disabled).toBe(false);
        expect(picker.textContent).toContain('Today');
        expect(picker.textContent).toContain('Tomorrow');
        expect(picker.textContent).toContain('Next week');

        picker.querySelector('[data-date-picker-day="2026-08-14"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement.dataset.datePickerDay).toBe('2026-08-15');
        document.activeElement.click();
        await Promise.resolve();

        expect(onSelect).toHaveBeenCalledWith('2026-08-15');
        expect(document.querySelector('.ui-date-picker')).toBeNull();
        expect(document.activeElement).toBe(anchor);
    });

    test('selects Today by default and mirrors activity, weekend, due, and tooltip states', async () => {
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        const loadMonthData = jest.fn().mockResolvedValue({
            day_summaries: [
                { day: 4, note_count: 6, due_titles: [] },
                { day: 8, note_count: 1, due_titles: ['Ship release'] },
            ],
        });
        const picker = openDatePicker({
            anchor,
            onSelect: jest.fn(),
            now: () => new Date(2026, 7, 4, 12),
            locale: 'en-US',
            loadMonthData,
        });

        const today = picker.querySelector('[data-date-picker-day="2026-08-04"]');
        expect(today.classList.contains('selected')).toBe(true);
        expect(today.getAttribute('aria-selected')).toBe('true');
        expect(today.getAttribute('aria-current')).toBe('date');
        expect(document.activeElement).toBe(today);
        expect(picker.querySelector('.ui-date-picker-clear').disabled).toBe(true);
        expect(picker.querySelector('.ui-date-picker-grid').getAttribute('aria-busy')).toBe('true');

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(loadMonthData).toHaveBeenCalledWith(2026, 7);
        expect(picker.querySelector('.ui-date-picker-grid').getAttribute('aria-busy')).toBe('false');
        const refreshedToday = picker.querySelector('[data-date-picker-day="2026-08-04"]');
        const weekendDue = picker.querySelector('[data-date-picker-day="2026-08-08"]');
        expect(refreshedToday.classList).toContain('ui-date-picker-day--note-3');
        expect(refreshedToday.classList).toContain('selected');
        expect(weekendDue.classList).toContain('ui-date-picker-day--weekend');
        expect(weekendDue.classList).toContain('ui-date-picker-day--note-1');
        expect(weekendDue.classList).toContain('ui-date-picker-day--due');
        expect(weekendDue.getAttribute('aria-label'))
            .toMatch(/Weekend.*1 note.*1 due item: Ship release/);

        weekendDue.dispatchEvent(new Event('pointerenter'));
        const tooltip = document.getElementById('calendar-day-tooltip');
        expect(tooltip.hidden).toBe(false);
        expect(tooltip.textContent).toMatch(/1 note.*Due item.*Ship release/);
    });

    test('closes on Escape without selecting a date', () => {
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        const onSelect = jest.fn();
        const picker = openDatePicker({ anchor, onSelect, now: () => new Date(2026, 7, 4, 12) });

        picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(onSelect).not.toHaveBeenCalled();
        expect(document.querySelector('.ui-date-picker')).toBeNull();
        expect(document.activeElement).toBe(anchor);
    });

    test('can position the shared picker at an editor cursor rectangle', () => {
        const anchor = document.createElement('div');
        anchor.tabIndex = -1;
        document.body.appendChild(anchor);
        const picker = openDatePicker({
            anchor,
            anchorRect: { left: 120, right: 121, top: 80, bottom: 98, width: 1, height: 18 },
            onSelect: jest.fn(),
            now: () => new Date(2026, 7, 4, 12),
        });

        expect(picker.style.left).toBe('120px');
        expect(picker.style.top).toBe('104px');
    });
});
