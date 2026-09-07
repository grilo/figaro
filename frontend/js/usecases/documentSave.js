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
    onStarted = () => {},
    onPersisted = () => {},
    onSaved = async () => {},
    onFailed = () => {},
}) {
    const queues = new Map();
    const generations = new Map();

    async function persistSnapshot(snapshot, queue) {
        const write = expectedMtime => persist({
            path: snapshot.path,
            externalFileId: snapshot.externalFileId,
            content: snapshot.content,
            expectedMtime,
        });

        try {
            let result = await write(queue.mtime);
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

            queue.mtime = result.mtime;
            onPersisted(snapshot, result);

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
        const tabId = tab?.id || tab?.path;
        const generation = Math.max(
            (tab?._saveGeneration || 0) + 1,
            (generations.get(tabId) || 0) + 1,
        );
        const snapshot = createSaveSnapshot(tab, content, { ...options, generation });
        if (!snapshot) return Promise.resolve(null);
        generations.set(snapshot.tabId, snapshot.generation);
        onStarted(snapshot);

        const queue = queues.get(snapshot.path) || { mtime: snapshot.expectedMtime, pending: null };
        const queued = queue.pending
            ? queue.pending.catch(() => null).then(() => persistSnapshot(snapshot, queue))
            : persistSnapshot(snapshot, queue);
        queue.pending = queued;
        queues.set(snapshot.path, queue);
        queued.finally(() => {
            if (queue.pending === queued) queues.delete(snapshot.path);
        }).catch(() => {});
        return queued;
    }

    return {
        save,
        pendingForPath(path) {
            return queues.get(path)?.pending || null;
        },
    };
}
