import { buildSessionSnapshot, normalizeSessionPayload } from '../core/sessionModel.js';

/**
 * Coordinate portable-session persistence through injected effect ports.
 */
export function createSessionPersistence({
    readSession,
    writeSession,
    readWorkspace,
    applySession,
    resetWorkspace,
    reportFailure = () => {},
}) {
    let running = false;
    let pending = null;
    // The serialized snapshot last confirmed by a successful write. An
    // identical workspace needs no new write; a failed write is retried.
    let lastWritten = null;

    async function load() {
        try {
            const normalized = normalizeSessionPayload(await readSession());
            resetWorkspace();
            if (!normalized) return false;
            applySession(normalized);
            return true;
        } catch (error) {
            resetWorkspace();
            reportFailure('load', error);
            return false;
        }
    }

    async function drain() {
        running = true;
        while (pending) {
            const job = pending;
            pending = null;
            const serialized = JSON.stringify(job.snapshot);
            try {
                if (serialized !== lastWritten) {
                    await writeSession(job.snapshot);
                    lastWritten = serialized;
                }
            } catch (error) {
                reportFailure('save', error);
            } finally {
                job.resolve();
            }
        }
        running = false;
    }

    function save() {
        const snapshot = buildSessionSnapshot(readWorkspace());
        if (pending) {
            // Only the latest workspace matters after a slow write. All callers
            // covered by this pending job settle after that snapshot is attempted.
            pending.snapshot = snapshot;
            return pending.promise;
        }
        let resolve;
        const promise = new Promise(finish => { resolve = finish; });
        pending = { snapshot, resolve, promise };
        if (!running) void drain();
        return promise;
    }

    return { load, save };
}
