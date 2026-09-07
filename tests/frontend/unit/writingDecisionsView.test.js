import { createWritingDecisionsView } from '../../../frontend/js/views/writingDecisionsView.js';
import { createWritingInlineView } from '../../../frontend/js/views/writingInlineView.js';
import { createWritingResultsView } from '../../../frontend/js/views/writingResultsView.js';

const decision = { id: 'one', type: 'acronym', acronym: 'SLO', language: 'en-US' };
const finding = { id: 'acronym', kind: 'clarity.undefined-acronym', lens: 'plain', actual: 'SLO', title: 'Consider explaining this acronym', message: 'Review the acronym.', fixes: [] };

test('permanent rejection leaves Restore available; uncertain saves expose reconciliation and inactive contexts are explained', () => {
    const onReconcile = jest.fn(async () => {});
    const view = createWritingDecisionsView({ id: 'recovery', onRestore: async () => {}, onRetry: async () => {}, onReconcile });
    const occurrence = { id: 'old', type: 'occurrence', text: 'utilize', title: 'Simpler word', language: 'en-US', before: 'Original sentence ', after: ' context.' };
    view.update({ decisions: [occurrence], status: 'save-rejected', activeIds: [], error: 'Remove an old decision to make room.' }, 'Memo.md', 'Completely changed.');
    view.element.querySelector('[aria-controls]').click();
    expect(view.element.querySelector('[data-decision]').disabled).toBe(false);
    expect(view.element.textContent).toContain('Inactive:'); expect(view.element.textContent).toContain('Original sentence');
    view.update({ decisions: [occurrence], status: 'save-error', error: 'Couldn’t confirm save.' }, 'Memo.md');
    const reload = [...view.element.querySelectorAll('button')].find(button => button.textContent === 'Reload saved decisions');
    expect(reload.hidden).toBe(false); reload.click(); expect(onReconcile).toHaveBeenCalled();
});

test('saved decisions use approved controls, accessible expansion, scoped restore, retry, and empty state', async () => {
    const onRestore = jest.fn(async () => {}), onRetry = jest.fn(async () => {});
    const view = createWritingDecisionsView({ id: 'decisions', onRestore, onRetry }); document.body.replaceChildren(view.element);
    view.update({ decisions: [decision], status: 'saved' }, 'Memo.md');
    const toggle = view.element.querySelector('[aria-controls]'); expect(toggle.classList.contains('ui-button')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); toggle.click();
    const restore = view.element.querySelector('[data-decision]');
    expect(restore.closest('.ui-suggestion')).not.toBeNull(); expect(restore.textContent).toBe('Review acronym again');
    restore.click(); expect(onRestore).toHaveBeenCalledWith('one', 'Memo.md');
    view.update({ decisions: [decision], status: 'saving' }, 'Memo.md');
    expect(view.element.querySelector('[data-decision]').disabled).toBe(true);
    view.update({ decisions: [decision], status: 'save-error', error: 'Couldn’t save.' }, 'Memo.md');
    expect(view.element.querySelector('[role="status"]').classList.contains('ui-notice--warning')).toBe(true);
    [...view.element.querySelectorAll('button')].find(button => button.textContent === 'Retry review decisions').click(); expect(onRetry).toHaveBeenCalled();
    view.update({ decisions: [], status: 'saved' }, 'Other.md');
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); toggle.click();
    expect(view.element.textContent).toContain('No saved review decisions');
});

test('inline acronym acceptance is separate from occurrence Ignore and exposes save failure without closing', async () => {
    let reject;
    const onAcceptAcronym = jest.fn(() => new Promise((_, fail) => { reject = fail; })), onIgnore = jest.fn();
    const view = createWritingInlineView({ findings: [finding], onAcceptAcronym, onIgnore, onClose() {} }); document.body.replaceChildren(view);
    const buttons = view.querySelectorAll('button'); expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('Ignore this occurrence'); buttons[1].click();
    expect(onAcceptAcronym).toHaveBeenCalledWith('acronym'); expect(buttons[0].disabled).toBe(true);
    reject(new Error('Couldn’t save. Retry review decisions.')); await Promise.resolve();
    expect(view.querySelector('[role="status"]').textContent).toContain('Couldn’t save'); expect(buttons[1].disabled).toBe(false);
    expect(onIgnore).not.toHaveBeenCalled();
});

test('saved review pagination bounds mounted records and moves focus to the first newly revealed restore button', () => {
    const view = createWritingDecisionsView({ id: 'paged-decisions', onRestore: async () => {}, onRetry: async () => {} });
    document.body.replaceChildren(view.element);
    view.update({ status: 'saved', decisions: Array.from({ length: 30 }, (_, i) => ({ ...decision, id: `saved-${i}` })) }, 'Memo.md');
    view.element.querySelector('[aria-controls]').click();
    expect(view.element.querySelectorAll('[data-decision]')).toHaveLength(25);
    const more = [...view.element.querySelectorAll('button')].find(button => button.textContent === 'Show more saved decisions');
    more.focus(); more.click();
    expect(view.element.querySelectorAll('[data-decision]')).toHaveLength(30);
    expect(more.hidden).toBe(true);
    expect(document.activeElement.dataset.decision).toBe('saved-25');
});

test('sidebar acronym acceptance receives the rendered snapshot and uses the standard button', async () => {
    const onAcceptAcronym = jest.fn(async () => {}), analyzed = { id: 'Memo.md', revision: 1 };
    const view = createWritingResultsView({ onAcceptAcronym, onDismiss() {}, onNavigate() {}, onRetry() {} });
    view.update({ current: { ...analyzed, language: 'en-US', preferences: { lenses: ['plain'] } }, analyzed, count: 1, groups: [{ findings: [finding] }] });
    const button = view.element.querySelector('[aria-label="Accept “SLO” in this document"]');
    expect(button.classList.contains('ui-button')).toBe(true); button.click(); expect(onAcceptAcronym).toHaveBeenCalledWith('acronym', analyzed);
});

test('background tracking failure offers the existing retry button and disables stale Restore actions', () => {
    const onRetry = jest.fn(async () => {});
    const view = createWritingDecisionsView({ id: 'background-error', onRestore: jest.fn(), onRetry });
    view.update({ status: 'tracking-error', error: 'Couldn’t refresh saved review decisions.', decisions: [{ id: 'one', type: 'acronym', acronym: 'SLO', language: 'en-US' }] }, 'Memo.md');
    view.element.querySelector('[aria-controls]').click();
    const retry = [...view.element.querySelectorAll('button')].find(button => button.textContent === 'Retry review decisions');
    expect(retry.hidden).toBe(false); retry.click(); expect(onRetry).toHaveBeenCalledTimes(1);
    expect(view.element.querySelector('[data-decision]').disabled).toBe(true);
});
