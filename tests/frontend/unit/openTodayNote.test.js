import { createOpenTodayNote } from '../frontend/js/usecases/openTodayNote.js';

describe('Open today note use case', () => {
    test('opens an existing note without writing', async () => {
        const createFile = jest.fn();
        const openFile = jest.fn();
        const openToday = createOpenTodayNote({
            getTodayPath: () => '2024-01-15',
            getTree: () => [{ path: '2024-01-15.md', type: 'file', mtime: 12 }],
            createFile,
            openFile,
        });

        await expect(openToday()).resolves.toEqual({ success: true, path: '2024-01-15.md', created: false });
        expect(createFile).not.toHaveBeenCalled();
        expect(openFile).toHaveBeenCalledWith({ path: '2024-01-15.md', mtime: 12, created: false });
    });

    test('creates a missing note once and refreshes before opening it', async () => {
        const calls = [];
        const openToday = createOpenTodayNote({
            getTodayPath: async () => '2024-01-15',
            getTree: () => [],
            createFile: async (path, content) => {
                calls.push(['create', path, content]);
                return { success: true, path, mtime: 13 };
            },
            afterCreate: async path => calls.push(['refresh', path]),
            openFile: async file => calls.push(['open', file]),
        });

        await expect(openToday()).resolves.toEqual({ success: true, path: '2024-01-15.md', created: true });
        expect(calls).toEqual([
            ['create', '2024-01-15.md', '# 2024-01-15\n\n'],
            ['refresh', '2024-01-15.md'],
            ['open', { path: '2024-01-15.md', mtime: 13, created: true }],
        ]);
    });

    test('treats a create collision as an existing note and never overwrites it', async () => {
        const openFile = jest.fn();
        const openToday = createOpenTodayNote({
            getTodayPath: () => '2024-01-15',
            getTree: () => [],
            createFile: () => ({ success: false, error: 'File already exists' }),
            afterCreate: jest.fn(),
            openFile,
        });

        await expect(openToday()).resolves.toEqual({
            success: true,
            path: '2024-01-15.md',
            created: false,
            collision: true,
        });
        expect(openFile).toHaveBeenCalledWith({ path: '2024-01-15.md', created: false });
    });

    test('reports a creation failure without opening a note', async () => {
        const openFile = jest.fn();
        const openToday = createOpenTodayNote({
            getTodayPath: () => '2024-01-15',
            getTree: () => [],
            createFile: () => ({ success: false, error: 'Vault is read-only' }),
            openFile,
        });

        await expect(openToday()).rejects.toThrow('Vault is read-only');
        expect(openFile).not.toHaveBeenCalled();
    });
});
