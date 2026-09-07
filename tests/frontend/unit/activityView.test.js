import { renderActivityView } from '../../../frontend/js/views/activityView.js';
import { configureHistoryPaneTabs } from '../../../frontend/js/historyPaneTabs.js';
const event = { id: 0, timestamp: 1788782400, kind: 'edited', before: 'Five fields.', after: '<img src=x onerror=alert(1)> Three fields.', parents: [] };
const passage = { from: 0, to: 20, events: [0], status: 'recorded' };
function render(options = {}) {
    const container = document.createElement('div'); document.body.replaceChildren(container);
    const onJump = jest.fn(), onToggle = jest.fn(), onRetry = jest.fn();
    configureHistoryPaneTabs({ activity: jest.fn(), versions: jest.fn() });
    renderActivityView(container, { status: 'ready', passages: [passage], events: [event], onJump, onToggle, onRetry, ...options });
    return { container, onJump, onToggle, onRetry };
}
test('activity cards expose real buttons and source excerpts cannot execute HTML', () => {
    const h = render({ expanded: new Set([0]) });
    expect(h.container.querySelector('img')).toBeNull();
    expect(h.container.textContent).toContain('<img src=x onerror=alert(1)>');
    h.container.querySelector('[data-activity-action="jump-0"]').click(); expect(h.onJump).toHaveBeenCalledWith(0);
    h.container.querySelector('[data-activity-action="details-0"]').click(); expect(h.onToggle).toHaveBeenCalledWith(0);
    expect(h.container.querySelector('.activity-change').classList.contains('ui-suggestion')).toBe(true);
});
test('unknown and unrecorded passages provide correct hints without inventing dates', () => {
    const h = render({ passages: [{ ...passage, status: 'unrecorded', events: [] }, { ...passage, status: 'unknown', events: [] }] });
    expect(h.container.textContent).toContain('not been recorded in Git history');
    expect(h.container.textContent).toContain('No date has been assumed');
    expect(h.container.querySelector('.activity-day')).toBeNull();
});
test('loading and retryable errors have an accessible status and reuse approved controls', () => {
    expect(render({ status: 'loading' }).container.querySelector('[role="status"]').textContent).toContain('Loading');
    const h = render({ status: 'error', error: 'History unavailable' });
    [...h.container.querySelectorAll('button')].find(b => b.textContent === 'Retry').click(); expect(h.onRetry).toHaveBeenCalled();
});
