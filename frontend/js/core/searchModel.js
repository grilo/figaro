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

export function normalizeSearchResult(file) {
    const matches = Array.isArray(file?.matches) ? file.matches : [];
    const suppliedMatchCount = Number(file?.match_count ?? file?.matchCount);
    return {
        path: file?.path,
        name: file?.name || file?.path?.split('/').pop() || file?.path,
        matches,
        matchCount: Number.isFinite(suppliedMatchCount) ? suppliedMatchCount : matches.length,
        mtime: file?.mtime || 0,
        score: Number(file?.score) || 0,
        titleMatch: Boolean(file?.title_match ?? file?.titleMatch),
        matchedTerms: Array.isArray(file?.matched_terms)
            ? file.matched_terms.map(String)
            : Array.isArray(file?.matchedTerms)
                ? file.matchedTerms.map(String)
                : [],
    };
}

function foldedTextMap(value, caseSensitive) {
    const source = String(value || '');
    let folded = '';
    const positions = [];
    for (let index = 0; index < source.length;) {
        const codePoint = source.codePointAt(index);
        const character = String.fromCodePoint(codePoint);
        const end = index + character.length;
        let normalized = character.normalize('NFKD').replace(/\p{M}/gu, '');
        if (!caseSensitive) normalized = normalized.toLocaleLowerCase();
        folded += normalized;
        for (let offset = 0; offset < normalized.length; offset += 1) {
            positions.push({ from: index, to: end });
        }
        index = end;
    }
    return { folded, positions };
}

/**
 * Return source offsets for every visible query/matched term. Keeping offsets
 * separate from HTML escaping makes accent-insensitive highlighting safe.
 */
export function searchHighlightRanges(text, query, matchedTerms = [], caseSensitive = false) {
    const source = String(text || '');
    const rawTerms = String(query || '').match(/[\p{L}\p{N}_]+/gu) || [];
    const terms = [...rawTerms, ...(!caseSensitive ? (matchedTerms || []) : [])]
        .map(term => {
            let normalized = String(term).normalize('NFKD').replace(/\p{M}/gu, '');
            if (!caseSensitive) normalized = normalized.toLocaleLowerCase();
            return normalized;
        })
        .filter(Boolean);
    const uniqueTerms = [...new Set(terms)];
    if (!source || !uniqueTerms.length) return [];

    const { folded, positions } = foldedTextMap(source, caseSensitive);
    const ranges = [];
    for (const term of uniqueTerms) {
        let offset = 0;
        while (offset <= folded.length - term.length) {
            const found = folded.indexOf(term, offset);
            if (found < 0) break;
            const first = positions[found];
            const last = positions[found + term.length - 1];
            if (first && last) ranges.push({ from: first.from, to: last.to });
            offset = found + Math.max(1, term.length);
        }
    }
    ranges.sort((left, right) => left.from - right.from || right.to - left.to);
    const merged = [];
    for (const range of ranges) {
        const previous = merged[merged.length - 1];
        if (previous && range.from <= previous.to) {
            previous.to = Math.max(previous.to, range.to);
        } else {
            merged.push({ ...range });
        }
    }
    return merged;
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
