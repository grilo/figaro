import {
    compactSearchResultLocation,
    searchHighlightRanges,
    searchResultWindow,
} from '../core/searchModel.js';

const SEARCH_VIRTUAL_THRESHOLD = 120;
const SEARCH_WINDOW_SIZE = 96;
const SEARCH_ROW_STRIDE_ESTIMATE = 66;

let searchRenderState = null;

function escapeHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function highlightMatch(text, query, caseSensitive, matchedTerms = []) {
    const source = String(text || '');
    const ranges = searchHighlightRanges(source, query, matchedTerms, caseSensitive);
    if (!ranges.length) return escapeHtml(source);

    const pieces = [];
    let offset = 0;
    for (const range of ranges) {
        pieces.push(escapeHtml(source.slice(offset, range.from)));
        pieces.push(`<mark>${escapeHtml(source.slice(range.from, range.to))}</mark>`);
        offset = range.to;
    }
    pieces.push(escapeHtml(source.slice(offset)));
    return pieces.join('');
}

function filterChip(name, label, active, ariaLabel = label) {
    return `<button type="button" class="ui-button search-filter-chip ${active ? 'active' : ''}"
                data-search-filter="${name}" aria-pressed="${active}" title="${ariaLabel}">${label}</button>`;
}

function filterControls(filters) {
    return `
        <div class="search-filter-row" role="toolbar" aria-label="Search filters">
            ${filterChip('titleOnly', 'Titles', filters.titleOnly)}
            ${filterChip('recentOnly', 'Recent', filters.recentOnly)}
            ${filterChip('caseSensitive', 'Aa', filters.caseSensitive, 'Match case')}
        </div>`;
}

function ensureResultShell(dropdown, filters) {
    let shell = dropdown.querySelector('.search-result-content');
    if (!shell) {
        dropdown.innerHTML = `${filterControls(filters)}
            <div class="search-result-content">
                <div class="search-suggestion-slot"></div>
                <div class="search-result-summary" hidden>
                    <span data-search-result-count></span>
                    <span>↑↓ to navigate · Enter to open</span>
                </div>
                <div class="search-empty" hidden>No notes match this search</div>
                <div id="search-result-list" class="search-result-list" role="listbox"
                     aria-label="Search results" hidden></div>
            </div>`;
        shell = dropdown.querySelector('.search-result-content');
    }

    for (const [name, active] of Object.entries(filters)) {
        const button = dropdown.querySelector(`[data-search-filter="${name}"]`);
        if (!button) continue;
        button.classList.toggle('active', Boolean(active));
        button.setAttribute('aria-pressed', String(Boolean(active)));
    }
    return shell;
}

function elements() {
    return {
        container: document.getElementById('sidebar-search'),
        count: document.getElementById('search-results-count'),
        dropdown: document.getElementById('global-search-dropdown'),
        input: document.getElementById('global-search-input'),
    };
}

function setComboboxState({ expanded, activeOptionId = '' }) {
    const { input } = elements();
    if (!input) return;
    input.setAttribute('aria-expanded', String(Boolean(expanded)));
    if (activeOptionId) input.setAttribute('aria-activedescendant', activeOptionId);
    else input.removeAttribute('aria-activedescendant');
}

export function showSearchLoading() {
    const { dropdown } = elements();
    if (!dropdown) return false;
    searchRenderState = null;
    dropdown.onscroll = null;
    dropdown.innerHTML = `
        <div class="search-loading" role="status">Searching…</div>
        <div id="search-result-list" role="listbox" aria-label="Search results" hidden></div>`;
    dropdown.classList.add('visible');
    setComboboxState({ expanded: true });
    return true;
}

function resultRow(file, index, state) {
    const firstMatch = file.matches[0];
    const excerpt = firstMatch?.text || (file.titleMatch ? 'Title match' : 'Matching note');
    const meta = firstMatch?.line ? `Line ${firstMatch.line}` : (file.titleMatch ? 'Title match' : 'Note');
    const matchCount = Number.isFinite(Number(file.matchCount))
        ? Number(file.matchCount)
        : file.matches.length;
    const matchLabel = matchCount > 1 ? `${matchCount} matches` : '';
    const selected = index === state.selectedIndex;
    const normalizedPath = String(file.path || '').replaceAll('\\', '/');
    const parentPath = compactSearchResultLocation(normalizedPath);
    const accessibleLabel = `${file.name} — ${normalizedPath}. ${meta}${matchLabel ? `. ${matchLabel}` : ''}`;
    return `
        <button type="button" id="search-result-option-${index}"
                class="search-result-row ${selected ? 'selected' : ''}"
                data-search-index="${index}" role="option" tabindex="-1"
                aria-selected="${selected}" aria-label="${escapeHtml(accessibleLabel)}"
                aria-posinset="${index + 1}" aria-setsize="${state.results.length}"
                title="${escapeHtml(normalizedPath)}">
            <span class="search-result-main">
                <span class="search-result-name">${highlightMatch(file.name, state.query, state.filters.caseSensitive, file.matchedTerms)}</span>
            </span>
            <span class="search-result-path" title="${escapeHtml(normalizedPath)}">${escapeHtml(parentPath)}</span>
            <span class="search-result-excerpt">${highlightMatch(excerpt, state.query, state.filters.caseSensitive, file.matchedTerms)}</span>
            <span class="search-result-meta"><span>${meta}</span>${matchLabel ? `<span>${matchLabel}</span>` : ''}</span>
        </button>`;
}

function renderResultWindow({ anchorIndex = 0, selectedIndex = -1 } = {}) {
    const state = searchRenderState;
    const list = document.getElementById('search-result-list');
    if (!state || !list) return;

    state.selectedIndex = selectedIndex;
    const range = state.virtual
        ? searchResultWindow(state.results.length, {
            anchorIndex,
            selectedIndex,
            windowSize: SEARCH_WINDOW_SIZE,
        })
        : { start: 0, end: state.results.length };
    state.range = range;

    const rows = [];
    if (state.virtual && range.start > 0) {
        rows.push(`<div class="search-result-spacer" aria-hidden="true"
            style="height:${range.start * state.rowStride}px"></div>`);
    }
    for (let index = range.start; index < range.end; index += 1) {
        rows.push(resultRow(state.results[index], index, state));
    }
    if (state.virtual && range.end < state.results.length) {
        rows.push(`<div class="search-result-spacer" aria-hidden="true"
            style="height:${(state.results.length - range.end) * state.rowStride}px"></div>`);
    }
    list.innerHTML = rows.join('');

    const measuredRow = list.querySelector('.search-result-row')?.getBoundingClientRect?.().height;
    if (measuredRow > 0) state.rowStride = measuredRow + 2;
}

function installVirtualScroll(dropdown) {
    let frame = 0;
    dropdown.onscroll = () => {
        const state = searchRenderState;
        const list = document.getElementById('search-result-list');
        if (!state?.virtual || !list || frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!searchRenderState?.virtual) return;
            const relativeTop = Math.max(0, dropdown.scrollTop - list.offsetTop);
            const anchorIndex = Math.floor(relativeTop / searchRenderState.rowStride);
            const nextRange = searchResultWindow(searchRenderState.results.length, {
                anchorIndex,
                windowSize: SEARCH_WINDOW_SIZE,
            });
            if (
                nextRange.start !== searchRenderState.range.start
                || nextRange.end !== searchRenderState.range.end
            ) {
                renderResultWindow({ anchorIndex, selectedIndex: searchRenderState.selectedIndex });
            }
        });
    };
}

export function renderSearchResults({
    results,
    query,
    filters,
    selectedIndex,
    suggestion = '',
    onFilter,
    onOpen,
    onSuggest = () => {},
}) {
    const { dropdown, count } = elements();
    if (!dropdown) return;

    if (count) {
        count.textContent = `${results.length} ${results.length === 1 ? 'note' : 'notes'}`;
    }
    const safeSelection = selectedIndex >= 0 && selectedIndex < results.length
        ? selectedIndex
        : -1;
    const activeOptionId = safeSelection >= 0 ? `search-result-option-${safeSelection}` : '';
    const suggestionControl = suggestion
        ? `<button type="button" class="ui-button search-suggestion"
                data-search-suggestion="${escapeHtml(suggestion)}"
                aria-label="Search for ${escapeHtml(suggestion)}">
                Did you mean “<strong>${escapeHtml(suggestion)}</strong>”?
            </button>`
        : '';

    const shell = ensureResultShell(dropdown, filters);
    const suggestionSlot = shell.querySelector('.search-suggestion-slot');
    const summary = shell.querySelector('.search-result-summary');
    const empty = shell.querySelector('.search-empty');
    const list = shell.querySelector('#search-result-list');
    suggestionSlot.innerHTML = suggestionControl;

    if (!results.length) {
        searchRenderState = null;
        dropdown.onscroll = null;
        summary.hidden = true;
        empty.hidden = false;
        list.hidden = true;
        list.innerHTML = '';
        delete list.dataset.logicalCount;
    } else {
        summary.querySelector('[data-search-result-count]').textContent =
            `${results.length} ${results.length === 1 ? 'note' : 'notes'}`;
        summary.hidden = false;
        empty.hidden = true;
        list.hidden = false;
        list.dataset.logicalCount = String(results.length);
        dropdown.scrollTop = 0;
        searchRenderState = {
            filters,
            query,
            range: { start: 0, end: 0 },
            results,
            rowStride: SEARCH_ROW_STRIDE_ESTIMATE,
            selectedIndex: safeSelection,
            virtual: results.length > SEARCH_VIRTUAL_THRESHOLD,
        };
        renderResultWindow({ selectedIndex: safeSelection });
        installVirtualScroll(dropdown);
    }

    setComboboxState({ expanded: true, activeOptionId });

    dropdown.onclick = event => {
        const suggested = event.target.closest('[data-search-suggestion]');
        if (suggested) {
            onSuggest(suggested.dataset.searchSuggestion);
            return;
        }
        const filter = event.target.closest('[data-search-filter]');
        if (filter) {
            onFilter(filter.dataset.searchFilter);
            return;
        }
        const row = event.target.closest('[data-search-index]');
        if (row) onOpen(Number(row.dataset.searchIndex));
    };
}

export function clearSearchView(clearInput = true) {
    const { count, dropdown, input } = elements();
    if (clearInput && input) input.value = '';
    if (dropdown) {
        dropdown.onscroll = null;
        dropdown.classList.remove('visible');
        dropdown.innerHTML = '';
    }
    searchRenderState = null;
    setComboboxState({ expanded: false });
    if (count) count.textContent = '';
}

export function clearSearchCount() {
    const { count } = elements();
    if (count) count.textContent = '';
}

export function closeSearchView() {
    const { dropdown } = elements();
    dropdown?.classList.remove('visible');
    setComboboxState({ expanded: false });
}

export function closeSearchWhenOutside(target, originalPath = []) {
    const { container, dropdown } = elements();
    const startedInside = container && (
        container.contains(target) || originalPath.includes(container)
    );
    if (container && dropdown && !startedInside) {
        dropdown.classList.remove('visible');
        setComboboxState({ expanded: false });
        return true;
    }
    return false;
}

export function currentSearchQuery() {
    return elements().input?.value.trim() || '';
}

export function isSearchVisible() {
    return Boolean(elements().dropdown?.classList.contains('visible'));
}

export function selectSearchResult(index) {
    const state = searchRenderState;
    if (!state || index < 0 || index >= state.results.length) return false;

    const { dropdown } = elements();
    const existing = dropdown?.querySelector(`[data-search-index="${index}"]`);
    const previous = dropdown?.querySelector('.search-result-row.selected');
    state.selectedIndex = index;
    if (existing) {
        previous?.classList.remove('selected');
        previous?.setAttribute('aria-selected', 'false');
        existing.classList.add('selected');
        existing.setAttribute('aria-selected', 'true');
    } else {
        renderResultWindow({ selectedIndex: index });
    }

    const selected = dropdown?.querySelector(`[data-search-index="${index}"]`);
    setComboboxState({ expanded: true, activeOptionId: `search-result-option-${index}` });
    selected?.scrollIntoView?.({ block: 'nearest' });
    return Boolean(selected);
}
