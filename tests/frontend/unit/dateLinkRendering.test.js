import MarkdownIt from 'markdown-it';
import { createPrintMarkdownRenderer } from '../frontend/vendored/markdown-it-plugins/index.js';
import { taskDueMetadataPlan } from '../frontend/js/core/taskDueMetadataModel.js';

test.each(['markdown', 'wikilink'])('@date %s output renders as an ordinary dated link in the shared PDF renderer', style => {
    const previous = window.markdownit;
    window.markdownit = MarkdownIt;
    try {
        const plan = taskDueMetadataPlan('Meeting @date', 13, { from: 8, to: 13 }, '2026-01-01', style);
        const container = document.createElement('div');
        container.innerHTML = createPrintMarkdownRenderer().render(plan.line);
        const link = container.querySelector('a');
        expect(link.textContent).toBe('2026-01-01');
        expect(link.getAttribute('href')).toBe(style === 'wikilink' ? '/vault/2026-01-01.md' : '2026-01-01.md');
        expect(container.textContent).not.toContain('due');
    } finally {
        window.markdownit = previous;
    }
});
