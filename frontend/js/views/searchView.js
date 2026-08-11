import { compactSearchResultLocation } from '../core/searchModel.js';

function escapeHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text, query, caseSensitive) {
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegExp(query)})`, caseSensitive ? 'g' : 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
}

function filterChip(name, label, active, ariaLabel = label) {
    return `<button type="button" class="ui-button search-filter-chip ${active ? 'active' : ''}"
                data-search-filter="${name}" aria-pressed="${active}" title="${ariaLabel}">${label}</button>`;
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
    dropdown.innerHTML = `
        <div class="search-loading" role="status">Searching…</div>
        <div id="search-result-list" role="listbox" aria-label="Search results" hidden></div>`;
    dropdown.classList.add('visible');
    setComboboxState({ expanded: true });
    return true;
}

export function renderSearchResults({
    results,
    query,
    filters,
    selectedIndex,
    onFilter,
    onOpen,
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
    const filterControls = `
        <div class="search-filter-row" role="toolbar" aria-label="Search filters">
            ${filterChip('titleOnly', 'Titles', filters.titleOnly)}
            ${filterChip('recentOnly', 'Recent', filters.recentOnly)}
            ${filterChip('caseSensitive', 'Aa', filters.caseSensitive, 'Match case')}
        </div>`;

    if (!results.length) {
        dropdown.innerHTML = `${filterControls}
            <div class="search-empty">No notes match this search</div>
            <div id="search-result-list" role="listbox" aria-label="Search results" hidden></div>`;
    } else {
        const resultRows = results.map((file, index) => {
            const firstMatch = file.matches[0];
            const excerpt = firstMatch?.text || (file.titleMatch ? 'Title match' : 'Matching note');
            const meta = firstMatch?.line ? `Line ${firstMatch.line}` : (file.titleMatch ? 'Title match' : 'Note');
            const matchCount = Number.isFinite(Number(file.matchCount))
                ? Number(file.matchCount)
                : file.matches.length;
            const matchLabel = matchCount > 1 ? `${matchCount} matches` : '';
            const selected = index === safeSelection;
            const normalizedPath = String(file.path || '').replaceAll('\\', '/');
            const parentPath = compactSearchResultLocation(normalizedPath);
            const accessibleLabel = `${file.name} — ${normalizedPath}. ${meta}${matchLabel ? `. ${matchLabel}` : ''}`;
            return `
                <button type="button" id="search-result-option-${index}"
                        class="search-result-row ${selected ? 'selected' : ''}"
                        data-search-index="${index}" role="option" tabindex="-1"
                        aria-selected="${selected}" aria-label="${escapeHtml(accessibleLabel)}"
                        title="${escapeHtml(normalizedPath)}">
                    <span class="search-result-main">
                        <span class="search-result-name">${highlightMatch(file.name, query, filters.caseSensitive)}</span>
                    </span>
                    <span class="search-result-path" title="${escapeHtml(normalizedPath)}">${escapeHtml(parentPath)}</span>
                    <span class="search-result-excerpt">${highlightMatch(excerpt, query, filters.caseSensitive)}</span>
                    <span class="search-result-meta"><span>${meta}</span>${matchLabel ? `<span>${matchLabel}</span>` : ''}</span>
                </button>`;
        }).join('');
        dropdown.innerHTML = `${filterControls}
            <div class="search-result-summary">
                <span>${results.length} ${results.length === 1 ? 'note' : 'notes'}</span>
                <span>↑↓ to navigate · Enter to open</span>
            </div>
            <div id="search-result-list" class="search-result-list" role="listbox" aria-label="Search results">${resultRows}</div>`;
    }

    setComboboxState({ expanded: true, activeOptionId });

    dropdown.onclick = event => {
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
        dropdown.classList.remove('visible');
        dropdown.innerHTML = '';
    }
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

export function closeSearchWhenOutside(target) {
    const { container, dropdown } = elements();
    if (container && dropdown && !container.contains(target)) {
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

export function scrollSearchSelection(index) {
    elements().dropdown
        ?.querySelector(`[data-search-index="${index}"]`)
        ?.scrollIntoView?.({ block: 'nearest' });
}
