import { testUtils } from './test_setup.js';

jest.mock('../frontend/js/tabManager.js', () => ({ openTab: jest.fn() }));

import { openTab as mockOpenTab } from '../frontend/js/tabManager.js';
import { configureVaultHealthWorkspace, normalizeVaultHealth, renderVaultHealth } from '../frontend/js/vaultHealth.js';

describe('vault health', () => {
    beforeEach(() => {
        configureVaultHealthWorkspace({ openTab: mockOpenTab });
        testUtils.createMockDOM();
        jest.clearAllMocks();
    });

    test('renders grouped, themed findings and opens their source note at the reported line', async () => {
        window.go.desktop.App.GetVaultHealth.mockResolvedValue({
            broken_links: [{ path: 'notes/source.md', line_num: 4, detail: 'Missing target.', target: 'missing.md' }],
            orphan_attachments: [{ path: 'assets/unused.png', detail: 'No Markdown note references this attachment.' }],
            duplicate_names: [{
                path: 'one/Plan.md', detail: '2 entries use the filename "Plan.md" in different locations.',
                paths: ['one/Plan.md', 'two/Plan.md'],
            }],
            similar_notes: [{
                path: 'notes/Inner Source.md', detail: 'Names differ only by spacing.',
                paths: ['notes/Inner Source.md', 'notes/InnerSource.md'],
            }],
            invalid_frontmatter: [],
        });
        const panel = document.createElement('section');
        document.body.appendChild(panel);

        await renderVaultHealth(panel);

        expect(panel.querySelector('.vault-health-summary').textContent).toContain('3 findings');
        expect(panel.querySelector('.vault-health-summary').textContent).toContain('1 repeated filename is listed for reference');
        expect(panel.querySelectorAll('.vault-health-section')).toHaveLength(5);
        const repeatedSection = [...panel.querySelectorAll('.vault-health-section')]
            .find(section => section.querySelector('h3').textContent === 'Repeated filenames');
        expect(repeatedSection.classList).not.toContain('has-findings');
        expect(repeatedSection.querySelector('.ui-badge').classList).toContain('ui-badge--muted');
        expect(panel.querySelector('.vault-health-open').textContent).toContain('notes/source.md:4');
        expect(panel.querySelector('.vault-health-open').textContent).toContain('missing.md');
        expect(panel.querySelector('.vault-health-paths').textContent).toContain('two/Plan.md');
        expect(panel.querySelector('.vault-health-scan').disabled).toBe(false);

        panel.querySelector('.vault-health-open').click();
        expect(mockOpenTab).toHaveBeenCalledWith(
            'notes/source.md', 'source.md', 'file', { path: 'notes/source.md', line: 4 }
        );

        panel.querySelector('[data-paths]').click();
        expect(mockOpenTab).toHaveBeenCalledWith(
            'notes/Inner Source.md', 'Inner Source.md', 'file', { path: 'notes/Inner Source.md', line: null }
        );
        expect(mockOpenTab).toHaveBeenCalledWith(
            'notes/InnerSource.md', 'InnerSource.md', 'file', { path: 'notes/InnerSource.md', line: null }
        );
    });

    test('keeps empty groups compatible and reports a scan failure without modifying notes', async () => {
        expect(normalizeVaultHealth({})).toEqual({
            broken_links: [], orphan_attachments: [], duplicate_names: [], similar_notes: [], invalid_frontmatter: [],
        });
        expect(() => normalizeVaultHealth({ broken_links: {} })).toThrow('broken_links was not a list');

        window.go.desktop.App.GetVaultHealth.mockRejectedValueOnce(new Error('vault unavailable'));
        const panel = document.createElement('section');
        document.body.appendChild(panel);
        await renderVaultHealth(panel);

        expect(panel.querySelector('.vault-health-summary').textContent).toContain('could not be completed');
        expect(panel.querySelector('.vault-health-error').textContent).toContain('No note was changed');
        expect(panel.querySelector('.vault-health-scan').disabled).toBe(false);
        expect(mockOpenTab).not.toHaveBeenCalled();
    });
});
