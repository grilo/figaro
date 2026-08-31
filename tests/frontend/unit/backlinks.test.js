import { testUtils } from './test_setup.js';
import { state, setState } from '../frontend/js/state.js';
import { configureBacklinksWorkspace, loadBacklinksResults, normalizeBacklinks, updateBacklinksForActiveTab } from '../frontend/js/backlinks.js';

const openTab = jest.fn();
const prepareTabsForVaultLinkRewrite = jest.fn().mockResolvedValue({ success: true });
const refreshTabsForUpdatedLinks = jest.fn().mockResolvedValue(true);

describe('empty and failed backlink lookups', () => {
    let consoleError;

    beforeEach(() => {
        configureBacklinksWorkspace({ openTab, prepareTabsForVaultLinkRewrite, refreshTabsForUpdatedLinks });
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
        window.go.desktop.App.SearchBacklinks.mockResolvedValueOnce(null);

        await updateBacklinksForActiveTab();

        expect(state.backlinksData).toEqual([]);
        expect(state.backlinksTargetPath).toBe('target.md');
        expect(document.getElementById('backlinks-status').textContent).toBe('0 backlinks');
        expect(document.getElementById('backlinks-status').title).toBe('No backlinks found');
        expect(document.getElementById('backlinks-status').tagName).toBe('BUTTON');
        expect(document.getElementById('backlinks-status').disabled).toBe(true);
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('enables the native status button when relationships are available', async () => {
        window.go.desktop.App.SearchBacklinks.mockResolvedValueOnce([{
            path: 'linked.md', name: 'linked.md', line_num: 4,
            context: 'See [Target](target.md).', match_text: 'Target',
        }]);

        await updateBacklinksForActiveTab();

        const button = document.getElementById('backlinks-status');
        expect(button.tagName).toBe('BUTTON');
        expect(button.disabled).toBe(false);
        expect(button.classList.contains('has-backlinks')).toBe(true);
        expect(button.title).toBe('Open 1 backlink');
    });

    test('renders an empty backlinks tab without producing an error log', async () => {
        const container = document.createElement('div');
        container.id = 'backlinks-results';
        document.body.appendChild(container);
        window.go.desktop.App.SearchBacklinks.mockResolvedValueOnce([]);

        await loadBacklinksResults('target.md', container.id);

        expect(container.textContent).toContain('No backlinks found');
        expect(container.textContent).toContain('No unlinked mentions found');
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('renders contextual backlinks and separately labelled unlinked mentions', async () => {
        const container = document.createElement('div');
        container.id = 'relationships-results';
        document.body.appendChild(container);
        window.go.desktop.App.SearchBacklinks.mockResolvedValueOnce([{
            path: 'linked.md', name: 'linked.md', line_num: 4,
            context: 'Discuss [Target](target.md) before the decision.', match_text: 'Target',
        }]);
        window.go.desktop.App.SearchUnlinkedMentions.mockResolvedValueOnce([{
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

    test('keeps distant backlinks keyboard-reachable outside the mounted window', async () => {
        const wrapper = document.createElement('div');
        wrapper.className = 'backlinks-view-wrapper';
        const container = document.createElement('div');
        container.id = 'large-relationships-results';
        wrapper.appendChild(container);
        document.body.appendChild(wrapper);
        window.go.desktop.App.SearchBacklinks.mockResolvedValueOnce(
            Array.from({ length: 300 }, (_, index) => ({
                path: `archive/note-${index}.md`,
                name: `note-${index}.md`,
                line_num: index + 1,
                context: `Target context ${index}`,
                match_text: 'Target',
            })),
        );
        window.go.desktop.App.SearchUnlinkedMentions.mockResolvedValueOnce([]);

        await loadBacklinksResults('target.md', container.id);
        expect(container.querySelectorAll('.relationship-card')).toHaveLength(96);
        container.querySelector('.relationship-open').focus();
        for (let index = 0; index < 150; index += 1) {
            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Tab', bubbles: true, cancelable: true,
            }));
        }

        expect(document.activeElement.dataset.relationshipIndex).toBe('150');
        expect(document.activeElement.getAttribute('aria-posinset')).toBe('151');
        expect(document.activeElement.getAttribute('aria-setsize')).toBe('300');
        expect(document.activeElement.closest('.relationship-card').dataset.path)
            .toBe('archive/note-150.md');
        expect(container.querySelectorAll('.relationship-card')).toHaveLength(96);
    });

    test('links one unlinked mention in the preferred syntax after safeguarding open buffers', async () => {
        const container = document.createElement('div');
        container.id = 'link-mention-results';
        document.body.appendChild(container);
        window.go.desktop.App.SearchBacklinks.mockResolvedValue([]);
        window.go.desktop.App.SearchUnlinkedMentions
            .mockResolvedValueOnce([{
                path: 'mention.md', name: 'mention.md', line_num: 3,
                context: 'Target needs an owner.', match_text: 'Target',
            }])
            .mockResolvedValue([]);

        await loadBacklinksResults('target.md', container.id);
        container.querySelector('.relationship-link-action').click();
        await testUtils.waitFor(0);
        await testUtils.waitFor(0);

        expect(window.go.desktop.App.LinkUnlinkedMention).toHaveBeenCalledWith(
            'mention.md', 3, 'target.md', 'markdown'
        );
        expect(container.textContent).toContain('No unlinked mentions found');
    });

    test('still logs genuine backend failures with their useful message', async () => {
        window.go.desktop.App.SearchBacklinks.mockRejectedValueOnce(new Error('vault is unavailable'));

        await updateBacklinksForActiveTab();

        expect(consoleError).toHaveBeenCalledWith(
            '[ERROR]',
            'Failed to load backlinks: vault is unavailable'
        );
        expect(document.getElementById('backlinks-status').textContent).toBe('0 backlinks');
    });

    test('rejects malformed successful responses instead of silently calling them empty', async () => {
        window.go.desktop.App.SearchBacklinks.mockResolvedValueOnce({ results: [] });

        await updateBacklinksForActiveTab();

        expect(consoleError).toHaveBeenCalledWith(
            '[ERROR]',
            'Failed to load backlinks: Backlinks response was not a list'
        );
    });
});
