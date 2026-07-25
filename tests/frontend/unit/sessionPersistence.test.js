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
