import { createWorkspaceSearch } from '../frontend/js/usecases/workspaceSearch.js';

function deferred() {
    let resolve;
    const promise = new Promise(finish => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('workspace search use case', () => {
    test('delegates title-only ranking to the native search index', async () => {
        const searchContent = jest.fn().mockResolvedValue({
            results: [{ path: 'Alpha.md', name: 'Alpha.md', title_match: true }],
            suggestion: '',
        });
        const publishResults = jest.fn();
        const search = createWorkspaceSearch({
            searchContent,
            readRecentFiles: () => [],
            readFilters: () => ({ titleOnly: true }),
            publishQuery: jest.fn(),
            publishResults,
        });

        const outcome = await search.execute('alpha');
        expect(searchContent).toHaveBeenCalledWith('alpha', {
            caseSensitive: false,
            titleOnly: true,
        });
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
            readRecentFiles: () => [],
            readFilters: () => ({}),
            publishQuery: jest.fn(),
            publishResults,
        });

        const first = search.execute('first');
        const second = search.execute('second');
        fast.resolve({ results: [{ path: 'Second.md', matches: [] }], suggestion: '' });
        await expect(second).resolves.toEqual(expect.objectContaining({ stale: false }));
        slow.resolve({ results: [{ path: 'First.md', matches: [] }], suggestion: '' });
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

    test('publishes a low-result correction separately from ranked results', async () => {
        const publishSuggestion = jest.fn();
        const search = createWorkspaceSearch({
            searchContent: jest.fn().mockResolvedValue({
                results: [],
                suggestion: 'deployment',
            }),
            readRecentFiles: () => [],
            readFilters: () => ({}),
            publishQuery: jest.fn(),
            publishResults: jest.fn(),
            publishSuggestion,
        });

        await expect(search.execute('deploymnet')).resolves.toEqual(expect.objectContaining({
            results: [],
            suggestion: 'deployment',
        }));
        expect(publishSuggestion).toHaveBeenCalledWith('deployment');
    });

    test('keeps Recent as a local subset in recent-note order', async () => {
        const search = createWorkspaceSearch({
            searchContent: jest.fn().mockResolvedValue({
                results: [
                    { path: 'A.md', score: 10 },
                    { path: 'B.md', score: 8 },
                    { path: 'C.md', score: 6 },
                ],
                suggestion: '',
            }),
            readRecentFiles: () => [{ path: 'B.md' }, { path: 'A.md' }],
            readFilters: () => ({ recentOnly: true }),
            publishQuery: jest.fn(),
            publishResults: jest.fn(),
        });

        const outcome = await search.execute('query');
        expect(outcome.results.map(result => result.path)).toEqual(['B.md', 'A.md']);
    });
});
