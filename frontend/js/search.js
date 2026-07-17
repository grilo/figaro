import { backend } from './backend.js';
/**
 * Search Module - workspace search in the sidebar
 */

import { log } from './log.js';
import { setState, getState } from './state.js';
import { openTab } from './tabManager.js';

const DEFAULT_FILTERS = {
    titleOnly: false,
    recentOnly: false,
    caseSensitive: false
};

let activeSearchIndex = -1;
let searchRequestId = 0;

/**
 * Initialize search module and close the result surface when focus moves away.
 */
export function initSearch() {
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('global-search-dropdown');
        const searchContainer = document.getElementById('sidebar-search');
        if (dropdown && searchContainer && !searchContainer.contains(event.target)) {
            dropdown.classList.remove('visible');
            activeSearchIndex = -1;
        }
    });
}

function getFilters() {
    return { ...DEFAULT_FILTERS, ...(getState('searchFilters') || {}) };
}

/**
 * Update a persistent search option. Filters stay in place when the user
 * switches notes, so a search can be refined without starting again.
 */
export function setSearchFilter(name, enabled) {
    if (!(name in DEFAULT_FILTERS)) return;
    const next = { ...getFilters(), [name]: Boolean(enabled) };
    setState('searchFilters', next);
    setState('searchCaseSensitive', next.caseSensitive);
}

function flattenFiles(items, files = []) {
    for (const item of items || []) {
        if (item?.type === 'directory') {
            flattenFiles(item.children, files);
        } else if (item?.path && (item.type === 'file' || !item.type) && item.path.toLowerCase().endsWith('.md')) {
            files.push(item);
        }
    }
    return files;
}

function includesQuery(value, query, caseSensitive) {
    if (caseSensitive) return value.includes(query);
    return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function findTitleMatches(query, caseSensitive) {
    return flattenFiles(getState('fileTreeData')).filter(file => {
        const title = file.name || file.path.split('/').pop() || file.path;
        return includesQuery(title, query, caseSensitive);
    }).map(file => ({
        path: file.path,
        name: file.name || file.path.split('/').pop() || file.path,
        matches: [],
        mtime: file.mtime || 0,
        titleMatch: true
    }));
}

function normalizeResult(file) {
    return {
        path: file.path,
        name: file.name || file.path?.split('/').pop() || file.path,
        matches: Array.isArray(file.matches) ? file.matches : [],
        mtime: file.mtime || 0,
        titleMatch: Boolean(file.titleMatch)
    };
}

function mergeResults(contentResults, titleResults, recentOnly) {
    const merged = new Map();

    for (const result of contentResults || []) {
        if (result?.path) merged.set(result.path, normalizeResult(result));
    }

    for (const titleResult of titleResults) {
        const existing = merged.get(titleResult.path);
        if (existing) {
            existing.titleMatch = true;
        } else {
            merged.set(titleResult.path, titleResult);
        }
    }

    let results = [...merged.values()];
    const recentPaths = (getState('recentFiles') || []).map(item => item.path);
    const recentOrder = new Map(recentPaths.map((path, index) => [path, index]));

    if (recentOnly) {
        results = results.filter(result => recentOrder.has(result.path));
        results.sort((a, b) => recentOrder.get(a.path) - recentOrder.get(b.path));
    } else {
        results.sort((a, b) => {
            if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
            return b.mtime - a.mtime;
        });
    }

    return results;
}

/**
 * Perform a vault search. File-name matches are merged locally so searching
 * for a note works even when the phrase is not in its body.
 */
export async function performSearch(query, caseSensitive, requestId = null) {
    const countEl = document.getElementById('search-results-count');
    const trimmedQuery = query?.trim();

    if (!trimmedQuery) {
        if (countEl) countEl.textContent = '';
        setState('searchResults', []);
        setState('globalSearchResults', []);
        setState('searchQuery', '');
        setState('globalSearchQuery', '');
        return [];
    }

    const filters = getFilters();
    const isCaseSensitive = typeof caseSensitive === 'boolean' ? caseSensitive : filters.caseSensitive;
    setState('searchQuery', trimmedQuery);
    setState('globalSearchQuery', trimmedQuery);
    setState('searchCaseSensitive', isCaseSensitive);

    try {
        const contentResults = filters.titleOnly
            ? []
            : await backend().SearchFiles(trimmedQuery, isCaseSensitive);
        const titleResults = findTitleMatches(trimmedQuery, isCaseSensitive);
        const results = mergeResults(contentResults, titleResults, filters.recentOnly);

        // A slower request must not replace the state used by keyboard
        // navigation after the user has already typed a newer query.
        if (requestId !== null && requestId !== searchRequestId) return results;

        setState('searchResults', results);
        setState('globalSearchResults', results);

        if (countEl) {
            countEl.textContent = `${results.length} ${results.length === 1 ? 'note' : 'notes'}`;
        }
        return results;
    } catch (err) {
        if (requestId !== null && requestId !== searchRequestId) return [];
        log.error('Search failed:', err);
        if (countEl) countEl.textContent = '';
        return [];
    }
}

/**
 * Perform a sidebar search and render a compact, keyboard-navigable list.
 */
export async function performGlobalSearch(query) {
    const dropdown = document.getElementById('global-search-dropdown');
    const trimmedQuery = query?.trim();
    if (!dropdown) return;

    if (!trimmedQuery) {
        clearGlobalSearch(false);
        return;
    }

    const requestId = ++searchRequestId;
    activeSearchIndex = -1;
    dropdown.innerHTML = '<div class="search-loading">Searching…</div>';
    dropdown.classList.add('visible');

    const results = await performSearch(trimmedQuery, undefined, requestId);
    if (requestId !== searchRequestId) return;
    renderDropdownResults(dropdown, results, trimmedQuery);
}

/**
 * Clear the visible search without resetting its filters.
 */
export function clearGlobalSearch(clearInput = true) {
    searchRequestId += 1;
    activeSearchIndex = -1;
    const dropdown = document.getElementById('global-search-dropdown');
    const input = document.getElementById('global-search-input');
    const countEl = document.getElementById('search-results-count');

    if (clearInput && input) input.value = '';
    if (dropdown) {
        dropdown.classList.remove('visible');
        dropdown.innerHTML = '';
    }
    if (countEl) countEl.textContent = '';
    setState('searchResults', []);
    setState('globalSearchResults', []);
    setState('searchQuery', '');
    setState('globalSearchQuery', '');
}

function renderDropdownResults(dropdown, results, query) {
    const filters = getFilters();
    const selectedIndex = activeSearchIndex >= 0 && activeSearchIndex < results.length ? activeSearchIndex : -1;

    const filterControls = `
        <div class="search-filter-row" role="toolbar" aria-label="Search filters">
            ${filterChip('titleOnly', 'Titles', filters.titleOnly)}
            ${filterChip('recentOnly', 'Recent', filters.recentOnly)}
            ${filterChip('caseSensitive', 'Aa', filters.caseSensitive, 'Match case')}
        </div>`;

    if (!results || results.length === 0) {
        dropdown.innerHTML = `${filterControls}
            <div class="search-empty">No notes match this search</div>`;
        bindDropdownEvents(dropdown, []);
        return;
    }

    const resultRows = results.map((file, index) => {
        const firstMatch = file.matches[0];
        const excerpt = firstMatch?.text || (file.titleMatch ? 'Title match' : 'Matching note');
        const meta = firstMatch?.line ? `Line ${firstMatch.line}` : (file.titleMatch ? 'Title match' : 'Note');
        const matchLabel = file.matches.length > 1 ? `${file.matches.length} matches` : '';
        const isSelected = index === selectedIndex;

        return `
            <button type="button" class="search-result-row ${isSelected ? 'selected' : ''}"
                    data-search-index="${index}" role="option" aria-selected="${isSelected}">
                <span class="search-result-main">
                    <span class="search-result-name">${highlightMatch(file.name, query, filters.caseSensitive)}</span>
                    <span class="search-result-path">${escapeHtml(file.path)}</span>
                </span>
                <span class="search-result-excerpt">${highlightMatch(excerpt, query, filters.caseSensitive)}</span>
                <span class="search-result-meta"><span>${meta}</span>${matchLabel ? `<span>${matchLabel}</span>` : ''}</span>
            </button>`;
    }).join('');

    dropdown.innerHTML = `${filterControls}
        <div class="search-result-summary">
            <span>${results.length} ${results.length === 1 ? 'note' : 'notes'}</span>
            <span>↑↓ to navigate · Enter to open</span>
        </div>
        <div class="search-result-list" role="listbox" aria-label="Search results">${resultRows}</div>`;
    bindDropdownEvents(dropdown, results);
}

function filterChip(name, label, active, ariaLabel = label) {
    return `<button type="button" class="search-filter-chip ${active ? 'active' : ''}"
                data-search-filter="${name}" aria-pressed="${active}" title="${ariaLabel}">${label}</button>`;
}

function bindDropdownEvents(dropdown, results) {
    dropdown.onclick = (event) => {
        const filter = event.target.closest('[data-search-filter]');
        if (filter) {
            const name = filter.dataset.searchFilter;
            const filters = getFilters();
            setSearchFilter(name, !filters[name]);
            const input = document.getElementById('global-search-input');
            if (input?.value.trim()) performGlobalSearch(input.value);
            return;
        }

        const row = event.target.closest('[data-search-index]');
        if (!row) return;
        const result = results[Number(row.dataset.searchIndex)];
        if (result) openSearchResult(result);
    };
}

function openSearchResult(result) {
    const dropdown = document.getElementById('global-search-dropdown');
    if (dropdown) dropdown.classList.remove('visible');
    activeSearchIndex = -1;

    const firstMatch = result.matches?.[0];
    openTab(result.path, result.name || result.path.split('/').pop(), 'file', {
        path: result.path,
        mtime: result.mtime,
        line: firstMatch?.line
    });
}

/**
 * Handle key events from the search field. Returns true when the event was
 * consumed, allowing app.js to retain its other global shortcuts.
 */
export function handleSearchKeydown(event) {
    const input = document.getElementById('global-search-input');
    const dropdown = document.getElementById('global-search-dropdown');
    const query = input?.value.trim();

    if (event.key === 'Escape') {
        clearGlobalSearch();
        input?.blur();
        event.preventDefault();
        return true;
    }

    if (!query || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return false;

    if (!dropdown?.classList.contains('visible')) {
        if (event.key !== 'Enter') {
            performGlobalSearch(query);
            event.preventDefault();
            return true;
        }
        return false;
    }

    const results = getState('searchResults') || [];
    if (results.length === 0) return false;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        activeSearchIndex = activeSearchIndex < 0
            ? (direction > 0 ? 0 : results.length - 1)
            : (activeSearchIndex + direction + results.length) % results.length;
        renderDropdownResults(dropdown, results, query);
        dropdown.querySelector(`[data-search-index="${activeSearchIndex}"]`)?.scrollIntoView?.({ block: 'nearest' });
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

function highlightMatch(text, query, caseSensitive) {
    const escaped = escapeHtml(String(text || ''));
    const regex = new RegExp(`(${escapeRegExp(query)})`, caseSensitive ? 'g' : 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

export default {
    initSearch,
    performSearch,
    performGlobalSearch,
    clearGlobalSearch,
    handleSearchKeydown,
    setSearchFilter
};
