import {
    closeRawTextPreview,
    openRawTextPreview,
} from '../frontend/js/rawTextPreview.js';

function previewDOM() {
    document.body.innerHTML = `
        <aside id="right-sidebar" class="right-sidebar collapsed">
            <div id="right-sidebar-resizer"></div>
            <div class="right-sidebar-header"><span id="right-sidebar-title">Details</span></div>
            <div id="right-sidebar-content"><div id="history-content"></div></div>
        </aside>
    `;
}

describe('raw text preview', () => {
    beforeEach(previewDOM);
    afterEach(() => closeRawTextPreview());

    test('shows exact Markdown source, including frontmatter and HTML, and refreshes live', async () => {
        const original = [
            '---',
            'title: Metadata stays visible',
            '---',
            '# Report',
            '',
            '<script>source, not markup</script>',
            '```mermaid',
            'flowchart LR',
            '```',
        ].join('\n');
        await openRawTextPreview({ path: 'notes/report.md', title: 'report.md', content: original });

        const sidebar = document.getElementById('right-sidebar');
        const panel = document.getElementById('raw-text-preview-panel');
        const source = panel.querySelector('.raw-text-preview-source');
        expect(sidebar.dataset.mode).toBe('raw-text-preview');
        expect(sidebar.classList.contains('raw-text-preview-mode')).toBe(true);
        expect(document.getElementById('right-sidebar-title').textContent).toBe('Raw Text');
        expect(panel.querySelector('.raw-text-preview-document-title').textContent).toBe('report');
        expect(source.textContent).toBe(original);
        expect(source.querySelector('script')).toBeNull();

        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: 'notes/report.md', content: '## Updated\n\n- still raw' },
        }));
        expect(source.textContent).toBe('## Updated\n\n- still raw');
        expect(panel.querySelector('.raw-text-preview-status').textContent).toMatch(/up to date/i);
    });

    test('preserves an explicitly supplied empty document and closes cleanly', async () => {
        await openRawTextPreview({ path: 'notes/empty.md', title: 'empty.md', content: '' });
        const sidebar = document.getElementById('right-sidebar');
        const panel = document.getElementById('raw-text-preview-panel');
        expect(panel.querySelector('.raw-text-preview-source').textContent).toBe('');

        closeRawTextPreview();
        expect(panel.hidden).toBe(true);
        expect(sidebar.classList.contains('open')).toBe(false);
        expect(sidebar.getAttribute('aria-hidden')).toBe('true');
        expect(sidebar.hasAttribute('inert')).toBe(true);
    });
});
