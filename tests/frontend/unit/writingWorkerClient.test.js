import { createWritingWorker } from '../../../frontend/js/writingWorkerClient.js';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
function harness(options = {}) {
    const workers = [];
    const createWorker = () => { const worker = { postMessage: jest.fn(), terminate: jest.fn() }; workers.push(worker); return worker; };
    const client = createWritingWorker({ createWorker, schedule: setTimeout, unschedule: clearTimeout, ...options });
    return { client, workers };
}

test('cooperative cancellation retains a warm worker, discards stale results and waits for acknowledgement before the latest job', async () => {
    const { client, workers } = harness({ cooperative: true });
    const worker = workers[0]; worker.onmessage({ data: { ready: true } });
    const old = client.analyze('old'); const rejected = expect(old).rejects.toThrow('cancelled');
    await Promise.resolve(); const first = worker.postMessage.mock.calls[0][0];
    client.cancel(); client.cancel(); await rejected;
    const skipped = client.analyze('skipped'); const skippedRejected = expect(skipped).rejects.toThrow('cancelled');
    await Promise.resolve(); client.cancel();
    const latest = client.analyze('latest'); await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage).toHaveBeenLastCalledWith({ cancel: first.id });
    worker.onmessage({ data: { id: first.id, result: 'stale' } });
    await skippedRejected; await Promise.resolve();
    expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'latest' }));
    const next = worker.postMessage.mock.calls.at(-1)[0];
    worker.onmessage({ data: { id: next.id, result: 'fresh' } });
    await expect(latest).resolves.toBe('fresh');
    expect(workers).toHaveLength(1); expect(worker.terminate).not.toHaveBeenCalled(); client.destroy();
});

test('unresponsive cooperative cancellation still times out and recovers through a replacement worker', async () => {
    const { client, workers } = harness({ cooperative: true }); workers[0].onmessage({ data: { ready: true } });
    const old = client.analyze('old'); const rejected = expect(old).rejects.toThrow('cancelled');
    await Promise.resolve(); client.cancel(); await rejected;
    const latest = client.analyze('latest'); await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(2);
    workers[1].onmessage({ data: { ready: true } }); await Promise.resolve();
    const job = workers[1].postMessage.mock.calls[0][0];
    workers[1].onmessage({ data: { id: job.id, result: [] } });
    await expect(latest).resolves.toEqual([]); client.destroy();
});
test('writing worker initializes eagerly, returns matched jobs, and actually terminates a timeout', async () => {
    const { client, workers } = harness();
    expect(workers).toHaveLength(1);
    workers[0].onmessage({ data: { ready: true } }); await client.ready;
    const completed = client.analyze('We utilize it.'); await Promise.resolve();
    const first = workers[0].postMessage.mock.calls[0][0];
    workers[0].onmessage({ data: { id: first.id + 1, result: 'wrong job' } });
    workers[0].onmessage({ data: { id: first.id, result: { observations: [] } } });
    await expect(completed).resolves.toEqual({ observations: [] });
    const hanging = client.analyze('slow'); const rejection = expect(hanging).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(5000); await rejection;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    client.destroy();
});
test('writing worker rejects superseded work even when cancellation precedes initialization', async () => {
    const { client, workers } = harness();
    const result = client.analyze('old'); const rejected = expect(result).rejects.toThrow('cancelled');
    client.cancel(); workers[0].onmessage({ data: { ready: true } });
    await rejected; expect(workers[0].postMessage).not.toHaveBeenCalled();
    client.destroy();
});

test('textlint initialization failure rejects readiness and retry creates a fully initialized writing worker', async () => {
    const { client, workers } = harness();
    const rejection = expect(client.ready).rejects.toThrow('Rule initialization failed');
    workers[0].onmessage({ data: { initializationError: 'Rule initialization failed' } });
    await rejection; expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const retry = client.analyze('Use Javascript.');
    expect(workers).toHaveLength(2);
    workers[1].onmessage({ data: { ready: true } }); await Promise.resolve();
    const job = workers[1].postMessage.mock.calls[0][0];
    workers[1].onmessage({ data: { id: job.id, result: { observations: [] } } });
    await expect(retry).resolves.toEqual({ observations: [] });
    client.destroy();
});

test('writing retry replaces failed worker state so a cached dictionary-load failure can recover', async () => {
    const { client, workers } = harness();
    workers[0].onmessage({ data: { ready: true } });
    const failed = client.analyze('teh', 'en-US'); const rejection = expect(failed).rejects.toThrow('missing dictionary');
    await Promise.resolve();
    workers[0].onmessage({ data: { id: workers[0].postMessage.mock.calls[0][0].id, error: 'missing dictionary' } });
    await rejection; expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const retry = client.analyze('teh', 'en-US');
    expect(workers).toHaveLength(2);
    workers[1].onmessage({ data: { ready: true } }); await Promise.resolve();
    const job = workers[1].postMessage.mock.calls[0][0];
    expect(job.language).toBe('en-US');
    workers[1].onmessage({ data: { id: job.id, result: [] } });
    await expect(retry).resolves.toEqual([]); client.destroy();
});

test('long-note worker budget allows whole-document analysis but cancellation still terminates immediately', async () => {
    const { client, workers } = harness();
    workers[0].onmessage({ data: { ready: true } }); await client.ready;
    const job = client.analyze('word '.repeat(60000));
    const cancelled = expect(job).rejects.toThrow('cancelled');
    await jest.advanceTimersByTimeAsync(5000);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    client.cancel(); await cancelled;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    workers[1].onmessage({ data: { ready: true } });
    const next = client.analyze('Fresh note.'); await Promise.resolve();
    workers[1].onmessage({ data: { id: workers[1].postMessage.mock.calls[0][0].id, result: [] } });
    await expect(next).resolves.toEqual([]); client.destroy();
});

test('long-note worker budget remains bounded and actually terminates stalled analysis', async () => {
    const { client, workers } = harness(); workers[0].onmessage({ data: { ready: true } });
    const job = client.analyze({ job: { source: 'x'.repeat(2 * 1024 * 1024) } }, 'resolve');
    const rejected = expect(job).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(29999); expect(workers[0].terminate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); await rejected; expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    client.destroy();
});
