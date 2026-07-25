import { createWorkspaceSearch } from '../frontend/js/usecases/workspaceSearch.js';

function deferred() {
    let resolve;
    const promise = new Promise(finish => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('workspace search use case', () => {
    test('skips content I/O for a title-only search', async () => {
        const searchContent = jest.fn();
        const publishResults = jest.fn();
        const search = createWorkspaceSearch({
            searchContent,
            readFileTree: () => [{ type: 'file', path: 'Alpha.md', name: 'Alpha.md' }],
            readRecentFiles: () => [],
            readFilters: () => ({ titleOnly: true }),
            publishQuery: jest.fn(),
            publishResults,
        });

        const outcome = await search.execute('alpha');
        expect(searchContent).not.toHaveBeenCalled();
        expect(outcome.results).toEqual([expect.objectContaining({ path: 'Alpha.md' })]);
        expect(publishResults).toHaveBeenCalledWith(outcome.results);
    });

    test('does not publish a stale response after a newer request', async () => {
        const slow = deferred();
        const fast = deferred();
        const publishResults = jest.fn();
        const searchContent = jest.fn()
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);
        const search = createWorkspaceSearch({
            searchContent,
            readFileTree: () => [],
            readRecentFiles: () => [],
            readFilters: () => ({}),
            publishQuery: jest.fn(),
            publishResults,
        });

        const first = search.execute('first');
        const second = search.execute('second');
        fast.resolve([{ path: 'Second.md', matches: [] }]);
        await expect(second).resolves.toEqual(expect.objectContaining({ stale: false }));
        slow.resolve([{ path: 'First.md', matches: [] }]);
        await expect(first).resolves.toEqual(expect.objectContaining({ stale: true }));

        expect(publishResults).toHaveBeenCalledTimes(1);
        expect(publishResults.mock.calls[0][0][0].path).toBe('Second.md');
    });

    test('reports a current failure without clearing a newer result', async () => {
        const error = new Error('search unavailable');
        const reportFailure = jest.fn();
        const publishResults = jest.fn();
        const search = createWorkspaceSearch({
            searchContent: async () => {
                throw error;
            },
            readFileTree: () => [],
            readRecentFiles: () => [],
            readFilters: () => ({}),
            publishQuery: jest.fn(),
            publishResults,
            reportFailure,
        });

        await expect(search.execute('query')).resolves.toEqual(expect.objectContaining({
            stale: false,
            error,
        }));
        expect(reportFailure).toHaveBeenCalledWith(error);
        expect(publishResults).not.toHaveBeenCalled();
    });
});
