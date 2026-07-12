/**
 * Search surface behaviour: title matching, filters, and keyboard opening.
 */

import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/app.js', () => ({
    openTab: jest.fn()
}));

import { openTab } from '../frontend/js/app.js';
import { state, setState } from '../frontend/js/state.js';
import { performGlobalSearch, handleSearchKeydown, setSearchFilter } from '../frontend/js/search.js';

function deferred() {
    let resolve;
    const promise = new Promise((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

describe('workspace search', () => {
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
        window.pywebview.api.search_files.mockResolvedValue([
            {
                name: 'Journal.md',
                path: 'Journal.md',
                mtime: 10,
                matches: [{ line: 7, text: 'Project plans are ready.' }]
            }
        ]);
    });

    test('merges filename matches with content excerpts and shows a count', async () => {
        await performGlobalSearch('project');

        const rows = document.querySelectorAll('.search-result-row');
        expect(window.pywebview.api.search_files).toHaveBeenCalledWith('project', false);
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('Project Alpha.md');
        expect(rows[0].textContent).toContain('Title match');
        expect(rows[1].textContent).toContain('Line 7');
        expect(document.getElementById('search-results-count').textContent).toBe('2 notes');
    });

    test('uses the title-only filter without asking the backend to scan note bodies', async () => {
        setSearchFilter('titleOnly', true);

        await performGlobalSearch('project');

        expect(window.pywebview.api.search_files).not.toHaveBeenCalled();
        expect(document.querySelectorAll('.search-result-row')).toHaveLength(1);
        expect(state.searchResults[0].path).toBe('Projects/Project Alpha.md');
    });

    test('opens the selected result from the keyboard at its matching line', async () => {
        const input = document.getElementById('global-search-input');
        input.value = 'project';
        await performGlobalSearch(input.value);

        handleSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        handleSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        expect(document.querySelector('.search-result-row.selected')).not.toBeNull();

        handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
        expect(openTab).toHaveBeenCalledWith('Journal.md', 'Journal.md', 'file', {
            path: 'Journal.md',
            mtime: 10,
            line: 7
        });
    });

    test('keeps the newest query when an earlier backend response arrives late', async () => {
        const slow = deferred();
        const fast = deferred();
        setState('fileTreeData', []);
        setState('recentFiles', []);
        window.pywebview.api.search_files
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(() => fast.promise);

        const firstSearch = performGlobalSearch('first');
        const secondSearch = performGlobalSearch('second');

        fast.resolve([{
            name: 'Second.md',
            path: 'Second.md',
            mtime: 2,
            matches: [{ line: 1, text: 'second result' }]
        }]);
        await secondSearch;

        slow.resolve([{
            name: 'First.md',
            path: 'First.md',
            mtime: 1,
            matches: [{ line: 1, text: 'first result' }]
        }]);
        await firstSearch;

        expect(state.searchQuery).toBe('second');
        expect(state.searchResults).toEqual([expect.objectContaining({ path: 'Second.md' })]);
        expect(document.getElementById('global-search-dropdown').textContent).toContain('Second.md');
        expect(document.getElementById('global-search-dropdown').textContent).not.toContain('First.md');
    });
});
