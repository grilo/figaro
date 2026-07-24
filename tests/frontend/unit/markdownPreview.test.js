import MarkdownIt from 'markdown-it';

import {
    closeMarkdownPreview,
    openMarkdownPreview,
    renderMarkdownPreview,
} from '../frontend/js/markdownPreview.js';

function previewDOM() {
    document.body.innerHTML = `
        <aside id="right-sidebar" class="right-sidebar collapsed">
            <div id="right-sidebar-resizer"></div>
            <div class="right-sidebar-header"><span id="right-sidebar-title">Details</span></div>
            <div id="right-sidebar-content"><div id="history-content"></div></div>
        </aside>
    `;
}

describe('Markdown preview', () => {
    beforeEach(() => {
        previewDOM();
        window.markdownit = jest.fn(options => new MarkdownIt(options));
    });

    afterEach(() => {
        closeMarkdownPreview();
        delete window.markdownit;
    });

    test('renders the current Markdown snapshot in the themed right pane and refreshes live', async () => {
        await openMarkdownPreview({
            path: 'notes/report.md',
            title: 'report.md',
            content: '---\ntitle: Metadata only\n---\n# Report\n\n* first\n* second',
        });

        const sidebar = document.getElementById('right-sidebar');
        const panel = document.getElementById('markdown-preview-panel');
        expect(sidebar.dataset.mode).toBe('markdown-preview');
        expect(sidebar.classList.contains('markdown-preview-mode')).toBe(true);
        expect(document.getElementById('right-sidebar-title').textContent).toBe('Markdown Preview');
        expect(panel.querySelector('.markdown-preview-document-title').textContent).toBe('report');
        expect(panel.querySelector('h1').textContent).toBe('Report');
        expect(Array.from(panel.querySelectorAll('li')).map(item => item.textContent)).toEqual(['first', 'second']);
        expect(panel.textContent).not.toContain('Metadata only');

        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: 'notes/report.md', content: '## Updated' },
        }));
        expect(panel.querySelector('h2').textContent).toBe('Updated');
        expect(panel.querySelector('.markdown-preview-status').textContent).toMatch(/up to date/i);

        closeMarkdownPreview();
        expect(panel.hidden).toBe(true);
        expect(sidebar.classList.contains('open')).toBe(false);
    });

    test('uses the safe Markdown renderer rather than injecting source HTML', () => {
        const html = renderMarkdownPreview('# Heading\n\n<script>unsafe()</script>');
        expect(html).toContain('<h1 id="heading">Heading</h1>');
        expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;');
        expect(html).not.toContain('<script>');
    });

    test('keeps the preview pane open with a themed error when the renderer is unavailable', async () => {
        delete window.markdownit;

        await openMarkdownPreview({
            path: 'notes/report.md',
            title: 'report.md',
            content: '# Report',
        });

        const panel = document.getElementById('markdown-preview-panel');
        expect(panel.hidden).toBe(false);
        expect(panel.querySelector('.markdown-preview-document').textContent).toBe('');
        expect(panel.querySelector('.markdown-preview-status').dataset.kind).toBe('error');
        expect(panel.querySelector('.markdown-preview-status').textContent).toMatch(/unavailable/i);
    });
});
