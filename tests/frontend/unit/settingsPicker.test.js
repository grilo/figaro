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
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(menu.hidden).toBe(true);
        trigger.click();
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        expect(menu.hidden).toBe(true);
        trigger.click();
        menu.querySelector('[data-value="figtree"]').click();
        expect(changed).toHaveBeenCalledWith('figtree');
    });
});
