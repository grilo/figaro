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
});
