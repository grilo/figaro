import { createActivityReview } from '../../../frontend/js/usecases/activityReview.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness(overrides = {}) {
    const published = [], source = { value: 'old' };
    const load = jest.fn().mockResolvedValue({ source: 'recorded' });
    const project = jest.fn().mockImplementation(input => Promise.resolve({ content: input.source }));
    const cancel = jest.fn();
    const controller = createActivityReview({ load, project, cancel, schedule: setTimeout, unschedule: clearTimeout, readSource: () => source.value, publish: value => published.push(value), timeZone: 'UTC', ...overrides });
    return { controller, load, project, cancel, published, source };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('typing coalesces into off-thread projection and never walks Git again', async () => {
    const h = harness(); h.controller.select({ key: 'a', path: 'a.md' }); await settle();
    for (let i = 0; i < 20; i++) { h.source.value += 'x'; h.controller.changed(); }
    expect(h.project).not.toHaveBeenCalled(); expect(h.load).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(180);
    expect(h.project).toHaveBeenCalledTimes(1); expect(h.project.mock.calls[0][0].source).toBe(h.source.value);
    expect(h.published.at(-1).status).toBe('ready');
});

test('late history for an old note cannot publish into the newly opened note', async () => {
    const a = deferred(), b = deferred(), load = jest.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const h = harness({ load }); h.controller.select({ key: 'a', path: 'a.md' }); h.controller.select({ key: 'b', path: 'b.md' });
    a.resolve({ source: 'A' }); await settle(); b.resolve({ source: 'B' }); await settle(); await jest.advanceTimersByTimeAsync(180);
    expect(h.project.mock.calls[0][0].recorded.source).toBe('B');
    expect(h.published.filter(p => p.status === 'ready').map(p => p.key)).toEqual(['b']);
});

test('an edit invalidates an in-flight projection without blocking the new input', async () => {
    const old = deferred(); const h = harness({ project: jest.fn().mockReturnValueOnce(old.promise).mockResolvedValue({ fresh: true }) });
    h.controller.select({ key: 'a', path: 'a.md' }); await settle(); await jest.advanceTimersByTimeAsync(180);
    h.source.value = 'new'; h.controller.changed(); old.resolve({ stale: true }); await settle();
    expect(h.published.some(p => p.projection?.stale)).toBe(false);
    await jest.advanceTimersByTimeAsync(180); expect(h.published.at(-1).projection).toEqual({ fresh: true });
});

test('save refresh during a history read queues one latest read and rejects the superseded result', async () => {
    const old = deferred(); const load = jest.fn().mockReturnValueOnce(old.promise).mockResolvedValue({ source: 'latest' });
    const h = harness({ load }); h.controller.select({ key: 'a', path: 'a.md' }); h.controller.refresh(); h.controller.refresh();
    old.resolve({ source: 'stale' }); await settle(); await jest.advanceTimersByTimeAsync(180);
    expect(load).toHaveBeenCalledTimes(2); expect(h.project.mock.calls[0][0].recorded.source).toBe('latest');
});

test('history errors expose Retry and destroying the controller rejects all late work', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ source: 'saved' });
    const h = harness({ load }); h.controller.select({ key: 'a', path: 'a.md' }); await settle();
    expect(h.published.at(-1)).toMatchObject({ status: 'error', error: 'unavailable' });
    h.controller.retry(); await settle(); await jest.advanceTimersByTimeAsync(180); expect(h.published.at(-1).status).toBe('ready');
    h.controller.changed(); h.controller.destroy(); const count = h.published.length; await jest.runAllTimersAsync(); expect(h.published).toHaveLength(count);
});
