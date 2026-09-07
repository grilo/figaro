/** An eager, bounded worker; failed work never falls back onto the input thread. */
export function createActivityWorker({ createWorker = () => new Worker('/activity.worker.js', { type: 'module' }), schedule = setTimeout, unschedule = clearTimeout } = {}) {
    let worker, job, timer, resolveReady, rejectReady, ready, sequence = 0, disposed = false;
    function fail(error) {
        unschedule(timer); rejectReady?.(error);
        if (job) { unschedule(job.timer); job.reject(error); job = null; }
        worker?.terminate(); worker = null;
    }
    function start() {
        ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; }); ready.catch(() => {});
        try {
            worker = createWorker();
            const instance = worker;
            timer = schedule(() => { if (worker === instance) fail(new Error('Activity worker did not initialize')); }, 5000);
            worker.onmessage = ({ data }) => {
                if (worker !== instance) return;
                if (data.ready) { unschedule(timer); resolveReady(); return; }
                if (!job || data.id !== job.id) return;
                const completed = job; job = null; unschedule(completed.timer);
                if (data.error) completed.reject(new Error(data.error)); else completed.resolve(data.result);
            };
            worker.onerror = () => { if (worker === instance) fail(new Error('Activity worker unavailable')); };
        } catch (error) { fail(error); }
    }
    start();
    return {
        get ready() { return ready; },
        async project(input) {
            if (disposed) throw new Error('Activity worker closed');
            if (job) { fail(new Error('Activity cancelled')); }
            if (!worker) start();
            const id = ++sequence; await ready;
            if (id !== sequence || disposed) throw new Error('Activity cancelled');
            return new Promise((resolve, reject) => {
                job = { id, resolve, reject, timer: schedule(() => fail(new Error('Activity analysis timed out')), 5000) };
                worker.postMessage({ id, input });
            });
        },
        cancel() { sequence++; if (job) { fail(new Error('Activity cancelled')); if (!disposed) start(); } },
        destroy() { disposed = true; sequence++; fail(new Error('Activity worker closed')); },
    };
}
