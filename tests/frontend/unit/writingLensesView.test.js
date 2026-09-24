import { createWritingLensesView } from '../../../frontend/js/views/writingLensesView.js';
import { initTooltips } from '../../../frontend/js/tooltip.js';

test('configured lenses collapse behind an accessible disclosure and expose short summaries when expanded', () => {
    const view = createWritingLensesView({ onChange() {}, onRetry() {} });
    document.body.replaceChildren(view.element);
    view.update({ preferences: { lenses: ['grammar'], language: 'en-US' }, status: 'saved', documentKey: 'Memo.md' });
    const toggle = view.element.querySelector('[data-configure]');
    expect(toggle.className).toBe('ui-disclosure-trigger');
    expect(toggle.getAttribute('aria-label')).toBe('Lenses, 1 selected');
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); expect(view.element.querySelector('.ui-disclosure-body').inert).toBe(true);
    toggle.click(); expect(view.element.querySelector('.ui-disclosure-body').inert).toBe(false);
    expect(view.element.querySelector('#writing-lenses-proofreading-description').textContent).toBe('Catch spelling, punctuation, repetition, and consistency issues.');
    view.update({ preferences: { lenses: [], language: 'none' }, status: 'saved', documentKey: 'New.md' });
    expect(view.element.querySelector('.ui-disclosure-body').inert).toBe(false); view.destroy();
});

test('Pure lens setup stays visible while the pane disclosure preserves focus and expansion during saved updates', () => {
    const preferences = { lenses: ['direct'], language: 'en-US' };
    const view = createWritingLensesView({ onChange() {}, onRetry() {} });
    document.body.replaceChildren(view.element);
    view.update({ preferences, status: 'saved', documentKey: 'Memo.md' });
    const trigger = view.element.querySelector('[data-configure]');
    trigger.focus(); trigger.click();
    const arrow = trigger.querySelector('svg');
    view.update({ preferences, status: 'saving', documentKey: 'Memo.md' });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.querySelector('svg')).toBe(arrow);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(view.element.querySelector('.ui-disclosure').dataset.animate).toBe('true');
    view.destroy();
    const pure = createWritingLensesView({ id: 'pure-lenses', compact: false, onChange() {}, onRetry() {} });
    pure.update({ preferences, status: 'saved', documentKey: 'Memo.md' });
    expect(pure.element.querySelector('[data-configure]').hidden).toBe(true);
    expect(pure.element.querySelector('.ui-disclosure-body').inert).toBe(false);
    expect(pure.element.querySelector('legend').hidden).toBe(false);
    pure.destroy();
});

test('writing lens error states keep save retries editable and load retries keyboard reachable', () => {
    const onRetry = jest.fn();
    const view = createWritingLensesView({ id: 'error-lenses', onChange: jest.fn(), onRetry });
    document.body.replaceChildren(view.element);
    const preferences = { primary: 'direct', overlays: ['spelling'], language: 'en-US' };
    view.update({ preferences, status: 'save-error', error: 'Couldn’t save preferences.' });
    expect(view.element.querySelector('.ui-notice--warning').textContent).toContain('Couldn’t save');
    expect(view.element.querySelector('input[value="directness"]').disabled).toBe(false);
    expect(view.element.querySelector('[data-retry]').hidden).toBe(false);
    view.element.querySelector('[data-retry]').click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    view.update({ preferences, status: 'load-error', error: 'Couldn’t load preferences.' });
    expect(view.element.querySelector('input[value="directness"]').disabled).toBe(true);
    expect(view.element.querySelector('input[value="proofreading"]').disabled).toBe(true);
    view.focus();
    expect(document.activeElement).toBe(view.element.querySelector('[data-retry]'));
    view.element.remove();
});

test('writing controls offer equal lens checkboxes and one document language without profile or primary', () => {
    const onChange = jest.fn();
    const view = createWritingLensesView({ onChange, onRetry() {} });
    document.body.replaceChildren(view.element);
    view.update({ preferences: { lenses: ['direct', 'spelling'], language: 'en-US' }, status: 'saved' });
    expect(view.element.textContent).toContain('Lenses');
    expect(view.element.textContent).not.toMatch(/Primary|Writing profile|Settings|Properties/);
    expect(view.element.querySelectorAll('input[type="checkbox"]')).toHaveLength(5);
    const direct = view.element.querySelector('input[value="directness"]');
    expect(direct.checked).toBe(true); expect(direct.disabled).toBe(false);
    direct.click(); expect(onChange).toHaveBeenCalledWith({ type: 'lens', value: 'directness', enabled: false });
});

test('five consolidated lens checkboxes expose complete selection, partial legacy selection, and counts', () => {
    const onChange = jest.fn();
    const view = createWritingLensesView({ onChange, onRetry() {} });
    document.body.replaceChildren(view.element);
    const all = ['spelling', 'plain', 'direct', 'repetition', 'consistency', 'grammar', 'readability', 'inclusive', 'formulaic'];
    view.update({ preferences: { lenses: all, language: 'en-US' }, status: 'saved' });
    expect([...view.element.querySelectorAll('label > span:first-of-type')].map(span => span.textContent)).toEqual(['Proofreading', 'Clarity', 'Directness', 'Inclusive language', 'Formulaic writing']);
    expect(view.element.querySelector('.ui-disclosure-label').textContent).toBe('Lenses');
    expect(view.element.querySelector('.ui-disclosure-summary').textContent).toBe('5 selected');
    for (const input of view.element.querySelectorAll('input')) {
        expect(input.checked).toBe(true); expect(input.indeterminate).toBe(false);
        expect(input.closest('label').querySelector('[data-partial]').hidden).toBe(true);
        input.click(); expect(onChange).toHaveBeenLastCalledWith({ type: 'lens', value: input.value, enabled: false });
    }
    view.update({ preferences: { lenses: ['spelling', 'plain'], language: 'en-US' }, status: 'saved' });
    expect(view.element.querySelector('.ui-disclosure-summary').textContent).toBe('2 selected');
    for (const id of ['proofreading', 'clarity']) {
        const input = view.element.querySelector(`input[value="${id}"]`);
        expect(input.checked).toBe(false); expect(input.indeterminate).toBe(true);
        expect(input.closest('label').querySelector('[data-partial]').hidden).toBe(false);
        expect(input.getAttribute('aria-description')).toContain('to enable all supported checks');
        input.click(); expect(onChange).toHaveBeenLastCalledWith({ type: 'lens', value: id, enabled: true });
    }
    view.destroy();
});

test('language is the first Settings combobox; unsupported lenses are disabled and unchecked', () => {
    const onChange = jest.fn(), onApplyAll = jest.fn();
    const view = createWritingLensesView({ onChange, onApplyAll, onRetry() {} });
    document.body.replaceChildren(view.element);
    const preferences = { lenses: ['spelling', 'direct'], language: 'es' };
    view.update({ preferences, status: 'saved' });
    expect(view.element.firstElementChild.querySelector('.ui-picker--quiet [role="combobox"]')).not.toBeNull();
    expect([...view.element.querySelectorAll('select option')].map(option => option.value)).toEqual(['none', 'en-US', 'en-GB', 'es']);
    const input = id => view.element.querySelector(`input[value="${id}"]`);
    expect(input('proofreading').disabled).toBe(false);
    expect(input('proofreading').checked).toBe(true);
    expect(input('proofreading').indeterminate).toBe(false);
    expect(input('proofreading').getAttribute('aria-description')).toBe('Available checks: Spelling. Other checks in Proofreading currently support English.');
    for (const id of ['clarity', 'directness', 'inclusive-language', 'formulaic-writing']) expect(input(id).disabled).toBe(true);
    expect(input('directness').checked).toBe(false);
    input('directness').click(); expect(onChange).not.toHaveBeenCalled();
    const combobox = view.element.querySelector('[role="combobox"]');
    combobox.click();
    combobox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    combobox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith({ type: 'language', value: 'none' });
    view.update({ preferences: { ...preferences, language: 'none' }, status: 'saved' });
    expect([...view.element.querySelectorAll('input')].every(input => input.disabled)).toBe(true);
    view.update({ preferences: { lenses: ['spelling'], language: 'en-GB' }, status: 'saved' });
    expect(input('directness').checked).toBe(false); expect(input('directness').disabled).toBe(false);
    const apply = view.element.querySelector('[data-apply-all]');
    expect(apply.previousElementSibling.textContent).toBe('Choices saved for this document.');
    apply.click(); expect(onApplyAll).toHaveBeenCalledTimes(1);
    view.update({ preferences, status: 'saved', applying: true });
    expect(apply.disabled).toBe(true); expect(combobox.disabled).toBe(true);
    view.destroy();
});

test('disabled lens reasons become coverage descriptions when the lens is available', async () => {
    const onChange = jest.fn();
    const view = createWritingLensesView({ onChange, onRetry() {} });
    document.body.replaceChildren(view.element);
    const tooltips = initTooltips({ root: document, showDelay: 0 });
    const direct = view.element.querySelector('input[value="directness"]');
    direct.getBoundingClientRect = () => ({ left: 100, right: 116, top: 100, bottom: 116, width: 16, height: 16 });
    try {
        view.update({ preferences: { language: 'es' }, status: 'saved' });
        const reason = 'Directness is only available for English (US) and English (UK).';
        expect(direct.getAttribute('aria-description')).toBe(reason);
        direct.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        const tooltip = document.getElementById('ui-tooltip');
        expect(tooltip.hidden).toBe(false);
        expect(tooltip.textContent).toBe(reason);
        direct.closest('label').click();
        expect(onChange).not.toHaveBeenCalled();
        expect(tooltip.hidden).toBe(false);
        expect(direct.getAttribute('aria-describedby')).toBe('writing-lenses-availability writing-lenses-directness-count writing-lenses-directness-description ui-tooltip');

        view.update({ preferences: { language: 'none' }, status: 'saved' });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(tooltip.textContent).toBe('Choose an analysis language to activate this lens.');
        direct.closest('label').querySelector('span').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        expect(tooltip.hidden).toBe(false);

        view.update({ preferences: { language: 'en-US' }, status: 'saved' });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(tooltip.hidden).toBe(false);
        expect(tooltip.textContent).toContain('passive voice');
        expect(direct.getAttribute('aria-description')).toContain('passive voice');
        expect(direct.getAttribute('aria-describedby')).toContain('writing-lenses-directness-description');
        direct.click();
        expect(onChange).toHaveBeenCalledWith({ type: 'lens', value: 'directness', enabled: true });
    } finally {
        tooltips.destroy(); view.destroy();
    }
});


test('Proofreading offers dictionary management even when spelling is disabled', () => {
    const onManageDictionary = jest.fn();
    const view = createWritingLensesView({ onChange() {}, onRetry() {}, onManageDictionary });
    document.body.append(view.element);
    view.update({ preferences: { language: 'none', lenses: [] }, status: 'saved' });
    const button = view.element.querySelector('[data-manage-dictionary]');
    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.parentElement.querySelector('input').value).toBe('proofreading');
    button.click(); expect(onManageDictionary).toHaveBeenCalledTimes(1);
    view.destroy(); view.element.remove();
});

test('selected lenses show an accessible finding count that clears when analysis is unavailable', () => {
    const view = createWritingLensesView({ compact: false, onChange() {}, onRetry() {} });
    document.body.replaceChildren(view.element);
    view.update({ preferences: { lenses: ['plain', 'readability', 'direct'], language: 'en-US' }, status: 'saved', documentKey: 'Memo.md' });
    const badge = id => view.element.querySelector(`input[value="${id}"]`).closest('label').querySelector('[data-count]');
    view.setCounts({ proofreading: 4, clarity: 12, directness: 1, 'inclusive-language': 0, 'formulaic-writing': 0 });
    expect(badge('clarity').hidden).toBe(false);
    expect(badge('clarity').className).toBe('ui-badge ui-badge--muted');
    expect(badge('clarity').textContent).toBe('12'); expect(badge('clarity').getAttribute('aria-hidden')).toBe('true');
    const clarity = view.element.querySelector('input[value="clarity"]');
    // The checkbox keeps its name; the count is part of its description.
    expect(clarity.closest('label').textContent).not.toContain('suggestions');
    expect(clarity.getAttribute('aria-describedby').split(' ')).toContain('writing-lenses-clarity-count');
    expect(view.element.querySelector('#writing-lenses-clarity-count').textContent).toBe('12 suggestions.');
    expect(view.element.querySelector('#writing-lenses-directness-count').textContent).toBe('1 suggestion.');
    // Unselected groups and zero counts stay quiet.
    expect(badge('proofreading').hidden).toBe(true);
    expect(badge('formulaic-writing').hidden).toBe(true);
    view.update({ preferences: { lenses: ['readability'], language: 'en-US' }, status: 'saved', documentKey: 'Memo.md' });
    expect(badge('clarity').hidden).toBe(false);
    expect(view.element.querySelector('input[value="clarity"]').indeterminate).toBe(true);
    view.setCounts(null);
    expect(badge('clarity').hidden).toBe(true);
    expect(view.element.querySelector('#writing-lenses-clarity-count').textContent).toBe('');
    view.destroy();
});
