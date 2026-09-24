import { createSessionPersistence } from '../frontend/js/usecases/sessionPersistence.js';

function deferred() {
    let resolve;
    const promise = new Promise(finish => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('session persistence use case', () => {
    test('normalizes loaded data before applying it', async () => {
        const applySession = jest.fn();
        const resetWorkspace = jest.fn();
        const persistence = createSessionPersistence({
            readSession: async () => ({
                openTabs: [{ id: 'note.md', type: 'file', title: 'Note', path: 'note.md' }],
                activeTabId: 'note.md',
            }),
            writeSession: jest.fn(),
            readWorkspace: jest.fn(),
            applySession,
            resetWorkspace,
        });

        await expect(persistence.load()).resolves.toBe(true);
        expect(resetWorkspace).toHaveBeenCalledTimes(1);
        expect(applySession).toHaveBeenCalledWith(expect.objectContaining({
            activeTabId: 'note.md',
            openTabs: [{ id: 'note.md', type: 'file', title: 'Note', path: 'note.md' }],
        }));
    });

    test('resets safely and reports a read failure without applying state', async () => {
        const failure = new Error('unreadable session');
        const applySession = jest.fn();
        const resetWorkspace = jest.fn();
        const reportFailure = jest.fn();
        const persistence = createSessionPersistence({
            readSession: async () => {
                throw failure;
            },
            writeSession: jest.fn(),
            readWorkspace: jest.fn(),
            applySession,
            resetWorkspace,
            reportFailure,
        });

        await expect(persistence.load()).resolves.toBe(false);
        expect(resetWorkspace).toHaveBeenCalledTimes(1);
        expect(applySession).not.toHaveBeenCalled();
        expect(reportFailure).toHaveBeenCalledWith('load', failure);
    });

    test('serializes queued writes so a newer snapshot cannot finish first', async () => {
        const first = deferred();
        const second = deferred();
        const writeSession = jest.fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);
        let activeTabId = 'first.md';
        const persistence = createSessionPersistence({
            readSession: jest.fn(),
            writeSession,
            readWorkspace: () => ({
                openTabs: [{ id: activeTabId, type: 'file', title: activeTabId, path: activeTabId }],
                activeTabId,
            }),
            applySession: jest.fn(),
            resetWorkspace: jest.fn(),
        });

        const firstSave = persistence.save();
        activeTabId = 'second.md';
        const secondSave = persistence.save();
        await Promise.resolve();

        expect(writeSession).toHaveBeenCalledTimes(1);
        first.resolve({ success: true });
        await firstSave;
        await Promise.resolve();
        expect(writeSession).toHaveBeenCalledTimes(2);
        expect(writeSession.mock.calls[1][0].activeTabId).toBe('second.md');

        second.resolve({ success: true });
        await secondSave;
    });
});


test.each([false, true])('slow session writes coalesce to the latest snapshot and recover (failure=%s)', async (fail) => {
    const held = deferred();
    const failure = new Error('slow disk failed');
    let head = 0;
    const reportFailure = jest.fn();
    const writeSession = jest.fn().mockImplementationOnce(async () => {
        await held.promise;
        if (fail) throw failure;
    }).mockResolvedValue(undefined);
    const persistence = createSessionPersistence({
        writeSession, reportFailure,
        readWorkspace: () => ({
            openTabs: [{ id: 'note.md', type: 'file', path: 'note.md', title: 'Note', cursorState: { anchor: head, head } }],
            activeTabId: 'note.md',
        }),
    });
    const first = persistence.save();
    const pending = [];
    for (head = 1; head <= 100; head++) pending.push(persistence.save());
    expect(writeSession).toHaveBeenCalledTimes(1);
    expect(new Set(pending).size).toBe(1);
    held.resolve();
    await Promise.all([first, ...pending]);
    expect(writeSession).toHaveBeenCalledTimes(2);
    expect(writeSession.mock.calls[0][0].cursorStates['note.md'].head).toBe(0);
    expect(writeSession.mock.calls[1][0].cursorStates['note.md'].head).toBe(100);
    expect(reportFailure).toHaveBeenCalledTimes(fail ? 1 : 0);
    if (fail) expect(reportFailure).toHaveBeenCalledWith('save', failure);
    head = 200;
    await persistence.save();
    expect(writeSession).toHaveBeenCalledTimes(3);
    expect(writeSession.mock.calls[2][0].cursorStates['note.md'].head).toBe(200);
});

test('skips an identical workspace but retries one whose write failed', async () => {
    let workspace = { openTabs: [{ id: 'note.md', type: 'file', title: 'Note', path: 'note.md' }], activeTabId: 'note.md' };
    const writeSession = jest.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue({ success: true });
    const persistence = createSessionPersistence({ readSession: jest.fn(), writeSession, readWorkspace: () => workspace,
        applySession: jest.fn(), resetWorkspace: jest.fn() });
    await persistence.save();
    await persistence.save();
    expect(writeSession).toHaveBeenCalledTimes(2);
    await persistence.save();
    expect(writeSession).toHaveBeenCalledTimes(2);
    workspace = { ...workspace, tabCursorStates: { 'note.md': { anchor: 4, head: 4 } } };
    await persistence.save();
    expect(writeSession).toHaveBeenCalledTimes(3);
});
