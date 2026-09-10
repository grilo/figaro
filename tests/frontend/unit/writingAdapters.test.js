import { createWritingAdapters } from '../../../frontend/js/writingAdapters.js';
import { createWritingProse } from '../../../frontend/js/usecases/writingProse.js';
import { analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';

let workers, adapters, original;
beforeEach(() => {
    workers = []; original = global.Worker;
    global.Worker = class {
        constructor(url) { this.url = url; this.postMessage = jest.fn(); this.terminate = jest.fn(); workers.push(this); }
    };
    adapters = createWritingAdapters({ WritingInitialize: jest.fn(async () => {}), WritingCancel: jest.fn(async () => {}) });
    for (const worker of workers) worker.onmessage({ data: { ready: true } });
});
afterEach(() => { adapters.destroy(); global.Worker = original; });
const turn = async () => { for (let at = 0; at < 8; at++) await Promise.resolve(); };
const finish = (worker, result) => worker.onmessage({ data: { id: worker.postMessage.mock.calls.at(-1)[0].id, result } });

test('writing adapters eagerly initialize prose, spelling and decision workers and serialize resolution behind prose', async () => {
    await adapters.ready;
    expect(workers.map(worker => worker.url)).toEqual(['/writing.worker.js', '/spelling.worker.js', '/decisions.worker.js']);
    const analyze = adapters.retext.analyze('We utilize prose.');
    const resolve = adapters.review.resolve({ job: { source: 'We utilize prose.' } });
    await turn(); expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    finish(workers[0], { projection: { text: 'We utilize prose.' }, observations: [] });
    await analyze; await turn();
    expect(workers[0].postMessage.mock.calls[1][0]).toMatchObject({ language: 'resolve', source: { job: { source: 'We utilize prose.' } } });
    finish(workers[0], { result: { count: 1 } }); await expect(resolve).resolves.toMatchObject({ result: { count: 1 } });
});

test('background decision tracking preserves ordered document ownership without cancelling another note', async () => {
    const first = adapters.trackDecisions({ before: 'one', after: 'one edited', decisions: [] });
    const second = adapters.trackDecisions({ before: 'two', after: 'two edited', decisions: [] });
    await turn(); expect(workers[2].postMessage).toHaveBeenCalledTimes(1);
    finish(workers[2], { activeIds: ['first'] }); await expect(first).resolves.toEqual({ activeIds: ['first'] });
    await turn(); expect(workers[2].postMessage.mock.calls[1][0].source.before).toBe('two');
    finish(workers[2], { activeIds: ['second'] }); await expect(second).resolves.toEqual({ activeIds: ['second'] });
    expect(workers[2].terminate).not.toHaveBeenCalled();
});

test('superseding prose preserves the worker and rejects queued resolution before it can reach a new note', async () => {
    const old = adapters.retext.analyze('old'); const oldRejected = expect(old).rejects.toThrow('cancelled');
    const resolve = adapters.review.resolve({ job: { source: 'old' } }); const queuedRejected = expect(resolve).rejects.toThrow('cancelled');
    await turn(); adapters.retext.cancel(); await oldRejected; await queuedRejected;
    expect(workers[0].terminate).not.toHaveBeenCalled();
    expect(workers[0].postMessage).toHaveBeenLastCalledWith({ cancel: workers[0].postMessage.mock.calls[0][0].id });
});

test('worker restart between analysis and resolution restores grammar when delayed spelling arrives', async () => {
    const source = 'We saw a apple on teh table.';
    const input = { proseRequired: true, job: { source, language: 'en-US',
        preferences: { language: 'en-US', lenses: ['grammar', 'spelling'] }, spelling: { words: [] }, decisions: [] },
    spelling: [{ engine: 'spelling', rule: 'figaro-spelling', actual: 'teh', from: 18, to: 21, replacements: ['the'] }] };
    const originalRuntime = createWritingProse({ analyze: analyzeWriting });
    const analyzed = adapters.retext.analyze(source); await turn();
    finish(workers[0], await originalRuntime.analyze(source)); await analyzed;
    const failed = adapters.review.resolve({ ...input, spelling: [] });
    const rejection = expect(failed).rejects.toThrow('unavailable'); await turn();
    workers[0].onerror(); await rejection; expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const later = adapters.review.resolve(input); await turn();
    const replacement = workers.at(-1); expect(replacement).not.toBe(workers[0]);
    replacement.onmessage({ data: { ready: true } }); await turn();
    const request = replacement.postMessage.mock.calls[0][0];
    expect(request).toMatchObject({ language: 'resolve', source: { proseRequired: true } });
    const recoveredRuntime = createWritingProse({ analyze: analyzeWriting });
    finish(replacement, await recoveredRuntime.resolve(request.source));
    await expect(later).resolves.toMatchObject({ result: { count: 2 }, proseFailure: undefined });
});
