import { createStartupTimings } from '../../../frontend/js/usecases/startupTimings.js';

const flushReports = () => new Promise(resolve => setTimeout(resolve, 0));

test('startup timings buffer pre-bridge stages with the original clock and durations', async () => {
    let clock = 10;
    const timing = createStartupTimings({ now: () => clock });
    timing.mark('bootstrap');
    const result = await timing.measure('editor', () => { clock = 35; return 'editor'; });
    const send = jest.fn();
    clock = 90;
    timing.connect(send);
    await flushReports();
    expect(result).toBe('editor');
    expect(send.mock.calls.map(([event]) => event)).toEqual([
        { stage: 'bootstrap', phase: 'mark', elapsed_ms: 10, duration_ms: 0 },
        { stage: 'editor', phase: 'begin', elapsed_ms: 10, duration_ms: 0 },
        { stage: 'editor', phase: 'end', elapsed_ms: 35, duration_ms: 25 },
    ]);
});

test.each(['pending', 'rejected', 'thrown'])('startup work starts eagerly and completes with %s timing reporting', async kind => {
    const timing = createStartupTimings({ now: () => 10 });
    timing.connect(() => {
        if (kind === 'thrown') throw new Error('Unavailable');
        return kind === 'pending' ? new Promise(() => {}) : Promise.reject(new Error('Unavailable'));
    });
    const work = jest.fn(() => 'ready');
    const promise = timing.measure('editor', work);
    expect(work).toHaveBeenCalledTimes(1);
    await expect(promise).resolves.toBe('ready');
});

test('startup timing preserves work errors without reporting their contents', async () => {
    const send = jest.fn(), failure = new Error('/private/vault/meeting.md');
    const timing = createStartupTimings({ now: () => 10 });
    timing.connect(send);
    await expect(timing.measure('restore-document', () => { throw failure; })).rejects.toBe(failure);
    await flushReports();
    expect(send.mock.calls[1][0].phase).toBe('error');
    expect(JSON.stringify(send.mock.calls)).not.toContain('private');
});

test('startup timing stops at readiness and bounds duplicates and pre-bridge buffering', async () => {
    const timing = createStartupTimings({ now: () => 10 });
    const send = jest.fn();
    timing.mark('bootstrap');
    timing.mark('bootstrap');
    timing.mark('ready');
    timing.fail('writing');
    timing.connect(send);
    await flushReports();
    expect(send).toHaveBeenCalledTimes(2);
    const bounded = createStartupTimings({ now: () => 10 });
    for (let index = 0; index < 1000; index++) bounded.mark(`stage-${index}`);
    send.mockClear();
    bounded.connect(send);
    await flushReports();
    expect(send).toHaveBeenCalledTimes(64);
});

test('startup timing delivery preserves stage order across a held asynchronous native bridge', async () => {
    let release;
    const first = new Promise(resolve => { release = resolve; });
    const send = jest.fn().mockReturnValueOnce(first);
    const timing = createStartupTimings({ now: () => 10 });
    timing.connect(send);
    await expect(timing.measure('editor', () => 'editable')).resolves.toBe('editable');
    timing.mark('ready');
    expect(send).toHaveBeenCalledTimes(1);
    release();
    await flushReports();
    expect(send.mock.calls.map(([event]) => `${event.stage}:${event.phase}`)).toEqual([
        'editor:begin', 'editor:end', 'ready:mark',
    ]);
});
