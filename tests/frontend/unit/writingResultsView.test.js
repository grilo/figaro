import { createWritingResultsView } from '../../../frontend/js/views/writingResultsView.js';

const finding = { id: 'one', actual: 'utilize', kind: 'lexicon.complex-word', title: 'Simpler word', message: 'Consider a familiar alternative.', from: 3, to: 10, sources: [{ engine: 'retext' }], fixes: [{ expected: 'utilize', replacement: 'use' }] };
const current = { id: 'memo', revision: 1, configuration: 'a', language: 'en-US', preferences: { primary: 'plain', profile: 'standard' }, spelling: { enabled: false } };

test('writing review exposes accessible safe actions, provenance disclosure, and truthful partial status', () => {
    const onApply = jest.fn(), onDismiss = jest.fn(), onNavigate = jest.fn(), onRetry = jest.fn();
    const view = createWritingResultsView({ onApply, onDismiss, onNavigate, onRetry });
    document.body.replaceChildren(view.element);
    const value = { current, count: 1, states: { retext: 'complete', vale: 'failed' }, groups: [{ text: 'We utilize it.', findings: [finding] }] };
    view.update(value);
    expect(view.element.querySelector('[role="status"]').textContent).toContain('Partial results');
    expect(view.element.querySelector('.ui-suggestion .writing-examples').textContent).toContain('After: use');
    const apply = view.element.querySelector('[aria-label="Replace “utilize” with “use”"]');
    apply.click(); expect(onApply).toHaveBeenCalledWith('one', 0, undefined);
    const details = view.element.querySelector('[aria-label="Details for Simpler word"]');
    expect(details.getAttribute('aria-expanded')).toBe('false');
    details.click(); expect(view.element.querySelector('.writing-details').hidden).toBe(false);
    expect(view.element.querySelector('.writing-details').textContent).toContain('Only reviewed replacements offer Apply');
    expect(view.element.querySelector('pre').textContent).toBe('');
    view.element.querySelector('.writing-details button').click(); expect(view.element.querySelector('pre').hidden).toBe(false);
    expect(view.element.querySelector('pre').textContent).toContain('retext');
    apply.focus(); view.update({ ...value, states: { retext: 'complete', vale: 'complete' } });
    expect(document.activeElement).toBe(apply);
    view.update({ ...value, count: 0, groups: [] });
    expect(document.activeElement).toBe(view.element);
    expect(view.element.querySelector('[aria-label^="Replace"]')).toBeNull();
});

test('writing review distinguishes English-only prose checks from Spanish spelling from clean results', () => {
    const view = createWritingResultsView({ onRetry: jest.fn() });
    view.update({ current: { ...current, language: 'es', preferences: { primary: 'direct', profile: 'standard' } }, states: {} });
    expect(view.element.textContent).toContain('Choose a supported lens');
    expect(view.element.textContent).not.toContain('Standard');
});

test('writing review bounds individual cards within and across passages without losing counts or keyboard access to later results', () => {
    const view = createWritingResultsView({ onRetry: jest.fn() });
    document.body.replaceChildren(view.element);
    const groups = Array.from({ length: 8 }, (_, index) => ({ text: `Passage ${index}`, findings: [{ ...finding, id: `f${index}`, actual: `different${index}`, from: 3 + index * 20, to: 10 + index * 20 }] }));
    view.update({ current, count: 8, states: { retext: 'complete' }, groups });
    expect(view.element.querySelectorAll('[data-finding]')).toHaveLength(4);
    expect(view.element.querySelector('[role="status"]').textContent).toBe('8 suggestions');
    const more = [...view.element.querySelectorAll('button')].find(item => item.textContent.startsWith('Show more'));
    more.focus(); more.click();
    expect(view.element.querySelectorAll('[data-finding]')).toHaveLength(8);
    expect(more.hidden).toBe(true);
    expect(document.activeElement.closest('[data-finding]').dataset.finding).toBe('f4');
});

test('suggestion cards omit passage excerpts and hints, expose a source link icon, and use visible action buttons', () => {
    const onNavigate = jest.fn();
    const view = createWritingResultsView({ onNavigate, onApply: jest.fn(), onDismiss: jest.fn(), onRetry: jest.fn() });
    view.update({ current, count: 1, groups: [{ text: 'The report was written in order to help the team utilize clear language.', findings: [finding] }] });
    expect(view.element.textContent).not.toContain('The report was written');
    expect(view.element.textContent).not.toContain('Hover an underlined phrase');
    const link = view.element.querySelector('[aria-label="Go to Simpler word: utilize"]');
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(link.getAttribute('data-ui-tooltip')).toBe('Go to “utilize” in the document');
    link.click(); expect(onNavigate).toHaveBeenCalledWith(finding);
    for (const button of view.element.querySelectorAll('.writing-result-actions button')) {
        expect(button.classList.contains('ui-button')).toBe(true);
        expect(button.classList.contains('ui-button--quiet')).toBe(false);
    }
});


test('Spanish spelling keeps its suggestion count when remembered English-only lenses are disabled', () => {
    const view = createWritingResultsView({ onRetry() {} });
    view.update({ current: { ...current, language: 'es', preferences: { lenses: ['spelling', 'direct'], language: 'es' }, spelling: { enabled: true } }, count: 2, states: {} });
    expect(view.element.querySelector('[role="status"]').textContent).toBe('2 suggestions');
});

test('a dense passage groups identical suggestions, cycles source occurrences, and exposes document-scoped bulk Apply', () => {
    const onNavigate = jest.fn(), onApplyAll = jest.fn();
    const view = createWritingResultsView({ onNavigate, onApplyAll, onRetry() {} });
    const findings = Array.from({ length: 120 }, (_, i) => ({ ...finding, id: `f${i}`, from: i * 20, to: i * 20 + 7 }));
    view.update({ current, analyzed: current, count: 120, groups: [{ findings }] });
    expect(view.element.querySelectorAll('[data-finding]')).toHaveLength(1);
    expect(view.element.textContent).toContain('Occurrence 1 of 120');
    view.element.querySelector('[aria-label="Next occurrence of Simpler word"]').click();
    expect(onNavigate).toHaveBeenCalledWith(findings[1]); expect(view.element.textContent).toContain('Occurrence 2 of 120');
    view.element.querySelector('[aria-label="Apply to all 120 occurrences in this document"]').click();
    expect(onApplyAll).toHaveBeenCalledWith('f1', current);
    expect(view.element.querySelector('pre').textContent).toBe('');
});

test('one passage with many different findings obeys the same four-card budget', () => {
    const view = createWritingResultsView({ onRetry() {} });
    const findings = Array.from({ length: 120 }, (_, i) => ({ ...finding, id: `f${i}`, actual: `word${i}`, from: 3 + i * 20, to: 10 + i * 20 }));
    view.update({ current, count: 120, groups: [{ findings }] });
    expect(view.element.querySelectorAll('[data-finding]')).toHaveLength(4);
    expect(view.element.textContent).toContain('Show more suggestions (4 of 120 shown)');
});

test('background decision failure directs recovery to saved decisions rather than an ineffective analysis retry', () => {
    const view = createWritingResultsView({ onRetry: jest.fn() });
    view.update({ current: { id: 'memo', language: 'en-US', preferences: { lenses: ['plain'] }, decisionsFailed: true }, states: { refresh: 'failed' }, groups: [] });
    expect(view.element.querySelector('[role=status]').textContent).toBe('Saved review decisions need refreshing. Retry them to resume analysis.');
    expect([...view.element.querySelectorAll('button')].find(button => button.textContent === 'Retry analysis').hidden).toBe(true);
});

test('refresh keeps the same cards visible with disabled stale actions and restores actions after replacement', () => {
    const onApply = jest.fn(), onNavigate = jest.fn();
    const view = createWritingResultsView({ onApply, onNavigate, onRetry() {} });
    document.body.replaceChildren(view.element);
    const value = { current, analyzed: current, count: 1, resultVersion: 1, groups: [{ findings: [finding] }] };
    view.update(value);
    const row = view.element.querySelector('[data-finding]');
    const apply = row.querySelector('[aria-label^="Replace"]');
    view.invalidate(); view.invalidate();
    expect(apply.disabled).toBe(true);
    apply.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onApply).not.toHaveBeenCalled();
    view.update({ ...value, current: { ...current, revision: 2 }, stale: true, states: { retext: 'analyzing' } });
    expect(view.element.querySelector('[data-finding]')).toBe(row);
    expect(view.element.textContent).toContain('Previous results are shown');
    expect(view.element.querySelector('[role=status]').closest('[inert]')).toBeNull();
    view.update({ ...value, resultVersion: 2 });
    const fresh = view.element.querySelector('[aria-label^="Replace"]');
    expect(fresh.disabled).toBe(false); fresh.click(); expect(onApply).toHaveBeenCalledTimes(1);
    view.update({ current: { ...current, id: 'other' }, resultVersion: 3, count: 0, groups: [] });
    expect(view.element.querySelector('[data-finding]')).toBeNull();
});

test('lists corrections before suggestions and reviews a word flagged by two lenses once', async () => {
    const onApply = jest.fn(), onDismiss = jest.fn().mockResolvedValue(undefined);
    const view = createWritingResultsView({ onApply, onDismiss, onNavigate: jest.fn(), onRetry: jest.fn() });
    document.body.replaceChildren(view.element);
    const plain = { ...finding, id: 'plain-very', actual: 'very', kind: 'lexicon.complex-word', lens: 'plain', title: 'Simpler word', message: 'Consider a simpler word.', from: 20, to: 24, fixes: [] };
    const direct = { ...plain, id: 'direct-very', kind: 'style.adverb', lens: 'direct', title: 'Review modifier', message: 'Consider a specific description.', fixes: [{ expected: 'very', replacement: '' }] };
    const spelling = { ...finding, id: 'teh', actual: 'teh', kind: 'grammar.spelling', lens: 'spelling', title: 'Spelling', message: 'Unknown word.', from: 40, to: 43, fixes: [{ expected: 'teh', replacement: 'the' }] };
    view.update({ current, count: 3, states: { retext: 'complete' }, groups: [{ findings: [plain, direct, spelling] }] });

    expect([...view.element.querySelectorAll('.writing-results-tier')].map(item => item.textContent))
        .toEqual(['Corrections (1)', 'Suggestions (1)']);
    const [correction, suggestion] = view.element.querySelectorAll('.writing-result-group');
    expect(correction.dataset.tier).toBe('correction');
    expect(correction.textContent).toContain('Spelling');
    expect(suggestion.textContent).toContain('Consider a simpler word.');
    expect(suggestion.textContent).toContain('Review modifier. Consider a specific description.');

    suggestion.querySelector('[aria-label="Replace “very” with “”"]').click();
    expect(onApply).toHaveBeenCalledWith('direct-very', 0, undefined);
    suggestion.querySelector('[aria-label="Ignore Simpler word"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onDismiss.mock.calls.map(call => call[0])).toEqual(['plain-very', 'direct-very']);
});
