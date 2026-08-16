import { createVaultLoadingSession } from '../frontend/js/usecases/vaultLoading.js';

describe('vault loading session', () => {
    test('reconciles the status snapshot without allowing stale events to move progress backward', async () => {
        const present = jest.fn();
        const remove = jest.fn();
        const session = createVaultLoadingSession({
            readStatus: async () => ({ generation: 1, phase: 'loading', loaded: 50, total: 100 }),
            present,
            remove,
        });

        session.start();
        expect(session.update({ generation: 1, phase: 'loading', loaded: 60, total: 100 })).toBe(true);
        await session.connect();
        expect(present).toHaveBeenLastCalledWith(expect.objectContaining({ count: '60 / 100 notes' }));
        expect(session.update({ generation: 1, phase: 'discovering' })).toBe(false);
        expect(session.update({ generation: 0, phase: 'ready', loaded: 100, total: 100 })).toBe(false);
        expect(session.update({ generation: 2, phase: 'discovering' })).toBe(true);

        expect(session.finish()).toBe(true);
        expect(session.finish()).toBe(false);
        expect(remove).toHaveBeenCalledTimes(1);
        expect(session.update({ generation: 2, phase: 'ready' })).toBe(false);
    });

    test('settles only when the current vault generation is ready or failed', async () => {
        const session = createVaultLoadingSession({
            readStatus: async () => ({ generation: 1, phase: 'loading', loaded: 1, total: 2 }),
            present: jest.fn(),
            remove: jest.fn(),
        });
        await session.connect();

        let settled = false;
        const completion = session.waitUntilSettled().then(status => {
            settled = true;
            return status;
        });
        await Promise.resolve();
        expect(settled).toBe(false);

        session.update({ generation: 1, phase: 'ready', loaded: 2, total: 2 });
        await expect(completion).resolves.toMatchObject({ phase: 'ready', loaded: 2, total: 2 });
    });
});
