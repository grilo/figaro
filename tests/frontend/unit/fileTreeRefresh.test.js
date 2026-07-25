import { createFileTreeRefresh } from '../frontend/js/usecases/fileTreeRefresh.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

describe('file tree refresh use case', () => {
    test('publishes only the newest completed request', async () => {
        const first = deferred();
        const publish = jest.fn();
        const readTree = jest.fn()
            .mockImplementationOnce(() => first.promise)
            .mockResolvedValueOnce([{ path: 'new.md' }]);
        const refresh = createFileTreeRefresh({
            readTree,
            readStyles: jest.fn().mockResolvedValue({ version: 1 }),
            fallbackStyles: () => ({}),
            publish,
        });

        const older = refresh.refresh();
        await refresh.refresh();
        first.resolve([{ path: 'old.md' }]);
        await older;

        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith(expect.objectContaining({
            tree: [{ path: 'new.md' }],
        }));
    });

    test('keeps the tree usable when optional appearance I/O fails', async () => {
        const publish = jest.fn();
        const onStylesFailed = jest.fn();
        const refresh = createFileTreeRefresh({
            readTree: jest.fn().mockResolvedValue([{ path: 'note.md' }]),
            readStyles: jest.fn().mockRejectedValue(new Error('settings unavailable')),
            fallbackStyles: () => ({ version: 1, entries: {} }),
            publish,
            onStylesFailed,
        });

        await refresh.refresh();

        expect(onStylesFailed).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith({
            tree: [{ path: 'note.md' }],
            styles: { version: 1, entries: {} },
        });
    });
});
