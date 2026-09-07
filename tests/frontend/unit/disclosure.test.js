import { createDisclosure } from '../../../frontend/js/disclosure.js';

function mount(options = {}) {
    const content = document.createElement('input');
    content.setAttribute('aria-label', 'Example option');
    const disclosure = createDisclosure({ id: 'example-options', label: 'Options', content, ...options });
    document.body.replaceChildren(disclosure.element);
    return { ...disclosure, content };
}

test('shared disclosure exposes its label and summary, with closed content inert and linked by aria-controls', () => {
    const view = mount();
    expect(view.trigger.getAttribute('aria-controls')).toBe(view.body.id);
    expect(view.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(view.body.inert).toBe(true);
    expect(view.body.getAttribute('aria-hidden')).toBe('true');
    expect(view.element.querySelector('.ui-disclosure-chevron').getAttribute('aria-hidden')).toBe('true');
    view.setSummary('5 selected');
    expect(view.trigger.getAttribute('aria-label')).toBe('Options, 5 selected');
    expect(view.element.querySelector('.ui-disclosure-summary').hidden).toBe(false);
    view.setSummary('');
    expect(view.trigger.getAttribute('aria-label')).toBe('Options');
    expect(view.element.querySelector('.ui-disclosure-summary').hidden).toBe(true);
    view.destroy();
});

test('shared disclosure reverses rapid toggles without timers and preserves an ongoing transition during refresh', () => {
    const onChange = jest.fn();
    const view = mount({ onChange });
    expect(view.element.dataset.animate).toBe('false');
    view.trigger.click();
    expect(view.body.inert).toBe(false);
    expect(view.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(view.element.dataset.animate).toBe('true');
    const chevron = view.trigger.querySelector('svg');
    view.setExpanded(true); view.setSummary('2 selected');
    expect(view.element.dataset.animate).toBe('true');
    expect(view.trigger.querySelector('svg')).toBe(chevron);
    view.trigger.click(); view.trigger.click();
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
    expect(view.body.inert).toBe(false);
    view.destroy(); view.trigger.click(); view.setExpanded(false);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(view.trigger.getAttribute('aria-expanded')).toBe('true');
});

test('programmatic disclosure collapse returns child focus to its trigger before hiding content', () => {
    const onChange = jest.fn();
    const view = mount({ expanded: true, onChange });
    view.content.focus();
    expect(document.activeElement).toBe(view.content);
    view.setExpanded(false);
    expect(document.activeElement).toBe(view.trigger);
    expect(view.body.inert).toBe(true);
    expect(view.body.getAttribute('aria-hidden')).toBe('true');
    expect(view.element.dataset.animate).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
    view.destroy();
});

test('disabled and busy disclosures do not activate and can recover without losing their contents', () => {
    const onChange = jest.fn();
    const view = mount({ onChange });
    view.setDisabled(true, { busy: true });
    expect(view.trigger.disabled).toBe(true);
    expect(view.trigger.getAttribute('aria-busy')).toBe('true');
    view.trigger.click();
    expect(onChange).not.toHaveBeenCalled();
    view.setDisabled(false);
    expect(view.trigger.getAttribute('aria-busy')).toBe('false');
    view.trigger.click();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(view.body.contains(view.content)).toBe(true);
    view.destroy();
});
