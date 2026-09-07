import { writingLensHelp } from '../../../frontend/js/core/writingLensHelpModel.js';
import { writingLensGroups, writingLensGroupState } from '../../../frontend/js/core/writingLensesModel.js';
import { createWritingLensesView } from '../../../frontend/js/views/writingLensesView.js';

const english = { preferences: { language: 'en-US', lenses: ['spelling'] }, status: 'saved', documentKey: 'Memo.md' };

test('each lens has a short summary and three or four contextual examples with explicit limitations', () => {
    for (const group of writingLensGroups) {
        expect(group.description.split(' ').length).toBeLessThanOrEqual(12);
        const value = writingLensHelp(group.id, english);
        expect(value.examples.length).toBeGreaterThanOrEqual(3);
        expect(value.examples.length).toBeLessThanOrEqual(4);
        expect(value.examples.every(example => example.before && example.after && example.before !== example.after)).toBe(true);
        expect(value.limits.length).toBeGreaterThan(50);
    }
    expect(writingLensHelp('proofreading', english).limits).toContain('subject–verb agreement');
    expect(writingLensHelp('proofreading', english).limits).toContain('limited to reviewed corrections');
    expect(writingLensHelp('clarity', english).limits).toContain('do not measure writing quality');
    expect(writingLensHelp('clarity', english).limits).toContain('including plural forms');
    expect(writingLensHelp('direct', english).limits).toContain('overstate a claim');
    expect(writingLensHelp('inclusive', english).limits).toContain('identity or pronouns');
    expect(writingLensHelp('formulaic', english).limits).toContain('not evidence of AI authorship');
});

test('lens help moves partial selection detail out of the summary and keeps unavailable examples honest', () => {
    const state = writingLensGroupState('proofreading', english.preferences);
    expect(state.description).not.toContain('Enabled checks');
    expect(writingLensHelp('proofreading', english)).toMatchObject({ detail: 'Enabled checks: Spelling. Select Proofreading to enable all supported checks.', exampleNote: expect.stringContaining('not yet selected') });
    const spanish = { ...english, preferences: { language: 'es', lenses: ['spelling'] } };
    expect(writingLensHelp('proofreading', spanish)).toMatchObject({ coverage: expect.stringContaining('Spanish dictionary'), limits: expect.stringContaining('spelling only'), examples: expect.any(Array) });
    expect(writingLensHelp('proofreading', spanish).examples.map(example => example.after)).toEqual(['hola', 'gracias', 'escribir']);
    expect(writingLensHelp('direct', spanish)).toMatchObject({ examples: [], reason: expect.stringContaining('only available for English') });
    expect(writingLensHelp('proofreading', { ...english, preferences: { language: 'none' } })).toMatchObject({ examples: [], reason: expect.stringContaining('Choose an analysis language') });
});

describe('persistent lens help', () => {
    let view, onChange;
    const button = id => view.element.querySelector(`[data-lens-help="${id}"]`);
    const popup = () => document.getElementById('writing-lenses-help');
    beforeEach(() => {
        onChange = jest.fn();
        view = createWritingLensesView({ compact: false, onChange, onRetry() {} });
        document.body.replaceChildren(view.element);
        view.update(english);
    });
    afterEach(() => view.destroy());

    test('info buttons open readable portalled help without selecting a lens or editing text', () => {
        expect(button('proofreading').closest('label')).toBeNull();
        expect(button('proofreading').getAttribute('data-ui-tooltip')).toBe('About Proofreading');
        expect(popup().hidden).toBe(true);
        button('proofreading').click();
        expect(popup().parentNode).toBe(document.body);
        expect(popup().getAttribute('role')).toBe('dialog');
        expect(popup().querySelector('strong').textContent).toBe('About Proofreading');
        expect(popup().querySelectorAll('.writing-example')).toHaveLength(4);
        expect(popup().textContent).toContain('Before: tehAfter: the');
        expect(popup().textContent).toContain('Enabled checks: Spelling');
        expect(popup().querySelectorAll('button')).toHaveLength(1);
        expect(view.contains(popup().querySelector('p'))).toBe(true);
        expect(document.activeElement).toBe(popup().querySelector('button'));
        popup().dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        expect(popup().hidden).toBe(false);
        expect(onChange).not.toHaveBeenCalled();
        button('clarity').click();
        expect(button('proofreading').getAttribute('aria-expanded')).toBe('false');
        expect(button('clarity').getAttribute('aria-expanded')).toBe('true');
        expect(popup().textContent).toContain('About Clarity');
        button('clarity').click();
        expect(popup().hidden).toBe(true);
        expect(document.activeElement).toBe(button('clarity'));
    });

    test('Escape and close return focus, while outside pointer and focus dismiss without stealing focus', () => {
        button('direct').click();
        const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.activeElement.dispatchEvent(escape);
        expect(escape.defaultPrevented).toBe(true);
        expect(popup().hidden).toBe(true);
        expect(document.activeElement).toBe(button('direct'));
        button('direct').click(); popup().querySelector('button').click();
        expect(document.activeElement).toBe(button('direct'));
        const outside = document.createElement('button'); document.body.append(outside);
        button('direct').click(); outside.focus();
        expect(popup().hidden).toBe(true); expect(document.activeElement).toBe(outside);
        button('direct').click(); outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        expect(popup().hidden).toBe(true);
    });

    test('disabled help remains accessible and updates live without losing focus, then closes on document change or owner close', () => {
        button('proofreading').click();
        const close = document.activeElement;
        view.update({ ...english, status: 'saving' });
        expect(document.activeElement).toBe(close);
        view.update({ ...english, preferences: { language: 'es', lenses: ['spelling'] } });
        expect(popup().textContent).toContain('Spanish dictionary');
        expect(popup().querySelectorAll('.writing-example')).toHaveLength(3);
        expect(popup().textContent).not.toContain('Before: teh');
        expect(document.activeElement).toBe(close);
        expect(button('direct').disabled).toBe(false);
        expect(view.element.querySelector('input[value="direct"]').disabled).toBe(true);
        button('direct').click();
        expect(popup().textContent).toContain('only available for English');
        expect(popup().querySelectorAll('.writing-example')).toHaveLength(0);
        view.update({ ...english, documentKey: 'Other.md' });
        expect(popup().hidden).toBe(true);
        button('direct').click(); view.close(); expect(popup().hidden).toBe(true);
        button('direct').click(); view.destroy();
        expect(document.querySelector('.writing-lens-help')).toBeNull();
    });

    test('collapsing the lens list closes its portalled help and returns focus to the disclosure', () => {
        view.destroy();
        view = createWritingLensesView({ onChange, onRetry() {} }); document.body.replaceChildren(view.element);
        view.update(english);
        const disclosure = view.element.querySelector('.ui-disclosure-trigger');
        disclosure.click(); button('proofreading').click();
        disclosure.focus(); disclosure.click();
        expect(popup().hidden).toBe(true);
        expect(document.activeElement).toBe(disclosure);
    });
});
