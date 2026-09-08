import { createDocumentSave } from '../frontend/js/usecases/documentSave.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function harness(overrides = {}) {
    const writes = [];
    const onSaved = jest.fn();
    const saver = createDocumentSave({
        persist: jest.fn(async request => {
            writes.push(request);
            return { success: true, mtime: writes.length + 10 };
        }),
        confirmOverwrite: jest.fn().mockResolvedValue(false),
        commit: jest.fn().mockResolvedValue(),
        onSaved,
        onFailed: jest.fn(),
        ...overrides,
    });
    return { saver, writes, onSaved };
}

describe('document save use case', () => {
    test('a failed post-save presentation never reports an acknowledged write as a disk failure', async () => {
        const onFailed = jest.fn(), onFollowupFailed = jest.fn();
        const { saver } = harness({ onSaved: async () => { throw new Error('view unavailable'); }, onFailed, onFollowupFailed });
        await expect(saver.save({ path: 'note.md', mtime: 10 }, 'safe')).resolves.toMatchObject({ success: true });
        expect(onFailed).not.toHaveBeenCalled();
        expect(onFollowupFailed).toHaveBeenCalled();
    });
    test('writes the next edit to disk while Git is held, and indexes only after each Git attempt', async () => {
        const history = deferred(), calls = [];
        const refreshIndex = jest.fn(async () => { calls.push('index'); });
        let version = 10;
        const { saver } = harness({
            persist: async request => { calls.push(`disk:${request.content}`); return { success: true, mtime: ++version }; },
            shouldCommit: () => true,
            commit: async () => { calls.push('git'); await history.promise; },
            refreshIndex,
        });
        const first = saver.save({ path: 'note.md', mtime: 10 }, 'first');
        const second = saver.save({ path: 'note.md', mtime: 10 }, 'second', { durabilityOnly: true });
        await expect(second).resolves.toMatchObject({ success: true, mtime: 12 });
        expect(calls).toEqual(['disk:first', 'git', 'disk:second', 'git']);
        expect(refreshIndex).not.toHaveBeenCalled();
        history.resolve(); await first; await saver.pendingForPath('note.md');
        expect(refreshIndex).toHaveBeenCalledTimes(2);
    });

    test('Git and index failures cannot reclassify an acknowledged disk save as a failed save', async () => {
        const onFailed = jest.fn(), onFollowupFailed = jest.fn(), order = [];
        const { saver } = harness({
            persist: async () => { order.push('disk'); return { success: true, mtime: 11 }; },
            shouldCommit: () => true,
            commit: async () => { order.push('git'); throw new Error('Git locked'); },
            refreshIndex: async () => { order.push('index'); throw new Error('index unavailable'); },
            onFailed, onFollowupFailed,
        });
        await expect(saver.save({ path: 'note.md', mtime: 10 }, 'safe')).resolves.toMatchObject({ success: true });
        expect(order).toEqual(['disk', 'git', 'index']);
        expect(onFailed).not.toHaveBeenCalled();
        expect(onFollowupFailed).toHaveBeenCalledWith(expect.anything(), expect.any(Error));
    });
    test('serializes one path and reads the revision after the prior save', async () => {
        const first = deferred();
        const persist = jest.fn()
            .mockImplementationOnce(() => first.promise)
            .mockResolvedValueOnce({ success: true, mtime: 12 });
        const tab = { path: 'note.md', mtime: 10 };
        const { saver } = harness({ persist });

        const savingFirst = saver.save(tab, 'first');
        const savingSecond = saver.save(tab, 'second');
        await Promise.resolve();
        await Promise.resolve();
        expect(persist).toHaveBeenCalledTimes(1);
        first.resolve({ success: true, mtime: 11 });
        await savingFirst;
        await savingSecond;

        expect(persist.mock.calls.map(([request]) => request.expectedMtime)).toEqual([10, 11]);
        expect(saver.pendingForPath('note.md')).toBeNull();
    });

    test('a queued failure preserves the last successful revision for remaining saves', async () => {
        const first = deferred();
        const persist = jest.fn()
            .mockImplementationOnce(() => first.promise)
            .mockRejectedValueOnce(new Error('temporarily read-only'))
            .mockResolvedValueOnce({ success: true, mtime: 12 });
        const onPersisted = jest.fn();
        const { saver } = harness({ persist, onPersisted });
        const tab = { path: 'note.md', mtime: 10 };
        const saving = saver.save(tab, 'first');
        const failing = expect(saver.save(tab, 'second')).rejects.toThrow('temporarily read-only');
        const retrying = saver.save(tab, 'third');
        first.resolve({ success: true, mtime: 11 });
        await saving;
        await failing;
        await retrying;
        expect(persist.mock.calls.map(([request]) => request.expectedMtime)).toEqual([10, 11, 11]);
        expect(onPersisted.mock.calls.map(([, result]) => result.mtime)).toEqual([11, 12]);
    });

    test('acknowledges the written revision before waiting for Git history', async () => {
        const history = deferred();
        const onPersisted = jest.fn();
        const { saver, onSaved } = harness({ shouldCommit: () => true, commit: () => history.promise, onPersisted });
        const saving = saver.save({ path: 'note.md', mtime: 10 }, 'saved');
        await Promise.resolve();
        await Promise.resolve();
        expect(onPersisted).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mtime: 11 }));
        expect(onSaved).not.toHaveBeenCalled();
        history.resolve();
        await saving;
    });

    test('cancels a conflict without overwriting external content', async () => {
        const persist = jest.fn().mockResolvedValue({
            success: false,
            error: 'File modified externally',
        });
        const confirmOverwrite = jest.fn().mockResolvedValue(false);
        const { saver, onSaved } = harness({ persist, confirmOverwrite });

        await expect(saver.save({ path: 'note.md', mtime: 10 }, 'mine')).resolves.toEqual(
            expect.objectContaining({ success: false }),
        );
        expect(persist).toHaveBeenCalledTimes(1);
        expect(onSaved).not.toHaveBeenCalled();
    });

    test('forces an approved conflict and reports a failed optional commit', async () => {
        const persist = jest.fn()
            .mockResolvedValueOnce({ success: false, error: 'File modified externally' })
            .mockResolvedValueOnce({ success: true, mtime: 12 });
        const commit = jest.fn().mockRejectedValue(new Error('git unavailable'));
        const onSaved = jest.fn();
        const saver = createDocumentSave({
            persist,
            confirmOverwrite: jest.fn().mockResolvedValue(true),
            shouldCommit: () => true,
            commit,
            onSaved,
        });

        const result = await saver.save({ path: 'note.md', mtime: 10 }, 'mine');

        expect(persist.mock.calls.map(([request]) => request.expectedMtime)).toEqual([10, 0]);
        expect(result).toMatchObject({ success: true, historyCommitSucceeded: false });
        expect(onSaved).toHaveBeenCalledWith(
            expect.anything(),
            result,
            expect.objectContaining({
                historyCommitFailed: true,
                historyCommitError: expect.any(Error),
                successMessage: 'Saved (forced)',
            }),
        );
    });

    test('reports a non-conflict failed result instead of offering overwrite', async () => {
        const persist = jest.fn().mockResolvedValue({
            success: false,
            error: 'External file is read-only',
        });
        const confirmOverwrite = jest.fn();
        const onFailed = jest.fn();
        const { saver } = harness({ persist, confirmOverwrite, onFailed });
        const tab = { path: '/outside/note.md', mtime: 10, externalFileId: 'launch-1' };

        await expect(saver.save(tab, 'mine')).rejects.toThrow('External file is read-only');
        expect(confirmOverwrite).not.toHaveBeenCalled();
        expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({
            tabId: tab.path,
            path: tab.path,
        }), expect.any(Error));
    });
});
