import { createDiagramRenderQueue } from '../frontend/js/usecases/diagramRenderQueue.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('diagram render queue', () => {
    function createHarness() {
        const scheduled = [];
        const schedule = jest.fn((callback, view) => {
            const handle = { callback, view, cancelled: false };
            scheduled.push(handle);
            return handle;
        });
        const cancel = jest.fn(handle => {
            handle.cancelled = true;
        });
        const queue = createDiagramRenderQueue({ schedule, cancel });
        return { queue, schedule, cancel, scheduled };
    }

    test('runs one expensive render at a time and starts the next after completion', async () => {
        const harness = createHarness();
        let releaseFirst;
        const first = jest.fn(() => new Promise(resolve => {
            releaseFirst = resolve;
        }));
        const second = jest.fn();

        harness.queue.enqueue(first, 'first-view');
        harness.queue.enqueue(second, 'second-view');
        expect(harness.schedule).toHaveBeenCalledTimes(1);

        harness.scheduled[0].callback();
        await flush();
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();

        releaseFirst();
        await flush();
        expect(harness.schedule).toHaveBeenCalledTimes(2);
        expect(harness.scheduled[1].view).toBe('second-view');

        harness.scheduled[1].callback();
        await flush();
        expect(second).toHaveBeenCalledTimes(1);
    });

    test('cancels a queued render before its idle callback runs', async () => {
        const harness = createHarness();
        const render = jest.fn();
        const task = harness.queue.enqueue(render);

        task.cancel();
        harness.scheduled[0].callback();
        await flush();

        expect(render).not.toHaveBeenCalled();
        expect(harness.cancel).toHaveBeenCalledWith(harness.scheduled[0]);
    });
});
