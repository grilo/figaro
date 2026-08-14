import { normalizeSearchFilters, normalizeSearchResult } from '../core/searchModel.js';

export function createWorkspaceSearch({
    searchContent,
    readRecentFiles,
    readFilters,
    publishQuery,
    publishResults,
    publishSuggestion = () => {},
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
            publishSuggestion('');
            return { requestId, query, results: [], suggestion: '', stale: false };
        }

        try {
            const response = await searchContent(query, {
                caseSensitive: matchCase,
                titleOnly: filters.titleOnly,
            });
            const rawResults = Array.isArray(response) ? response : response?.results;
            const suggestion = Array.isArray(response) ? '' : String(response?.suggestion || '');
            let results = (rawResults || []).map(normalizeSearchResult);
            if (filters.recentOnly) {
                const recentOrder = new Map((readRecentFiles() || []).map((item, index) => [item.path, index]));
                results = results
                    .filter(result => recentOrder.has(result.path))
                    .sort((left, right) => recentOrder.get(left.path) - recentOrder.get(right.path));
            }
            if (requestId !== latestRequest) {
                return { requestId, query, results, suggestion, stale: true };
            }
            publishResults(results);
            publishSuggestion(suggestion);
            return { requestId, query, results, suggestion, stale: false };
        } catch (error) {
            if (requestId !== latestRequest) {
                return { requestId, query, results: [], suggestion: '', stale: true, error };
            }
            reportFailure(error);
            publishSuggestion('');
            return { requestId, query, results: [], suggestion: '', stale: false, error };
        }
    }

    function invalidate() {
        latestRequest += 1;
    }

    return { execute, invalidate };
}
