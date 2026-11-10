import { writingWorkBudget } from './core/writingWorkBudget.js';

/** Eager workers. Cooperative cancellation retains caches; timeout/error still
 * terminates the worker, and its acknowledgement gates the next request.
 * `lookup` sends a small request beside the analysis queue: it neither waits
 * for nor cancels an analysis, and giving up on one leaves the worker running.
 */
export function createWritingWorker({ createWorker = () => new Worker('/writing.worker.js', { type: 'module' }), schedule = setTimeout, unschedule = clearTimeout, cooperative = false } = {}) {
    let worker, pending, readyResolve, readyReject, readyTimer, disposed = false;
    let sequence = 0, lookupSequence = 0;
    const lookups = new Map();
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
                if (event.data.lookupId !== undefined) {
                    const job = lookups.get(event.data.lookupId);
                    if (!job) return;
                    lookups.delete(event.data.lookupId); unschedule(job.timer);
                    if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.result);
                    return;
                }
                if (!pending || event.data.id !== pending.id) return;
                const job = pending; pending = null; unschedule(job.timer); job.drain();
                if (job.cancelled) return;
                if (event.data.error) {
                    const error = new Error(event.data.error); job.reject(error); fail(error);
                } else job.resolve(event.data.result);
            };
            worker.onerror = () => fail(new Error('Writing worker unavailable'));
        } catch (error) { fail(error); }
    }
    function fail(error) {
        unschedule(readyTimer); readyReject?.(error);
        if (pending) { unschedule(pending.timer); pending.reject(error); pending.drain(); pending = null; }
        for (const job of lookups.values()) { unschedule(job.timer); job.reject(error); }
        lookups.clear();
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
            if (pending) await pending.drained;
            if (ticket !== sequence || disposed) throw new Error('Writing analysis cancelled');
            if (!worker) { start(); await ready; }
            if (ticket !== sequence || disposed) throw new Error('Writing analysis cancelled');
            return new Promise((resolve, reject) => {
                const id = ticket;
                const timer = schedule(() => fail(new Error('Writing analysis timed out')), writingWorkBudget(source));
                let drain;
                const drained = new Promise(done => { drain = done; });
                pending = { id, resolve, reject, timer, drained, drain }; worker.postMessage({ id, source, language });
            });
        },
        async lookup(request, timeoutMs = 5000) {
            if (disposed) throw new Error('Writing worker closed');
            if (!worker) start();
            await ready;
            if (!worker) { start(); await ready; }
            if (disposed) throw new Error('Writing worker closed');
            return new Promise((resolve, reject) => {
                const id = ++lookupSequence;
                const timer = schedule(() => { lookups.delete(id); reject(new Error('Writing lookup timed out')); }, timeoutMs);
                lookups.set(id, { resolve, reject, timer });
                worker.postMessage({ lookupId: id, lookup: request });
            });
        },
        cancel() {
            sequence++;
            if (!pending || pending.cancelled) return;
            if (cooperative) {
                pending.cancelled = true;
                pending.reject(new Error('Writing analysis cancelled'));
                worker.postMessage({ cancel: pending.id });
            } else { fail(new Error('Writing analysis cancelled')); if (!disposed) start(); }
        },
        destroy() { disposed = true; fail(new Error('Writing worker closed')); },
    };
}
