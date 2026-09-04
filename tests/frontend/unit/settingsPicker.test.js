import { enhanceSettingsPicker } from '../../../frontend/js/settingsPicker.js';

describe('shared Settings appearance picker', () => {
    beforeEach(() => {
        document.body.innerHTML = `<div class="ui-picker">
            <button class="ui-picker-trigger"><span data-picker-value></span><svg></svg></button>
            <div class="ui-menu ui-picker-menu"></div>
            <button id="after">After</button>
        </div>`;
    });

    test('exposes combobox semantics and changes an option from the keyboard', () => {
        const changed = jest.fn();
        const trigger = document.querySelector('.ui-picker-trigger');
        const menu = document.querySelector('.ui-picker-menu');
        enhanceSettingsPicker({
            trigger,
            menu,
            options: [
                { id: 'dark', name: 'Figaro Dark' },
                { id: 'light', name: 'Figaro Light' },
            ],
            value: 'dark',
            ariaLabel: 'Theme',
            onChange: changed,
        });

        expect(trigger.getAttribute('role')).toBe('combobox');
        expect(trigger.getAttribute('aria-label')).toBe('Theme');
        expect(menu.getAttribute('role')).toBe('listbox');
        expect(menu.hidden).toBe(true);
        expect(menu.querySelectorAll('[role="option"]')).toHaveLength(2);
        expect(menu.querySelector('[aria-selected="true"]').dataset.value).toBe('dark');

        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(changed).toHaveBeenCalledWith('light');
        expect(trigger.querySelector('[data-picker-value]').textContent).toBe('Figaro Light');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(menu.hidden).toBe(true);
    });

    test('closes on Escape or Tab and supports pointer choice', () => {
        const changed = jest.fn();
        const trigger = document.querySelector('.ui-picker-trigger');
        const menu = document.querySelector('.ui-picker-menu');
        enhanceSettingsPicker({
            trigger,
            menu,
            options: [{ value: 'inter', label: 'Inter' }, { value: 'figtree', label: 'Figtree' }],
            value: 'inter',
            ariaLabel: 'Font',
            onChange: changed,
        });

        trigger.click();
        expect(menu.parentElement).toBe(document.body);
        expect(menu.dataset.floating).toBe('true');
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(menu.hidden).toBe(true);
        expect(menu.parentElement).toBe(trigger.parentElement);
        trigger.click();
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        expect(menu.hidden).toBe(true);
        trigger.click();
        menu.querySelector('[data-value="figtree"]').click();
        expect(changed).toHaveBeenCalledWith('figtree');
    });

    test('keeps its portalled menu aligned to the trigger while the page moves', () => {
        const trigger = document.querySelector('.ui-picker-trigger');
        const menu = document.querySelector('.ui-picker-menu');
        const bounds = jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
            top: 210, right: 190, bottom: 240, left: 90, width: 100,
        });
        Object.defineProperty(menu, 'scrollWidth', { configurable: true, value: 180 });
        Object.defineProperty(menu, 'scrollHeight', { configurable: true, value: 90 });
        enhanceSettingsPicker({
            trigger, menu,
            options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'A longer choice' }],
            value: 'one', ariaLabel: 'Example',
        });

        trigger.click();
        expect(menu.parentElement).toBe(document.body);
        expect(menu.style.left).toBe('90px');
        expect(menu.style.top).toBe('246px');
        expect(menu.style.width).toBe('180px');

        bounds.mockReturnValue({ top: 110, right: 190, bottom: 140, left: 40, width: 150 });
        window.dispatchEvent(new Event('scroll'));
        expect(menu.style.left).toBe('40px');
        expect(menu.style.top).toBe('146px');
        trigger._figaroSettingsPicker.destroy();
        expect(menu.parentElement).toBe(trigger.parentElement);
    });
});
