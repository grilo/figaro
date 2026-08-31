import { enhanceSelectCombobox } from '../../../frontend/js/selectCombobox.js';

describe('select combobox', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <label for="diagram">Diagram</label>
            <select id="diagram">
                <option value="flow">Flowchart</option>
                <option value="sequence">Sequence</option>
            </select>`;
    });

    test('refreshes its accessible popup when the underlying options change', () => {
        const select = document.getElementById('diagram');
        const change = jest.fn();
        select.addEventListener('change', change);
        const combobox = enhanceSelectCombobox(select);

        select.replaceChildren();
        for (const [value, label] of [['basic', 'Basic'], ['messages', 'Messages']]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.append(option);
        }
        select.value = 'basic';
        combobox.refresh();

        expect(combobox.trigger.textContent).toContain('Basic');
        expect(combobox.menu.querySelectorAll('[role="option"]')).toHaveLength(2);
        combobox.trigger.click();
        combobox.menu.querySelector('[data-value="messages"]').click();
        expect(select.value).toBe('messages');
        expect(combobox.trigger.textContent).toContain('Messages');
        expect(change).toHaveBeenCalledTimes(1);
    });

    test('keeps an open modal intact when Escape closes only the combobox popup', () => {
        const combobox = enhanceSelectCombobox(document.getElementById('diagram'));
        const parentEscape = jest.fn();
        document.addEventListener('keydown', parentEscape);

        combobox.trigger.click();
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        combobox.trigger.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(parentEscape).not.toHaveBeenCalled();
        expect(combobox.trigger.getAttribute('aria-expanded')).toBe('false');
        expect(combobox.menu.hidden).toBe(true);
        document.removeEventListener('keydown', parentEscape);
    });

    test('positions an open popup within the viewport and tracks its placement state', () => {
        const combobox = enhanceSelectCombobox(document.getElementById('diagram'));
        jest.spyOn(combobox.trigger, 'getBoundingClientRect').mockReturnValue({
            top: 300,
            right: 220,
            bottom: 330,
            left: 120,
            width: 100,
        });
        Object.defineProperty(combobox.menu, 'scrollHeight', { configurable: true, value: 360 });
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 240 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 350 });

        combobox.trigger.click();

        expect(combobox.menu.dataset.floating).toBe('true');
        expect(combobox.menu.dataset.placement).toBe('top');
        expect(combobox.menu.style.cssText).toContain('top: 8px');
        expect(combobox.menu.style.cssText).toContain('left: 120px');
        expect(combobox.menu.style.cssText).toContain('width: 100px');
        expect(combobox.menu.style.cssText).toContain('max-height: 286px');

        combobox.trigger.click();
        expect(combobox.menu.dataset.floating).toBeUndefined();
        expect(combobox.menu.style.cssText).toBe('');
    });
});
