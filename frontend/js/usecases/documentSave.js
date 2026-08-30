import { createSaveSnapshot, saveResultDisposition } from '../core/saveModel.js';

/**
 * Coordinate optimistic document saves without knowing about Wails, the DOM,
 * CodeMirror, dialogs, or status controls. Every effect is an injected port.
 */
export function createDocumentSave({
    persist,
    confirmOverwrite,
    shouldCommit = () => false,
    commit = async () => {},
    onSaved = async () => {},
    onFailed = () => {},
}) {
    const queues = new Map();

    async function persistSnapshot(snapshot) {
        const write = expectedMtime => persist({
            path: snapshot.path,
            externalFileId: snapshot.externalFileId,
            content: snapshot.content,
            expectedMtime,
        });

        try {
            let result = await write(snapshot.tab.mtime || 0);
            let successMessage = 'Saved';
            const firstDisposition = saveResultDisposition(result);
            if (firstDisposition === 'failure') {
                throw new Error(result?.error || 'The file could not be saved.');
            }
            if (firstDisposition === 'conflict') {
                const overwrite = await confirmOverwrite(snapshot, result);
                if (!overwrite) return result;
                result = await write(0);
                successMessage = 'Saved (forced)';
                if (saveResultDisposition(result) !== 'saved') {
                    throw new Error(result?.error || 'The file could not be saved.');
                }
            }

            const autoCommitEnabled = !snapshot.externalFileId && shouldCommit(snapshot);
            let historyCommitFailed = false;
            let historyCommitError = null;
            if (autoCommitEnabled) {
                try {
                    await commit(snapshot.path);
                } catch (error) {
                    historyCommitFailed = true;
                    historyCommitError = error;
                }
            }
            result.historyCommitSucceeded = autoCommitEnabled && !historyCommitFailed;
            await onSaved(snapshot, result, {
                historyCommitFailed,
                historyCommitError,
                successMessage,
            });
            return result;
        } catch (error) {
            onFailed(snapshot, error);
            throw error;
        }
    }

    function save(tab, content, options = {}) {
        const snapshot = createSaveSnapshot(tab, content, options);
        if (!snapshot) return Promise.resolve(null);
        tab._saveGeneration = snapshot.generation;

        const previous = queues.get(snapshot.path) || Promise.resolve();
        const queued = previous
            .catch(() => {})
            .then(() => persistSnapshot(snapshot));

        queues.set(snapshot.path, queued);
        queued.finally(() => {
            if (queues.get(snapshot.path) === queued) queues.delete(snapshot.path);
        }).catch(() => {});
        return queued;
    }

    return {
        save,
        pendingForPath(path) {
            return queues.get(path) || null;
        },
    };
}
