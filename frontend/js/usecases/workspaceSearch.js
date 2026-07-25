import {
    findTitleMatches,
    mergeSearchResults,
    normalizeSearchFilters,
} from '../core/searchModel.js';

export function createWorkspaceSearch({
    searchContent,
    readFileTree,
    readRecentFiles,
    readFilters,
    publishQuery,
    publishResults,
    reportFailure = () => {},
}) {
    let latestRequest = 0;

    async function execute(rawQuery, caseSensitive) {
        const requestId = ++latestRequest;
        const query = String(rawQuery || '').trim();
        const filters = normalizeSearchFilters(readFilters());
        const matchCase = typeof caseSensitive === 'boolean'
            ? caseSensitive
            : filters.caseSensitive;

        publishQuery(query, matchCase);
        if (!query) {
            publishResults([]);
            return { requestId, query, results: [], stale: false };
        }

        try {
            const contentResults = filters.titleOnly
                ? []
                : await searchContent(query, matchCase);
            const titleResults = findTitleMatches(readFileTree(), query, matchCase);
            const results = mergeSearchResults(
                contentResults,
                titleResults,
                readRecentFiles(),
                filters.recentOnly,
            );
            if (requestId !== latestRequest) {
                return { requestId, query, results, stale: true };
            }
            publishResults(results);
            return { requestId, query, results, stale: false };
        } catch (error) {
            if (requestId !== latestRequest) {
                return { requestId, query, results: [], stale: true, error };
            }
            reportFailure(error);
            return { requestId, query, results: [], stale: false, error };
        }
    }

    function invalidate() {
        latestRequest += 1;
    }

    return { execute, invalidate };
}
