/**
 * Serialize an expensive preview renderer while retaining only the newest
 * request that arrived during an in-flight render. Rendering owns no UI;
 * callers inject publication and error ports.
 */
export function createLatestPreviewSession({
    render,
    publish,
    reportError,
} = {}) {
    if (typeof render !== 'function' || typeof publish !== 'function'
        || typeof reportError !== 'function') {
        throw new TypeError('Latest preview session requires render, publish, and error ports');
    }

    let pending = null;
    let running = false;
    let destroyed = false;
    let sequence = 0;

    async function pump() {
        if (running || destroyed) return;
        running = true;
        try {
            while (pending && !destroyed) {
                const job = pending;
                pending = null;
                try {
                    const result = await render(job.value);
                    if (!destroyed && !pending && job.sequence === sequence) {
                        publish(result, job.value);
                    }
                } catch (error) {
                    if (!destroyed && !pending && job.sequence === sequence) {
                        reportError(error, job.value);
                    }
                }
            }
        } finally {
            running = false;
            if (pending && !destroyed) void pump();
        }
    }

    return {
        request(value) {
            if (destroyed) return false;
            sequence += 1;
            pending = { value, sequence };
            void pump();
            return true;
        },
        destroy() {
            destroyed = true;
            pending = null;
            sequence += 1;
        },
        get running() { return running; },
    };
}

export default createLatestPreviewSession;
