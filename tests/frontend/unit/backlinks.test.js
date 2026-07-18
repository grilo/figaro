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
        window.go.main.App.SearchBacklinks.mockResolvedValueOnce(null);

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
        window.go.main.App.SearchBacklinks.mockResolvedValueOnce([]);

        await loadBacklinksResults('target.md', container.id);

        expect(container.textContent).toContain('No backlinks found');
        expect(container.textContent).toContain('No unlinked mentions found');
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('renders contextual backlinks and separately labelled unlinked mentions', async () => {
        const container = document.createElement('div');
        container.id = 'relationships-results';
        document.body.appendChild(container);
        window.go.main.App.SearchBacklinks.mockResolvedValueOnce([{
            path: 'linked.md', name: 'linked.md', line_num: 4,
            context: 'Discuss [Target](target.md) before the decision.', match_text: 'Target',
        }]);
        window.go.main.App.SearchUnlinkedMentions.mockResolvedValueOnce([{
            path: 'mention.md', name: 'mention.md', line_num: 8,
            context: 'Target needs an owner before Friday.', match_text: 'Target',
        }]);

        await loadBacklinksResults('target.md', container.id);

        expect(container.querySelectorAll('.relationship-section')).toHaveLength(2);
        expect(container.textContent).toContain('Backlinks');
        expect(container.textContent).toContain('Unlinked mentions');
        expect(container.querySelectorAll('.relationship-card')).toHaveLength(2);
        expect(container.querySelectorAll('.relationship-context mark')).toHaveLength(3);
        expect(container.querySelector('.relationship-open').getAttribute('type')).toBe('button');
    });

    test('links one unlinked mention in the preferred syntax after safeguarding open buffers', async () => {
        const container = document.createElement('div');
        container.id = 'link-mention-results';
        document.body.appendChild(container);
        window.go.main.App.SearchBacklinks.mockResolvedValue([]);
        window.go.main.App.SearchUnlinkedMentions
            .mockResolvedValueOnce([{
                path: 'mention.md', name: 'mention.md', line_num: 3,
                context: 'Target needs an owner.', match_text: 'Target',
            }])
            .mockResolvedValue([]);

        await loadBacklinksResults('target.md', container.id);
        container.querySelector('.relationship-link-action').click();
        await testUtils.waitFor(0);
        await testUtils.waitFor(0);

        expect(window.go.main.App.LinkUnlinkedMention).toHaveBeenCalledWith(
            'mention.md', 3, 'target.md', 'markdown'
        );
        expect(container.textContent).toContain('No unlinked mentions found');
    });

    test('still logs genuine backend failures with their useful message', async () => {
        window.go.main.App.SearchBacklinks.mockRejectedValueOnce(new Error('vault is unavailable'));

        await updateBacklinksForActiveTab();

        expect(consoleError).toHaveBeenCalledWith(
            '[ERROR]',
            'Failed to load backlinks: vault is unavailable'
        );
        expect(document.getElementById('backlinks-status').textContent).toBe('0 backlinks');
    });

    test('rejects malformed successful responses instead of silently calling them empty', async () => {
        window.go.main.App.SearchBacklinks.mockResolvedValueOnce({ results: [] });

        await updateBacklinksForActiveTab();

        expect(consoleError).toHaveBeenCalledWith(
            '[ERROR]',
            'Failed to load backlinks: Backlinks response was not a list'
        );
    });
});
