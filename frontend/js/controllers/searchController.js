import { backend } from '../backend.js';
import { log } from '../log.js';
import { getState, setState } from '../state.js';
import { openTab } from '../tabManager.js';
import {
    nextSearchSelection,
    normalizeSearchFilters,
    updateSearchFilter,
} from '../core/searchModel.js';
import { createWorkspaceSearch } from '../usecases/workspaceSearch.js';
import {
    clearSearchCount,
    clearSearchView,
    closeSearchView,
    closeSearchWhenOutside,
    currentSearchQuery,
    isSearchVisible,
    renderSearchResults,
    scrollSearchSelection,
    showSearchLoading,
} from '../views/searchView.js';

let activeSearchIndex = -1;

function filters() {
    return normalizeSearchFilters(getState('searchFilters'));
}

function publishQuery(query, caseSensitive) {
    setState('searchQuery', query);
    setState('globalSearchQuery', query);
    setState('searchCaseSensitive', caseSensitive);
}

function publishResults(results) {
    setState('searchResults', results);
    setState('globalSearchResults', results);
}

const workspaceSearch = createWorkspaceSearch({
    searchContent: (query, caseSensitive) => backend().SearchFiles(query, caseSensitive),
    readFileTree: () => getState('fileTreeData'),
    readRecentFiles: () => getState('recentFiles'),
    readFilters: filters,
    publishQuery,
    publishResults,
    reportFailure(error) {
        log.error('Search failed:', error);
    },
});

function render(results, query) {
    renderSearchResults({
        results,
        query,
        filters: filters(),
        selectedIndex: activeSearchIndex,
        onFilter(name) {
            const current = filters();
            setSearchFilter(name, !current[name]);
            const activeQuery = currentSearchQuery();
            if (activeQuery) performGlobalSearch(activeQuery);
        },
        onOpen(index) {
            const result = results[index];
            if (result) openSearchResult(result);
        },
    });
}

export function initSearch() {
    document.addEventListener('click', event => {
        if (closeSearchWhenOutside(event.target)) activeSearchIndex = -1;
    });
}

export function setSearchFilter(name, enabled) {
    const next = updateSearchFilter(filters(), name, enabled);
    setState('searchFilters', next);
    setState('searchCaseSensitive', next.caseSensitive);
}

export async function performSearch(query, caseSensitive) {
    const outcome = await workspaceSearch.execute(query, caseSensitive);
    if (outcome.error && !outcome.stale) clearSearchCount();
    return outcome.results;
}

export async function performGlobalSearch(query) {
    const trimmedQuery = String(query || '').trim();
    if (!trimmedQuery) {
        clearGlobalSearch(false);
        return;
    }
    if (!showSearchLoading()) return;
    activeSearchIndex = -1;
    const outcome = await workspaceSearch.execute(trimmedQuery);
    if (outcome.stale) return;
    if (outcome.error) {
        clearSearchCount();
        return;
    }
    render(outcome.results, outcome.query);
}

export function clearGlobalSearch(clearInput = true) {
    workspaceSearch.invalidate();
    activeSearchIndex = -1;
    clearSearchView(clearInput);
    publishQuery('', filters().caseSensitive);
    publishResults([]);
}

function openSearchResult(result) {
    closeSearchView();
    activeSearchIndex = -1;
    const firstMatch = result.matches?.[0];
    openTab(result.path, result.name || result.path.split('/').pop(), 'file', {
        path: result.path,
        mtime: result.mtime,
        line: firstMatch?.line,
    });
}

export function handleSearchKeydown(event) {
    const query = currentSearchQuery();
    if (event.key === 'Escape') {
        clearGlobalSearch();
        event.preventDefault();
        return true;
    }
    if (!query || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return false;
    if (!isSearchVisible()) {
        if (event.key !== 'Enter') {
            performGlobalSearch(query);
            event.preventDefault();
            return true;
        }
        return false;
    }

    const results = getState('searchResults') || [];
    if (!results.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        activeSearchIndex = nextSearchSelection(
            activeSearchIndex,
            results.length,
            event.key === 'ArrowDown' ? 1 : -1,
        );
        render(results, query);
        scrollSearchSelection(activeSearchIndex);
        event.preventDefault();
        return true;
    }
    if (event.key === 'Enter' && activeSearchIndex >= 0) {
        openSearchResult(results[activeSearchIndex]);
        event.preventDefault();
        return true;
    }
    return false;
}

export default {
    initSearch,
    performSearch,
    performGlobalSearch,
    clearGlobalSearch,
    handleSearchKeydown,
    setSearchFilter,
};
