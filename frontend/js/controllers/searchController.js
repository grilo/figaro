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
    selectSearchResult,
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

function publishSuggestion(suggestion) {
    setState('searchSuggestion', String(suggestion || ''));
}

const workspaceSearch = createWorkspaceSearch({
    searchContent: (query, options) => backend().SearchNotes(query, {
        case_sensitive: Boolean(options.caseSensitive),
        title_only: Boolean(options.titleOnly),
        profile: 'global',
        limit: 0,
        suggest: true,
    }),
    readRecentFiles: () => getState('recentFiles'),
    readFilters: filters,
    publishQuery,
    publishResults,
    publishSuggestion,
    reportFailure(error) {
        log.error('Search failed:', error);
    },
});

function render(results, query, suggestion = '') {
    renderSearchResults({
        results,
        query,
        filters: filters(),
        selectedIndex: activeSearchIndex,
        suggestion,
        onFilter(name) {
            const current = filters();
            setSearchFilter(name, !current[name]);
            const activeQuery = currentSearchQuery();
            if (activeQuery) performGlobalSearch(activeQuery, { preserveResults: true });
        },
        onOpen(index) {
            const result = results[index];
            if (result) openSearchResult(result);
        },
        onSuggest(value) {
            const input = document.getElementById('global-search-input');
            if (input) {
                input.value = value;
                input.focus();
            }
            performGlobalSearch(value);
        },
    });
}

export function initSearch() {
    const closeOnOutsideClick = event => {
        if (closeSearchWhenOutside(event.target, event.composedPath?.() || [])) {
            activeSearchIndex = -1;
        }
    };
    document.addEventListener('click', closeOnOutsideClick);
    return () => document.removeEventListener('click', closeOnOutsideClick);
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

export async function performGlobalSearch(query, { preserveResults = false } = {}) {
    const trimmedQuery = String(query || '').trim();
    if (!trimmedQuery) {
        clearGlobalSearch(false);
        return;
    }
    if ((!preserveResults || !isSearchVisible()) && !showSearchLoading()) return;
    activeSearchIndex = -1;
    const outcome = await workspaceSearch.execute(trimmedQuery);
    if (outcome.stale) return;
    if (outcome.error) {
        clearSearchCount();
        return;
    }
    render(outcome.results, outcome.query, outcome.suggestion);
}

export function clearGlobalSearch(clearInput = true) {
    workspaceSearch.invalidate();
    activeSearchIndex = -1;
    clearSearchView(clearInput);
    publishQuery('', filters().caseSensitive);
    publishResults([]);
    publishSuggestion('');
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
        selectSearchResult(activeSearchIndex);
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
