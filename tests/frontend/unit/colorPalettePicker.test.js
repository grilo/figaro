import { openColorPalettePicker } from '../../../frontend/js/colorPalettePicker.js';

describe('shared color palette picker', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="anchor" type="button">Color</button>';
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 240 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
        document.getElementById('anchor').getBoundingClientRect = () => ({
            top: 40,
            right: 220,
            bottom: 68,
            left: 192,
            width: 28,
            height: 28,
        });
    });

    afterEach(() => {
        document.querySelector('.kanban-color-picker')?.remove();
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('reuses the Kanban palette, exposes selection state, and restores trigger focus', () => {
        jest.useFakeTimers();
        const anchor = document.getElementById('anchor');
        const onSelect = jest.fn();
        const control = openColorPalettePicker(anchor, {
            currentColor: '#14b8a6',
            emptyLabel: 'Automatic color',
            label: 'Choose chart color',
            onSelect,
        });

        expect(control.picker.classList.contains('kanban-color-picker')).toBe(true);
        expect(control.picker.getAttribute('role')).toBe('listbox');
        expect(control.picker.getAttribute('aria-label')).toBe('Choose chart color');
        expect(control.picker.style.left).toBe('22px');
        expect(control.picker.style.width).toBe('210px');
        expect(anchor.getAttribute('aria-expanded')).toBe('true');
        expect(anchor.getAttribute('aria-controls')).toBe(control.picker.id);
        expect(control.picker.querySelectorAll('.kanban-color-swatch')).toHaveLength(12);
        expect(control.picker.querySelector('[data-color=""]')?.getAttribute('aria-label'))
            .toBe('Automatic color');
        expect(control.picker.querySelector('[data-color="#14b8a6"]')?.getAttribute('aria-selected'))
            .toBe('true');

        control.picker.querySelector('[data-color="#22c55e"]').click();

        expect(onSelect).toHaveBeenCalledWith('#22c55e');
        expect(control.picker.isConnected).toBe(false);
        expect(anchor.getAttribute('aria-expanded')).toBe('false');
        expect(anchor.hasAttribute('aria-controls')).toBe(false);
        expect(document.activeElement).toBe(anchor);
    });

    test('can omit the automatic option and closes on Escape from a swatch', () => {
        jest.useFakeTimers();
        const anchor = document.getElementById('anchor');
        const control = openColorPalettePicker(anchor, {
            includeEmpty: false,
            label: 'Choose threshold color',
        });
        const first = control.picker.querySelector('.kanban-color-swatch');
        first.focus();

        expect(control.picker.querySelector('[data-color=""]')).toBeNull();
        first.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));

        expect(control.picker.isConnected).toBe(false);
        expect(document.activeElement).toBe(anchor);
    });
});
