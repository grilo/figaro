import { backend, clearDebugBackend, hasBackend, installDebugBackend } from '../frontend/js/backend.js';

describe('native Wails backend access', () => {
    afterEach(() => {
        clearDebugBackend();
    });

    test('uses the exact App binding Wails publishes to the frontend', async () => {
        const native = { GetFileTree: jest.fn().mockResolvedValue([{ path: 'Welcome.md' }]) };
        window.go = { main: { App: native } };

        expect(hasBackend()).toBe(true);
        await expect(backend().GetFileTree()).resolves.toEqual([{ path: 'Welcome.md' }]);
        expect(native.GetFileTree).toHaveBeenCalledTimes(1);
    });

    test('uses an explicit browser-debug backend only when no native binding exists', async () => {
        delete window.go;
        const debug = { GetFileTree: jest.fn().mockResolvedValue([]) };
        installDebugBackend(debug);

        await expect(backend().GetFileTree()).resolves.toEqual([]);
        expect(debug.GetFileTree).toHaveBeenCalledTimes(1);
    });

    test('rejects an incomplete debug backend instead of masking a missing native connection', () => {
        expect(() => installDebugBackend({})).toThrow('GetFileTree');
    });
});
