import { testUtils } from './test_setup.js';
import { closeDatePicker, openDatePicker } from '../frontend/js/datePicker.js';

describe('Due date picker', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        closeDatePicker({ restoreFocus: false });
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
        expect(picker.querySelectorAll('.ui-date-picker-day')).toHaveLength(42);
        expect(picker.querySelector('[data-date-picker-day="2026-08-14"]').classList.contains('selected')).toBe(true);
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
