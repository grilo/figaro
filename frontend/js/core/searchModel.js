export const DEFAULT_SEARCH_FILTERS = Object.freeze({
    titleOnly: false,
    recentOnly: false,
    caseSensitive: false,
});

export function normalizeSearchFilters(filters) {
    return {
        ...DEFAULT_SEARCH_FILTERS,
        ...(filters && typeof filters === 'object' ? filters : {}),
    };
}

export function updateSearchFilter(filters, name, enabled) {
    if (!(name in DEFAULT_SEARCH_FILTERS)) return normalizeSearchFilters(filters);
    return {
        ...normalizeSearchFilters(filters),
        [name]: Boolean(enabled),
    };
}

export function flattenMarkdownFiles(items, files = []) {
    for (const item of items || []) {
        if (item?.type === 'directory') {
            flattenMarkdownFiles(item.children, files);
        } else if (
            item?.path
            && (item.type === 'file' || !item.type)
            && item.path.toLocaleLowerCase().endsWith('.md')
        ) {
            files.push(item);
        }
    }
    return files;
}

function includesQuery(value, query, caseSensitive) {
    if (caseSensitive) return value.includes(query);
    return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

export function findTitleMatches(items, query, caseSensitive) {
    return flattenMarkdownFiles(items).filter(file => {
        const title = file.name || file.path.split('/').pop() || file.path;
        return includesQuery(title, query, caseSensitive);
    }).map(file => ({
        path: file.path,
        name: file.name || file.path.split('/').pop() || file.path,
        matches: [],
        matchCount: 0,
        mtime: file.mtime || 0,
        titleMatch: true,
    }));
}

export function normalizeSearchResult(file) {
    const matches = Array.isArray(file?.matches) ? file.matches : [];
    const suppliedMatchCount = Number(file?.match_count ?? file?.matchCount);
    return {
        path: file?.path,
        name: file?.name || file?.path?.split('/').pop() || file?.path,
        matches,
        matchCount: Number.isFinite(suppliedMatchCount) ? suppliedMatchCount : matches.length,
        mtime: file?.mtime || 0,
        titleMatch: Boolean(file?.titleMatch),
    };
}

export function mergeSearchResults(contentResults, titleResults, recentFiles, recentOnly) {
    const merged = new Map();
    for (const result of contentResults || []) {
        if (result?.path) merged.set(result.path, normalizeSearchResult(result));
    }
    for (const titleResult of titleResults || []) {
        const existing = merged.get(titleResult.path);
        if (existing) {
            existing.titleMatch = true;
        } else {
            merged.set(titleResult.path, normalizeSearchResult(titleResult));
        }
    }

    let results = [...merged.values()];
    const recentPaths = (recentFiles || []).map(item => item.path);
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

export function nextSearchSelection(currentIndex, resultCount, direction) {
    if (resultCount <= 0) return -1;
    if (currentIndex < 0) return direction > 0 ? 0 : resultCount - 1;
    return (currentIndex + direction + resultCount) % resultCount;
}

/**
 * Select a bounded, contiguous slice of a logical search result set.
 * Keeping this decision independent from DOM measurements lets the view use
 * the same rule for scrolling and keyboard selection without losing access to
 * any result.
 */
export function searchResultWindow(
    resultCount,
    { anchorIndex = 0, selectedIndex = -1, windowSize = 96 } = {},
) {
    const count = Math.max(0, Number(resultCount) || 0);
    if (!count) return { start: 0, end: 0 };

    const size = Math.min(count, Math.max(1, Number(windowSize) || 1));
    const requestedAnchor = selectedIndex >= 0 ? selectedIndex : anchorIndex;
    const anchor = Math.min(count - 1, Math.max(0, Number(requestedAnchor) || 0));
    const start = Math.min(count - size, Math.max(0, anchor - Math.floor(size / 2)));
    return { start, end: start + size };
}

export function searchResultLocation(path) {
    const normalized = String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    const separator = normalized.lastIndexOf('/');
    return separator >= 0 ? normalized.slice(0, separator) : 'Vault root';
}

/**
 * Keep the stable vault root and the most specific parent folders visible.
 * Search rows are intentionally narrow, so showing every leading folder can
 * hide the only segment that distinguishes otherwise identical filenames.
 */
export function compactSearchResultLocation(path, trailingSegments = 3) {
    const location = searchResultLocation(path);
    if (location === 'Vault root') return location;

    const segments = location.split('/').filter(Boolean);
    const tailCount = Math.max(1, Number(trailingSegments) || 1);
    if (segments.length <= tailCount + 1) return location;
    return `${segments[0]}/…/${segments.slice(-tailCount).join('/')}`;
}
