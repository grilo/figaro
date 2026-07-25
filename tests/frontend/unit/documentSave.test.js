import { createDocumentSave } from '../frontend/js/usecases/documentSave.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function harness(overrides = {}) {
    const writes = [];
    const onSaved = jest.fn(async (snapshot, result) => {
        snapshot.tab.mtime = result.mtime;
    });
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
    test('serializes one path and reads the revision after the prior save', async () => {
        const first = deferred();
        const persist = jest.fn()
            .mockImplementationOnce(() => first.promise)
            .mockResolvedValueOnce({ success: true, mtime: 12 });
        const tab = { path: 'note.md', mtime: 10 };
        const { saver } = harness({
            persist,
            onSaved: async (snapshot, result) => { snapshot.tab.mtime = result.mtime; },
        });

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
            .mockResolvedValueOnce({ success: false })
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
});
