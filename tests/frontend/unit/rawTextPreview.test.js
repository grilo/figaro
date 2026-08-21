import {
    closeRawTextPreview,
    copyRawTextPreview,
    openRawTextPreview,
} from '../frontend/js/rawTextPreview.js';
import { setState } from '../frontend/js/state.js';

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
    beforeEach(() => {
        previewDOM();
        setState('openTabs', []);
        setState('activeTabId', null);
        setState('editorView', null);
    });
    afterEach(() => {
        closeRawTextPreview();
        setState('openTabs', []);
        setState('activeTabId', null);
        setState('editorView', null);
    });

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

    test('copies the complete current Markdown snapshot with visible success feedback', async () => {
        const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        try {
            const source = '# Initial source';
            const currentSource = '# Complete current source\n\n- one\n- two';
            await openRawTextPreview({ path: 'notes/copy.md', title: 'copy.md', content: source });
            document.dispatchEvent(new CustomEvent('file-content-changed', {
                detail: { path: 'notes/copy.md', content: currentSource },
            }));
            const panel = document.getElementById('raw-text-preview-panel');
            const copy = panel.querySelector('[data-action="copy-raw-text"]');
            expect(copy.classList.contains('ui-button')).toBe(true);
            expect(copy.classList.contains('ui-button--primary')).toBe(true);

            await expect(copyRawTextPreview()).resolves.toBe(true);
            expect(writeText).toHaveBeenCalledWith(currentSource);
            expect(panel.querySelector('.raw-text-preview-status').textContent)
                .toMatch(/copied the complete markdown source/i);
            expect(copy.disabled).toBe(false);
        } finally {
            if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
            else delete navigator.clipboard;
        }
    });

    test('restores the action and announces an unavailable clipboard', async () => {
        const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        const originalExecCommand = document.execCommand;
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
        });
        document.execCommand = jest.fn(() => false);
        try {
            await openRawTextPreview({ path: 'notes/copy.md', title: 'copy.md', content: '# Source' });
            const panel = document.getElementById('raw-text-preview-panel');
            await expect(copyRawTextPreview()).resolves.toBe(false);
            expect(panel.querySelector('.raw-text-preview-status').textContent).toMatch(/could not copy/i);
            expect(panel.querySelector('.raw-text-preview-status').classList.contains('ui-notice--danger')).toBe(true);
            expect(panel.querySelector('[data-action="copy-raw-text"]').disabled).toBe(false);
        } finally {
            document.execCommand = originalExecCommand;
            if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
            else delete navigator.clipboard;
        }
    });

    test('follows the active editor source position after a short coalescing delay', async () => {
        jest.useFakeTimers();
        const range = {
            setStart: jest.fn(),
            setEnd: jest.fn(),
            getBoundingClientRect: jest.fn(() => ({ top: 500 })),
        };
        const createRange = jest.spyOn(document, 'createRange').mockReturnValue(range);
        try {
            const scroller = document.createElement('div');
            document.body.appendChild(scroller);
            Object.defineProperties(scroller, {
                clientHeight: { configurable: true, value: 300 },
                scrollHeight: { configurable: true, value: 1400 },
                scrollTop: { configurable: true, writable: true, value: 420 },
            });
            scroller.getBoundingClientRect = () => ({ left: 20, top: 80 });
            const contentDOM = document.createElement('div');
            contentDOM.getBoundingClientRect = () => ({ left: 50, top: 80 });
            const view = {
                contentDOM,
                isDestroyed: false,
                posAtCoords: jest.fn(() => 600),
                scrollDOM: scroller,
                state: { doc: { length: 1000 } },
            };
            setState('openTabs', [{ id: 'notes/follow.md', path: 'notes/follow.md', type: 'file' }]);
            setState('activeTabId', 'notes/follow.md');
            setState('editorView', view);

            await openRawTextPreview({
                path: 'notes/follow.md',
                title: 'follow.md',
                content: 'x'.repeat(1000),
            });
            const stage = document.querySelector('.raw-text-preview-stage');
            Object.defineProperties(stage, {
                clientHeight: { configurable: true, value: 200 },
                scrollHeight: { configurable: true, value: 1000 },
                scrollTop: { configurable: true, writable: true, value: 100 },
            });
            stage.getBoundingClientRect = () => ({ top: 50 });

            scroller.dispatchEvent(new Event('scroll'));
            expect(stage.scrollTop).toBe(100);
            jest.advanceTimersByTime(60);
            expect(stage.scrollTop).toBe(490);
            expect(view.posAtCoords).toHaveBeenCalledWith({ x: 62, y: 170 });

            closeRawTextPreview();
            stage.scrollTop = 240;
            scroller.dispatchEvent(new Event('scroll'));
            jest.advanceTimersByTime(60);
            expect(stage.scrollTop).toBe(240);
        } finally {
            createRange.mockRestore();
            jest.useRealTimers();
        }
    });

    test('preserves an explicitly supplied empty document and closes cleanly', async () => {
        await openRawTextPreview({ path: 'notes/empty.md', title: 'empty.md', content: '' });
        const sidebar = document.getElementById('right-sidebar');
        const panel = document.getElementById('raw-text-preview-panel');
        expect(panel.querySelector('.raw-text-preview-source').textContent).toBe('');
        expect(panel.querySelector('[data-action="copy-raw-text"]').disabled).toBe(true);

        closeRawTextPreview();
        expect(panel.hidden).toBe(true);
        expect(sidebar.classList.contains('open')).toBe(false);
        expect(sidebar.getAttribute('aria-hidden')).toBe('true');
        expect(sidebar.hasAttribute('inert')).toBe(true);
    });
});
