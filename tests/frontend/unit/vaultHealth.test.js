import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/tabManager.js', () => ({ openTab: jest.fn() }));

import { openTab as mockOpenTab } from '../frontend/js/tabManager.js';
import { normalizeVaultHealth, renderVaultHealth } from '../frontend/js/vaultHealth.js';

describe('vault health', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
    });

    test('renders grouped, themed findings and opens their source note at the reported line', async () => {
        window.go.main.App.GetVaultHealth.mockResolvedValue({
            broken_links: [{ path: 'notes/source.md', line_num: 4, detail: 'Missing target.', target: 'missing.md' }],
            orphan_attachments: [{ path: 'assets/unused.png', detail: 'No Markdown note references this attachment.' }],
            duplicate_names: [{
                path: 'one/Plan.md', detail: '2 entries share the filename "plan.md".',
                paths: ['one/Plan.md', 'two/Plan.md'],
            }],
            invalid_frontmatter: [],
        });
        const panel = document.createElement('section');
        document.body.appendChild(panel);

        await renderVaultHealth(panel);

        expect(panel.querySelector('.vault-health-summary').textContent).toContain('3 findings');
        expect(panel.querySelectorAll('.vault-health-section')).toHaveLength(4);
        expect(panel.querySelector('.vault-health-open').textContent).toContain('notes/source.md:4');
        expect(panel.querySelector('.vault-health-open').textContent).toContain('missing.md');
        expect(panel.querySelector('.vault-health-paths').textContent).toContain('two/Plan.md');
        expect(panel.querySelector('.vault-health-scan').disabled).toBe(false);

        panel.querySelector('.vault-health-open').click();
        expect(mockOpenTab).toHaveBeenCalledWith(
            'notes/source.md', 'source.md', 'file', { path: 'notes/source.md', line: 4 }
        );
    });

    test('keeps empty groups compatible and reports a scan failure without modifying notes', async () => {
        expect(normalizeVaultHealth({})).toEqual({
            broken_links: [], orphan_attachments: [], duplicate_names: [], invalid_frontmatter: [],
        });
        expect(() => normalizeVaultHealth({ broken_links: {} })).toThrow('broken_links was not a list');

        window.go.main.App.GetVaultHealth.mockRejectedValueOnce(new Error('vault unavailable'));
        const panel = document.createElement('section');
        document.body.appendChild(panel);
        await renderVaultHealth(panel);

        expect(panel.querySelector('.vault-health-summary').textContent).toContain('could not be completed');
        expect(panel.querySelector('.vault-health-error').textContent).toContain('No note was changed');
        expect(panel.querySelector('.vault-health-scan').disabled).toBe(false);
        expect(mockOpenTab).not.toHaveBeenCalled();
    });
});
