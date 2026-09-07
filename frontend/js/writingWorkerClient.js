import { writingWorkBudget } from './core/writingWorkBudget.js';

/** Eager worker lifecycle. Timed-out and superseded work is actually terminated. */
export function createWritingWorker({ createWorker = () => new Worker('/writing.worker.js', { type: 'module' }), schedule = setTimeout, unschedule = clearTimeout } = {}) {
    let worker, pending, readyResolve, readyReject, readyTimer, disposed = false;
    let sequence = 0;
    let ready;
    function start() {
        ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
        ready.catch(() => {});
        try {
            worker = createWorker();
            readyTimer = schedule(() => fail(new Error('Writing worker initialization timed out')), 5000);
            worker.onmessage = event => {
                if (event.data.initializationError) { fail(new Error(event.data.initializationError)); return; }
                if (event.data.ready) { unschedule(readyTimer); readyResolve(); return; }
                if (!pending || event.data.id !== pending.id) return;
                const job = pending; pending = null; unschedule(job.timer);
                if (event.data.error) {
                    const error = new Error(event.data.error); job.reject(error); fail(error);
                } else job.resolve(event.data.result);
            };
            worker.onerror = () => fail(new Error('Writing worker unavailable'));
        } catch (error) { fail(error); }
    }
    function fail(error) {
        unschedule(readyTimer); readyReject?.(error);
        if (pending) { unschedule(pending.timer); pending.reject(error); pending = null; }
        worker?.terminate(); worker = null;
    }
    start();
    return {
        get ready() { return ready; },
        async analyze(source, language) {
            if (disposed) throw new Error('Writing worker closed');
            if (!worker) start();
            const ticket = ++sequence;
            await ready;
            if (ticket !== sequence || disposed) throw new Error('Writing analysis cancelled');
            return new Promise((resolve, reject) => {
                const id = ticket;
                const timer = schedule(() => fail(new Error('Writing analysis timed out')), writingWorkBudget(source));
                pending = { id, resolve, reject, timer }; worker.postMessage({ id, source, language });
            });
        },
        cancel() { sequence++; if (pending) { fail(new Error('Writing analysis cancelled')); if (!disposed) start(); } },
        destroy() { disposed = true; fail(new Error('Writing worker closed')); },
    };
}
