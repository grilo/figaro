/**
 * Serialize expensive diagram renders behind an injected idle scheduler.
 * Scheduling and cancellation are effects supplied by the browser adapter;
 * queue ordering and cancellation policy remain independently testable.
 */
export function createDiagramRenderQueue({ schedule, cancel = () => {}, onError = () => {} }) {
    if (typeof schedule !== 'function' || typeof cancel !== 'function') {
        throw new TypeError('Diagram render scheduling ports are required');
    }

    const jobs = [];
    let active = false;
    let scheduled = null;

    const pump = () => {
        if (active || scheduled || !jobs.length) return;

        const job = jobs.shift();
        if (job.cancelled) {
            pump();
            return;
        }

        const callback = () => {
            scheduled = null;
            if (job.cancelled) {
                pump();
                return;
            }

            active = true;
            Promise.resolve()
                .then(job.run)
                .catch(error => onError(error, job))
                .finally(() => {
                    active = false;
                    pump();
                });
        };

        scheduled = {
            job,
            handle: schedule(callback, job.view),
        };
    };

    return {
        enqueue(run, view = null) {
            if (typeof run !== 'function') throw new TypeError('A diagram render job is required');
            const job = { run, view, cancelled: false };
            jobs.push(job);
            pump();

            return {
                cancel() {
                    if (job.cancelled) return;
                    job.cancelled = true;
                    if (scheduled?.job !== job) return;
                    cancel(scheduled.handle);
                    scheduled = null;
                    pump();
                },
            };
        },

        clear() {
            jobs.splice(0).forEach(job => {
                job.cancelled = true;
            });
            if (scheduled) {
                scheduled.job.cancelled = true;
                cancel(scheduled.handle);
                scheduled = null;
            }
        },
    };
}
