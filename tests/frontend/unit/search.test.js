/**
 * Search surface behaviour: title matching, filters, and keyboard opening.
 */

import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/tabManager.js', () => ({
    openTab: jest.fn()
}));

import { openTab } from '../frontend/js/tabManager.js';
import { state, setState } from '../frontend/js/state.js';
import {
    performGlobalSearch,
    handleSearchKeydown,
    initSearch,
    setSearchFilter,
} from '../frontend/js/search.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

function rankedResponse(results, suggestion = '') {
    return { results, suggestion };
}

async function settleSearchRender() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

const GLOBAL_SEARCH_REQUEST = {
    case_sensitive: false,
    title_only: false,
    profile: 'global',
    limit: 0,
    suggest: true,
};

describe('workspace search', () => {
    let disposeSearch = null;

    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();

        setState('fileTreeData', [
            { name: 'Project Alpha.md', path: 'Projects/Project Alpha.md', type: 'file', mtime: 20 },
            { name: 'Journal.md', path: 'Journal.md', type: 'file', mtime: 10 }
        ]);
        setState('recentFiles', [{ path: 'Projects/Project Alpha.md', title: 'Project Alpha.md' }]);
        setState('searchFilters', { titleOnly: false, recentOnly: false, caseSensitive: false });
        setState('searchResults', []);
        window.go.desktop.App.SearchNotes.mockResolvedValue(rankedResponse([
            {
                name: 'Project Alpha.md',
                path: 'Projects/Project Alpha.md',
                mtime: 20,
                title_match: true,
                score: 12,
                matches: [],
            },
            {
                name: 'Journal.md',
                path: 'Journal.md',
                mtime: 10,
                score: 3,
                matches: [{ line: 7, text: 'Project plans are ready.' }]
            }
        ]));
    });

    afterEach(() => {
        disposeSearch?.();
        disposeSearch = null;
    });

    test('preserves native relevance order with title and content excerpts', async () => {
        await performGlobalSearch('project');

        const rows = document.querySelectorAll('.search-result-row');
        expect(window.go.desktop.App.SearchNotes).toHaveBeenCalledWith('project', GLOBAL_SEARCH_REQUEST);
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('Project Alpha.md');
        expect(rows[0].textContent).toContain('Title match');
        expect(rows[1].textContent).toContain('Line 7');
        expect(document.getElementById('search-results-count').textContent).toBe('2 notes');
    });

    test('shows an exact compact backend match count without requiring every matching line', async () => {
        setState('fileTreeData', []);
        window.go.desktop.App.SearchNotes.mockResolvedValue(rankedResponse([{
            name: 'Large.md',
            path: 'Large.md',
            mtime: 10,
            match_count: 73,
            matches: [{ line: 4, text: 'Project plans are ready.' }],
        }]));

        await performGlobalSearch('project');

        const row = document.querySelector('.search-result-row');
        expect(row.textContent).toContain('Line 4');
        expect(row.textContent).toContain('73 matches');
        expect(state.searchResults[0].matches).toHaveLength(1);
        expect(state.searchResults[0].matchCount).toBe(73);
    });

    test('passes the title-only profile to the native ranking engine', async () => {
        setSearchFilter('titleOnly', true);
        window.go.desktop.App.SearchNotes.mockResolvedValueOnce(rankedResponse([{
            name: 'Project Alpha.md',
            path: 'Projects/Project Alpha.md',
            title_match: true,
            matches: [],
        }]));

        await performGlobalSearch('project');

        expect(window.go.desktop.App.SearchNotes).toHaveBeenCalledWith('project', {
            ...GLOBAL_SEARCH_REQUEST,
            title_only: true,
        });
        expect(document.querySelectorAll('.search-result-row')).toHaveLength(1);
        expect(state.searchResults[0].path).toBe('Projects/Project Alpha.md');
    });

    test('opens the selected result from the keyboard at its matching line', async () => {
        const input = document.getElementById('global-search-input');
        input.value = 'project';
        input.focus();
        await performGlobalSearch(input.value);

        handleSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        handleSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        const selected = document.querySelector('.search-result-row.selected');
        expect(selected).not.toBeNull();
        expect(input.getAttribute('aria-expanded')).toBe('true');
        expect(input.getAttribute('aria-activedescendant')).toBe(selected.id);
        expect(selected.getAttribute('aria-selected')).toBe('true');
        expect(document.activeElement).toBe(input);

        handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
        expect(openTab).toHaveBeenCalledWith('Journal.md', 'Journal.md', 'file', {
            path: 'Journal.md',
            mtime: 10,
            line: 7
        });
    });

    test('bounds mounted rows while keeping distant keyboard results reachable and described', async () => {
        setState('fileTreeData', []);
        window.go.desktop.App.SearchNotes.mockResolvedValue(rankedResponse(Array.from({ length: 300 }, (_, index) => ({
            name: `Result ${String(index).padStart(3, '0')}.md`,
            path: `Archive/Result ${String(index).padStart(3, '0')}.md`,
            matches: [{ line: index + 1, text: 'project result' }],
        }))));
        const input = document.getElementById('global-search-input');
        input.value = 'project';
        input.focus();
        await performGlobalSearch(input.value);

        expect(state.searchResults).toHaveLength(300);
        expect(document.querySelectorAll('.search-result-row')).toHaveLength(96);
        for (let index = 0; index < 151; index += 1) {
            handleSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        }

        const selected = document.querySelector('.search-result-row.selected');
        expect(selected.dataset.searchIndex).toBe('150');
        expect(selected.getAttribute('aria-posinset')).toBe('151');
        expect(selected.getAttribute('aria-setsize')).toBe('300');
        expect(input.getAttribute('aria-activedescendant')).toBe(selected.id);
        expect(document.querySelectorAll('.search-result-row')).toHaveLength(96);
        expect(document.activeElement).toBe(input);
    });

    test('keeps combobox focus when Escape closes search results', async () => {
        const input = document.getElementById('global-search-input');
        input.value = 'project';
        input.focus();
        await performGlobalSearch(input.value);
        handleSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));

        handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

        expect(input.getAttribute('aria-expanded')).toBe('false');
        expect(input.hasAttribute('aria-activedescendant')).toBe(false);
        expect(document.activeElement).toBe(input);
    });

    test('shows the parent folder separately so repeated filenames remain distinguishable', async () => {
        setState('fileTreeData', []);
        window.go.desktop.App.SearchNotes.mockResolvedValue(rankedResponse([
            { name: 'Meeting.md', path: 'Clients/Acme/Meeting.md', matches: [{ line: 2, text: 'project review' }] },
            { name: 'Meeting.md', path: 'Clients/Beacon/Meeting.md', matches: [{ line: 4, text: 'project review' }] },
        ]));

        await performGlobalSearch('project');

        const rows = [...document.querySelectorAll('.search-result-row')];
        expect(rows.map(row => row.querySelector('.search-result-path').textContent.trim()))
            .toEqual(['Clients/Acme', 'Clients/Beacon']);
        expect(rows.map(row => row.title)).toEqual([
            'Clients/Acme/Meeting.md',
            'Clients/Beacon/Meeting.md',
        ]);
    });

    test('keeps the distinguishing tail visible for repeated filenames under deep common paths', async () => {
        setState('fileTreeData', []);
        window.go.desktop.App.SearchNotes.mockResolvedValue(rankedResponse([
            {
                name: 'Meeting.md',
                path: 'Clients/International/Western-Europe/Enterprise/Acme/2026/Planning/Meeting.md',
                matches: [{ line: 2, text: 'project review' }],
            },
            {
                name: 'Meeting.md',
                path: 'Clients/International/Western-Europe/Enterprise/Beacon/2026/Planning/Meeting.md',
                matches: [{ line: 4, text: 'project review' }],
            },
        ]));

        await performGlobalSearch('project');

        const rows = [...document.querySelectorAll('.search-result-row')];
        expect(rows.map(row => row.querySelector('.search-result-path').textContent.trim()))
            .toEqual(['Clients/…/Acme/2026/Planning', 'Clients/…/Beacon/2026/Planning']);
        expect(rows[0].getAttribute('aria-label')).toContain(
            'Clients/International/Western-Europe/Enterprise/Acme/2026/Planning/Meeting.md'
        );
        expect(rows[1].getAttribute('aria-label')).toContain(
            'Clients/International/Western-Europe/Enterprise/Beacon/2026/Planning/Meeting.md'
        );
    });

    test('keeps the newest query when an earlier backend response arrives late', async () => {
        const slow = deferred();
        const fast = deferred();
        setState('fileTreeData', []);
        setState('recentFiles', []);
        window.go.desktop.App.SearchNotes
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);

        const firstSearch = performGlobalSearch('first');
        const secondSearch = performGlobalSearch('second');

        fast.resolve(rankedResponse([{
            name: 'Second.md',
            path: 'Second.md',
            mtime: 2,
            matches: [{ line: 1, text: 'second result' }]
        }]));
        await secondSearch;

        slow.resolve(rankedResponse([{
            name: 'First.md',
            path: 'First.md',
            mtime: 1,
            matches: [{ line: 1, text: 'first result' }]
        }]));
        await firstSearch;

        expect(state.searchQuery).toBe('second');
        expect(state.searchResults).toEqual([expect.objectContaining({ path: 'Second.md' })]);
        expect(document.getElementById('global-search-dropdown').textContent).toContain('Second.md');
        expect(document.getElementById('global-search-dropdown').textContent).not.toContain('First.md');
    });

    test('reruns every filter in the existing open result list as its size changes', async () => {
        const input = document.getElementById('global-search-input');
        const dropdown = document.getElementById('global-search-dropdown');
        input.value = 'project';
        input.focus();
        await performGlobalSearch(input.value);
        disposeSearch = initSearch();

        const list = document.getElementById('search-result-list');
        const titleFilter = dropdown.querySelector('[data-search-filter="titleOnly"]');
        const titleRefresh = deferred();
        window.go.desktop.App.SearchNotes.mockImplementationOnce(() => titleRefresh.promise);
        titleFilter.focus();
        titleFilter.click();

        expect(dropdown.classList.contains('visible')).toBe(true);
        expect(input.getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById('search-result-list')).toBe(list);
        expect(list.querySelectorAll('.search-result-row')).toHaveLength(2);

        titleRefresh.resolve(rankedResponse([{
            name: 'Project Alpha.md',
            path: 'Projects/Project Alpha.md',
            title_match: true,
            matches: [],
        }]));
        await settleSearchRender();

        expect(document.getElementById('search-result-list')).toBe(list);
        expect(list.querySelectorAll('.search-result-row')).toHaveLength(1);
        expect(titleFilter.getAttribute('aria-pressed')).toBe('true');
        expect(document.activeElement).toBe(titleFilter);

        titleFilter.click();
        await settleSearchRender();
        expect(list.querySelectorAll('.search-result-row')).toHaveLength(2);
        expect(titleFilter.getAttribute('aria-pressed')).toBe('false');

        const recentFilter = dropdown.querySelector('[data-search-filter="recentOnly"]');
        recentFilter.click();
        await settleSearchRender();
        expect(recentFilter.getAttribute('aria-pressed')).toBe('true');
        expect(list.querySelectorAll('.search-result-row')).toHaveLength(1);

        const caseFilter = dropdown.querySelector('[data-search-filter="caseSensitive"]');
        caseFilter.click();
        await settleSearchRender();
        expect(caseFilter.getAttribute('aria-pressed')).toBe('true');
        expect(window.go.desktop.App.SearchNotes).toHaveBeenLastCalledWith('project', {
            ...GLOBAL_SEARCH_REQUEST,
            case_sensitive: true,
        });
        expect(dropdown.classList.contains('visible')).toBe(true);
        expect(input.getAttribute('aria-expanded')).toBe('true');

        document.body.click();
        expect(dropdown.classList.contains('visible')).toBe(false);
        expect(input.getAttribute('aria-expanded')).toBe('false');
    });

    test('offers and applies a low-result spelling suggestion without moving focus', async () => {
        window.go.desktop.App.SearchNotes
            .mockResolvedValueOnce(rankedResponse([], 'deployment'))
            .mockResolvedValueOnce(rankedResponse([{
                name: 'Deployment.md',
                path: 'Deployment.md',
                title_match: true,
                matched_terms: ['deployment'],
                matches: [],
            }]));
        const input = document.getElementById('global-search-input');
        input.value = 'deploymnet';
        input.focus();

        await performGlobalSearch(input.value);
        const suggestion = document.querySelector('.search-suggestion');
        expect(suggestion.textContent).toContain('Did you mean “deployment”?');
        expect(suggestion.getAttribute('aria-label')).toBe('Search for deployment');

        suggestion.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(input.value).toBe('deployment');
        expect(document.activeElement).toBe(input);
        expect(window.go.desktop.App.SearchNotes).toHaveBeenLastCalledWith(
            'deployment', GLOBAL_SEARCH_REQUEST
        );
    });
});
