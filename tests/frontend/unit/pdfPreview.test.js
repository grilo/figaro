/** Live PDF preview contracts: stylesheet resolution, isolation, and UI flow. */

import { testUtils } from './test_setup.js';

var mockState = {
    openTabs: [],
    activeTabId: null,
};

jest.mock('../frontend/js/state.js', () => ({
    getState: jest.fn(key => mockState[key]),
}));

jest.mock('../frontend/js/log.js', () => ({
    log: { error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../frontend/js/pdfExport.js', () => ({
    renderPrintableMarkdownWithDiagrams: jest.fn().mockResolvedValue(
        '<!doctype html><html><head><title>Report</title></head><body><main class="figaro-print-document"><h1>Report</h1></main></body></html>'
    ),
    exportMarkdownToPDF: jest.fn().mockResolvedValue({ success: true, path: 'notes/report.pdf' }),
}));

jest.mock('../frontend/js/dialogs.js', () => ({
    pdfExportErrorDialog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../frontend/js/tabManager.js', () => ({
    saveFileSnapshot: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../frontend/js/app.js', () => ({
    handleFileOpen: jest.fn().mockResolvedValue(undefined),
}));

import {
    buildPDFPreviewDocument,
    closePDFPreview,
    getPDFPreviewFragmentID,
    isPDFPreviewOpen,
    openPDFPreview,
    rebasePDFPreviewStylesheetURLs,
    resolvePDFPreviewStylesheetPath,
    scrollProgressForContentRegion,
    scrollProgressForMetrics,
    scrollTopForContentProgress,
    scrollTopForProgress,
} from '../frontend/js/pdfPreview.js';
import { exportMarkdownToPDF, renderPrintableMarkdownWithDiagrams } from '../frontend/js/pdfExport.js';
import { saveFileSnapshot } from '../frontend/js/tabManager.js';
import { handleFileOpen } from '../frontend/js/app.js';
import { initRightSidebarResizer } from '../frontend/js/historyPanel.js';

function waitForPreview(delay = 40) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

function setScrollMetrics(element, { scrollTop = 0, scrollHeight, clientHeight }) {
    Object.defineProperties(element, {
        scrollTop: { configurable: true, writable: true, value: scrollTop },
        scrollHeight: { configurable: true, value: scrollHeight },
        clientHeight: { configurable: true, value: clientHeight },
    });
}

const previewBridgeChannel = 'figaro-pdf-preview-v1';

function previewBridgeBootstrapToken(frame) {
    const fragment = String(frame.getAttribute('src') || '').split('#').slice(1).join('#');
    return decodeURIComponent(fragment);
}

function dispatchBridgeMessage(frame, message) {
    window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        data: { channel: previewBridgeChannel, ...message, bootstrapToken: previewBridgeBootstrapToken(frame) },
    }));
}

function postedBridgeMessages(postMessage) {
    return postMessage.mock.calls.map(([message]) => message)
        .filter(message => message?.channel === previewBridgeChannel);
}

function latestBridgeRender(postMessage) {
    return postedBridgeMessages(postMessage).filter(message => message.type === 'render').at(-1);
}

async function openReadyPreview(options) {
    await openPDFPreview(options);
    const frame = document.querySelector('.pdf-preview-frame');
    const postMessage = jest.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
    dispatchBridgeMessage(frame, { type: 'ready' });
    await waitForPreview();
    return { frame, postMessage, render: () => latestBridgeRender(postMessage) };
}

describe('live PDF preview', () => {
    beforeEach(() => {
        testUtils.createMockDOM();
        jest.clearAllMocks();
        mockState.openTabs = [];
        mockState.activeTabId = null;
        window.pywebview.api.read_file = jest.fn(path => {
            if (path === 'notes/empty.md') {
                return Promise.resolve({ path, mtime: 9, content: '' });
            }
            if (path === 'notes/report.md') {
                return Promise.resolve({
                    path,
                    mtime: 10,
                    content: '---\nprint-stylesheet: styles/print.css\n---\n# Report',
                });
            }
            if (path === 'notes/styles/print.css') {
                return Promise.resolve({ path, mtime: 11, content: '.figaro-print-document { color: rebeccapurple; }' });
            }
            return Promise.resolve(null);
        });
    });

    afterEach(() => {
        closePDFPreview();
    });

    test('resolves explicit and fallback stylesheets relative to the note', () => {
        expect(resolvePDFPreviewStylesheetPath('notes/report.md', '../styles/report.css')).toMatchObject({
            path: 'styles/report.css',
            reference: '../styles/report.css',
            optional: false,
        });
        expect(resolvePDFPreviewStylesheetPath('notes/report.md', '')).toMatchObject({
            path: 'notes/_print.css',
            reference: '_print.css',
            optional: true,
        });
        expect(resolvePDFPreviewStylesheetPath('notes/report.md', '/tmp/print.css').error).toContain('vault-local');
        expect(resolvePDFPreviewStylesheetPath('notes/report.md', 'print.txt').error).toContain('.css');
    });

    test('isolates a printable document and rebases stylesheet assets to the vault', () => {
        expect(rebasePDFPreviewStylesheetURLs('a { background: url("../assets/paper.png"); }', 'notes/styles/print.css'))
            .toContain('/vault/notes/assets/paper.png');

        const html = buildPDFPreviewDocument(
            '<!doctype html><html><head></head><body><main class="figaro-print-document">Body</main></body></html>',
            {
                notePath: 'notes/report.md',
                stylesheetPath: 'notes/styles/print.css',
                stylesheetContent: 'html { color: yellow; background: black; } .figaro-print-document { color: tomato; }',
            }
        );
        const printable = new DOMParser().parseFromString(html, 'text/html');

        expect(printable.body.classList.contains('figaro-pdf-preview-body')).toBe(true);
        expect(printable.querySelector('base').getAttribute('href')).toContain('/vault/notes/');
        expect(printable.querySelector('#figaro-preview-user-stylesheet').textContent).toContain('tomato');
        expect(printable.querySelector('#figaro-preview-user-stylesheet').textContent).toContain('background: black');
        expect(printable.querySelector('#figaro-preview-surface').textContent).toContain('box-shadow');
        expect(printable.querySelector('#figaro-preview-surface').textContent).toContain('background: transparent');
        const styles = Array.from(printable.querySelectorAll('style'));
        expect(styles.indexOf(printable.querySelector('#figaro-preview-user-stylesheet')))
            .toBeGreaterThan(styles.indexOf(printable.querySelector('#figaro-preview-surface')));
    });

    test('keeps scroll synchronization relative and recognizes only same-document links', () => {
        expect(scrollProgressForMetrics(300, 1000, 400)).toBe(0.5);
        expect(scrollProgressForMetrics(90, 80, 40)).toBe(1);
        expect(scrollTopForProgress(0.5, 1000, 400)).toBe(300);
        expect(scrollTopForProgress(2, 1000, 400)).toBe(600);
        expect(scrollProgressForContentRegion(1050, 2000, 500, 600)).toBe(0.5);
        expect(scrollTopForContentProgress(0.5, 2000, 500, 600)).toBe(1050);

        expect(getPDFPreviewFragmentID('#footnote1')).toBe('footnote1');
        expect(getPDFPreviewFragmentID('#caf%C3%A9-notes')).toBe('café-notes');
        expect(getPDFPreviewFragmentID('notes/other.md#intro')).toBe('');
    });

    test('synchronizes the active Markdown scroller through the bridge without accessing iframe DOM', async () => {
        mockState.openTabs = [{ id: 'notes/report.md', type: 'file', path: 'notes/report.md' }];
        mockState.activeTabId = 'notes/report.md';
        const editorScroller = document.createElement('div');
        editorScroller.className = 'cm-scroller';
        setScrollMetrics(editorScroller, { scrollTop: 300, scrollHeight: 1000, clientHeight: 400 });
        document.getElementById('editor-container').appendChild(editorScroller);

        const { frame, postMessage, render } = await openReadyPreview({ path: 'notes/report.md', title: 'report.md' });
        const token = render().token;

        editorScroller.dispatchEvent(new Event('scroll'));
        await waitForPreview();
        expect(postedBridgeMessages(postMessage)).toContainEqual(expect.objectContaining({
            type: 'set-content-progress',
            token,
            progress: 0.5,
        }));

        dispatchBridgeMessage(frame, {
            type: 'scroll',
            token,
            documentProgress: 0.65,
            contentProgress: 0.2,
            programmatic: false,
        });
        await waitForPreview();
        expect(editorScroller.scrollTop).toBe(120);

        dispatchBridgeMessage(frame, {
            type: 'link',
            token,
            href: 'report.md#target',
        });
        expect(postedBridgeMessages(postMessage)).toContainEqual(expect.objectContaining({
            type: 'scroll-fragment',
            token,
            fragment: 'target',
        }));
    });

    test('coalesces rapid editor scrolls and ignores the matching programmatic echo', async () => {
        mockState.openTabs = [{ id: 'notes/report.md', type: 'file', path: 'notes/report.md' }];
        mockState.activeTabId = 'notes/report.md';
        const editorScroller = document.createElement('div');
        editorScroller.className = 'cm-scroller';
        setScrollMetrics(editorScroller, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
        document.getElementById('editor-container').appendChild(editorScroller);

        const { frame, postMessage, render } = await openReadyPreview({ path: 'notes/report.md', title: 'report.md' });
        const token = render().token;
        postMessage.mockClear();

        editorScroller.scrollTop = 100;
        editorScroller.dispatchEvent(new Event('scroll'));
        await waitForPreview(20);
        editorScroller.scrollTop = 220;
        editorScroller.dispatchEvent(new Event('scroll'));
        await waitForPreview(5);
        editorScroller.scrollTop = 320;
        editorScroller.dispatchEvent(new Event('scroll'));
        await waitForPreview(5);
        editorScroller.scrollTop = 420;
        editorScroller.dispatchEvent(new Event('scroll'));
        await waitForPreview(70);

        const updates = postedBridgeMessages(postMessage)
            .filter(message => message.type === 'set-content-progress');
        expect(updates.length).toBeLessThanOrEqual(2);
        expect(updates.at(-1)).toEqual(expect.objectContaining({
            token,
            progress: 0.7,
        }));

        postMessage.mockClear();
        dispatchBridgeMessage(frame, {
            type: 'scroll',
            token,
            documentProgress: 0.7,
            contentProgress: 0.2,
            programmatic: false,
        });
        await waitForPreview(20);
        editorScroller.dispatchEvent(new Event('scroll'));
        await waitForPreview(40);
        expect(postedBridgeMessages(postMessage)
            .filter(message => message.type === 'set-content-progress')).toHaveLength(0);
    });

    test('routes bridge link requests without allowing the iframe to navigate', async () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        try {
            const { frame, postMessage, render } = await openReadyPreview({ path: 'notes/report.md', title: 'report.md' });
            const token = render().token;
            expect(frame.getAttribute('src')).toMatch(/^\/pdf\/preview-frame\.html#/);
            expect(frame.getAttribute('sandbox')).toBe('allow-scripts');

            dispatchBridgeMessage(frame, { type: 'link', token, href: 'https://example.test/guide' });
            expect(open).toHaveBeenCalledWith('https://example.test/guide', '_blank', 'noopener,noreferrer');
            expect(isPDFPreviewOpen()).toBe(true);

            dispatchBridgeMessage(frame, { type: 'link', token, href: '../guide.md' });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(handleFileOpen).toHaveBeenCalledWith('guide.md');

            dispatchBridgeMessage(frame, { type: 'reference-missing', token, fragment: 'footnote-ref1' });
            expect(document.querySelector('.pdf-preview-status').textContent).toContain('footnote-ref1');
            expect(postedBridgeMessages(postMessage).some(message => message.type === 'render')).toBe(true);
        } finally {
            open.mockRestore();
        }
    });

    test('rejects a message from a frame that does not have the current bootstrap token', async () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        try {
            const { frame, render } = await openReadyPreview({ path: 'notes/report.md', title: 'report.md' });
            window.dispatchEvent(new MessageEvent('message', {
                source: frame.contentWindow,
                data: {
                    channel: previewBridgeChannel,
                    type: 'link',
                    token: render().token,
                    bootstrapToken: 'a-foreign-document-cannot-forge-this',
                    href: 'https://example.test/guide',
                },
            }));

            expect(open).not.toHaveBeenCalled();
            expect(isPDFPreviewOpen()).toBe(true);
        } finally {
            open.mockRestore();
        }
    });

    test('opens in the right pane and refreshes the iframe after an in-memory CSS change', async () => {
        const { frame, render } = await openReadyPreview({ path: 'notes/report.md', title: 'report.md' });

        const sidebar = document.getElementById('right-sidebar');
        const panel = document.getElementById('pdf-preview-panel');
        expect(isPDFPreviewOpen()).toBe(true);
        expect(sidebar.dataset.mode).toBe('pdf-preview');
        expect(panel.hidden).toBe(false);
        expect(panel.querySelector('.pdf-preview-document-title').textContent).toBe('report');
        expect(render().html).toContain('rebeccapurple');
        expect(renderPrintableMarkdownWithDiagrams).toHaveBeenCalledWith(
            expect.stringContaining('# Report'),
            'report'
        );

        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: 'notes/styles/print.css', content: '.figaro-print-document { color: teal; }' },
        }));
        await new Promise(resolve => setTimeout(resolve, 360));

        expect(render().html).toContain('color: teal');
        expect(renderPrintableMarkdownWithDiagrams).toHaveBeenCalledTimes(2);
    });

    test('keeps the PDF preview resize handle attached to the pane and changes its width on drag', async () => {
        await openPDFPreview({ path: 'notes/report.md', title: 'report.md' });
        const sidebar = document.getElementById('right-sidebar');
        const resizer = document.getElementById('right-sidebar-resizer');
        Object.defineProperty(sidebar, 'offsetWidth', { configurable: true, value: 480 });
        initRightSidebarResizer();

        expect(resizer.parentElement).toBe(sidebar);
        expect(resizer.classList.contains('visible')).toBe(true);

        resizer.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 900,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 800 }));
        expect(sidebar.style.width).toBe('580px');
        expect(sidebar.style.minWidth).toBe('580px');
        expect(resizer.classList.contains('is-dragging')).toBe(true);

        document.dispatchEvent(new MouseEvent('mouseup'));
        expect(resizer.classList.contains('is-dragging')).toBe(false);
    });

    test('renders an empty Markdown note instead of leaving the pane blank', async () => {
        const { render } = await openReadyPreview({ path: 'notes/empty.md', title: 'empty.md' });

        expect(renderPrintableMarkdownWithDiagrams).toHaveBeenCalledWith('', 'empty');
        expect(render().html).toContain('figaro-print-document');
    });

    test('refreshes the selected stylesheet after the vault file tree reports an external change', async () => {
        const { render } = await openReadyPreview({ path: 'notes/report.md', title: 'report.md' });
        window.pywebview.api.read_file.mockImplementation(path => {
            if (path === 'notes/styles/print.css') {
                return Promise.resolve({ path, mtime: 12, content: '.figaro-print-document { color: midnightblue; }' });
            }
            return Promise.resolve({
                path,
                mtime: 10,
                content: '---\nprint-stylesheet: styles/print.css\n---\n# Report',
            });
        });

        document.dispatchEvent(new CustomEvent('vault-file-tree-refreshed', {
            detail: {
                tree: [{
                    name: 'notes',
                    path: 'notes',
                    type: 'directory',
                    children: [{
                        name: 'styles',
                        path: 'notes/styles',
                        type: 'directory',
                        children: [{ name: 'print.css', path: 'notes/styles/print.css', type: 'file', mtime: 12 }],
                    }],
                }],
            },
        }));
        await new Promise(resolve => setTimeout(resolve, 360));

        expect(render().html).toContain('midnightblue');
    });

    test('generates the PDF from the current preview via the existing export behavior', async () => {
        await openPDFPreview({ path: 'notes/report.md', title: 'report.md' });
        await waitForPreview();

        document.querySelector('[data-action="generate-pdf"]').click();
        await waitForPreview();

        expect(exportMarkdownToPDF).toHaveBeenCalledWith({
            path: 'notes/report.md',
            title: 'report',
            content: '---\nprint-stylesheet: styles/print.css\n---\n# Report',
        });
        expect(document.querySelector('.pdf-preview-status').textContent).toContain('PDF generated');
    });

    test('saves a just-previewed stylesheet even before dirty bookkeeping catches up', async () => {
        const stylesheetTab = {
            id: 'notes/styles/print.css',
            type: 'file',
            path: 'notes/styles/print.css',
            mtime: 11,
            dirty: false,
        };
        mockState.openTabs = [stylesheetTab];
        mockState.activeTabId = stylesheetTab.id;

        await openPDFPreview({ path: 'notes/report.md', title: 'report.md' });
        await waitForPreview();
        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: stylesheetTab.path, content: 'body { background: black; color: yellow; }' },
        }));
        await new Promise(resolve => setTimeout(resolve, 360));

        document.querySelector('[data-action="generate-pdf"]').click();
        await waitForPreview();

        expect(saveFileSnapshot).toHaveBeenCalledWith(
            stylesheetTab,
            'body { background: black; color: yellow; }'
        );
        expect(exportMarkdownToPDF).toHaveBeenCalledWith(expect.objectContaining({
            path: 'notes/report.md',
            content: expect.stringContaining('# Report'),
        }));
    });
});
