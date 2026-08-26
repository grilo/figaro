import { createDrawioImage } from '../frontend/js/usecases/createDrawioImage.js';

const target = { path: 'Notes/flow.drawio.svg', title: 'flow.drawio.svg' };

describe('Draw.io image creation use case', () => {
    test('creates an empty file, opens the diagram, and then refreshes the tree', async () => {
        const calls = [];
        const result = await createDrawioImage({
            target,
            createFile: async (path, content) => {
                calls.push(['create', path, content]);
                return { success: true, path, mtime: 42 };
            },
            refreshTree: async () => calls.push(['refresh']),
            openDiagram: async diagram => calls.push(['open', diagram]),
        });

        expect(result).toEqual({ kind: 'created', path: target.path });
        expect(calls).toEqual([
            ['create', target.path, ''],
            ['open', { ...target, mtime: 42 }],
            ['refresh'],
        ]);
    });

    test('does not refresh or open when creation fails', async () => {
        const refreshTree = jest.fn();
        const openDiagram = jest.fn();
        await expect(createDrawioImage({
            target,
            createFile: async () => ({ success: false, error: 'Destination exists' }),
            refreshTree,
            openDiagram,
        })).resolves.toEqual({ kind: 'failed', error: 'Destination exists' });
        expect(refreshTree).not.toHaveBeenCalled();
        expect(openDiagram).not.toHaveBeenCalled();
    });

    test('opens a created diagram before a pending tree refresh settles', async () => {
        const openDiagram = jest.fn();
        let releaseRefresh;
        const result = await createDrawioImage({
            target,
            createFile: async () => ({ success: true, path: target.path }),
            refreshTree: () => new Promise(resolve => { releaseRefresh = resolve; }),
            openDiagram,
        });
        expect(result).toEqual({ kind: 'created', path: target.path });
        expect(openDiagram).toHaveBeenCalledWith({ ...target, mtime: undefined });
        releaseRefresh();
    });

    test('reports a later tree refresh failure without changing successful creation', async () => {
        const openDiagram = jest.fn();
        const reportRefreshFailure = jest.fn();
        const refreshError = new Error('tree unavailable');
        await expect(createDrawioImage({
            target,
            createFile: async () => ({ success: true, path: target.path }),
            refreshTree: async () => { throw refreshError; },
            openDiagram,
            reportRefreshFailure,
        })).resolves.toEqual({ kind: 'created', path: target.path });
        await Promise.resolve();
        await Promise.resolve();
        expect(openDiagram).toHaveBeenCalledWith({ ...target, mtime: undefined });
        expect(reportRefreshFailure).toHaveBeenCalledWith(refreshError);
    });

    test('refreshes discovery after a created diagram cannot be opened', async () => {
        const refreshTree = jest.fn();
        const openError = new Error('tab unavailable');
        await expect(createDrawioImage({
            target,
            createFile: async () => ({ success: true, path: target.path }),
            refreshTree,
            openDiagram: async () => { throw openError; },
        })).resolves.toEqual({
            kind: 'created-open-failed',
            path: target.path,
            error: openError,
        });
        expect(refreshTree).toHaveBeenCalledTimes(1);
    });
});
