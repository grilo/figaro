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
    let saveQueue = Promise.resolve();

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

    function save() {
        const snapshot = buildSessionSnapshot(readWorkspace());
        saveQueue = saveQueue
            .then(() => writeSession(snapshot))
            .catch(error => {
                reportFailure('save', error);
            });
        return saveQueue;
    }

    return { load, save };
}
