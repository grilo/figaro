import { testUtils } from './test_setup.js';
import { state, setState } from '../frontend/js/state.js';
import { loadBacklinksResults, normalizeBacklinks, updateBacklinksForActiveTab } from '../frontend/js/backlinks.js';

describe('empty and failed backlink lookups', () => {
    let consoleError;

    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        setState('openTabs', [{ id: 'target', type: 'file', path: 'target.md' }]);
        setState('activeTabId', 'target');
        setState('backlinksData', [{ path: 'stale.md' }]);
        setState('backlinksTargetPath', 'stale.md');
    });

    afterEach(() => consoleError.mockRestore());

    test('treats legacy null and current empty-list responses as normal zero backlinks', async () => {
        expect(normalizeBacklinks(null)).toEqual([]);
        expect(normalizeBacklinks([])).toEqual([]);
        window.pywebview.api.search_backlinks.mockResolvedValueOnce(null);

        await updateBacklinksForActiveTab();

        expect(state.backlinksData).toEqual([]);
        expect(state.backlinksTargetPath).toBe('target.md');
        expect(document.getElementById('backlinks-status').textContent).toBe('0 backlinks');
        expect(document.getElementById('backlinks-status').title).toBe('No backlinks found');
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('renders an empty backlinks tab without producing an error log', async () => {
        const container = document.createElement('div');
        container.id = 'backlinks-results';
        document.body.appendChild(container);
        window.pywebview.api.search_backlinks.mockResolvedValueOnce([]);

        await loadBacklinksResults('target.md', container.id);

        expect(container.textContent).toBe('No backlinks found');
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('still logs genuine backend failures with their useful message', async () => {
        window.pywebview.api.search_backlinks.mockRejectedValueOnce(new Error('vault is unavailable'));

        await updateBacklinksForActiveTab();

        expect(consoleError).toHaveBeenCalledWith(
            '[ERROR]',
            'Failed to load backlinks: vault is unavailable'
        );
        expect(document.getElementById('backlinks-status').textContent).toBe('0 backlinks');
    });

    test('rejects malformed successful responses instead of silently calling them empty', async () => {
        window.pywebview.api.search_backlinks.mockResolvedValueOnce({ results: [] });

        await updateBacklinksForActiveTab();

        expect(consoleError).toHaveBeenCalledWith(
            '[ERROR]',
            'Failed to load backlinks: Backlinks response was not a list'
        );
    });
});
