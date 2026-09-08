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
    refreshIndex = async () => {},
    onFollowupFailed = () => {},
    onStarted = () => {},
    onPersisted = () => {},
    onSaved = async () => {},
    onFailed = () => {},
}) {
    const queues = new Map();
    const generations = new Map();

    async function persistSnapshot(snapshot, queue, acknowledge) {
        const write = expectedMtime => persist({
            path: snapshot.path,
            externalFileId: snapshot.externalFileId,
            content: snapshot.content,
            expectedMtime,
        });

        let persistedResult = null;
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

            persistedResult = result;
            queue.mtime = result.mtime;
            onPersisted(snapshot, result);
            acknowledge(result);

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
            if (!snapshot.externalFileId) {
                try { await refreshIndex(snapshot.path); }
                catch (error) { onFollowupFailed(snapshot, error); }
            }
            await onSaved(snapshot, result, {
                historyCommitFailed,
                historyCommitError,
                successMessage,
            });
            return result;
        } catch (error) {
            if (persistedResult) {
                acknowledge(persistedResult);
                onFollowupFailed(snapshot, error);
                return persistedResult;
            }
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
        let acknowledge;
        const durable = new Promise(resolve => { acknowledge = resolve; });
        const previous = queue.pending;
        queue.pending = durable;
        const run = () => persistSnapshot(snapshot, queue, acknowledge);
        const queued = previous ? previous.then(run) : run();
        // Release subsequent disk writes even after a rejected/cancelled save.
        queued.then(acknowledge, () => acknowledge(null));
        queue.completion = queued;
        queues.set(snapshot.path, queue);
        queued.finally(() => {
            if (queue.completion === queued) queues.delete(snapshot.path);
        }).catch(() => {});
        return options.durabilityOnly ? Promise.race([durable, queued]) : queued;
    }

    return {
        save,
        pendingForPath(path) {
            return queues.get(path)?.completion || null;
        },
    };
}
