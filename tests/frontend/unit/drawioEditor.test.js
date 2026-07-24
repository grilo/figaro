jest.mock('../frontend/js/tabManager.js', () => ({
    markTabDirty: jest.fn(),
    saveFileSnapshot: jest.fn(),
}));

jest.mock('../frontend/js/fileTree.js', () => ({
    refreshFileTree: jest.fn(),
}));

jest.mock('../frontend/js/dialogs.js', () => ({
    errorDialog: jest.fn().mockResolvedValue(),
}));

import { errorDialog } from '../frontend/js/dialogs.js';
import { refreshFileTree } from '../frontend/js/fileTree.js';
import { markTabDirty, saveFileSnapshot } from '../frontend/js/tabManager.js';
import { disposeDrawioTab, drawioEditorOrigin, drawioExportTimeoutMs, renderDrawioTab } from '../frontend/js/drawio.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function sendEditorMessage(frame, message) {
    window.dispatchEvent(new MessageEvent('message', {
        origin: drawioEditorOrigin,
        source: frame.contentWindow,
        data: JSON.stringify(message),
    }));
}

describe('draw.io editor protocol', () => {
    let panel;
    let consoleError;

    beforeEach(() => {
        document.body.innerHTML = '';
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        panel = document.createElement('div');
        document.body.appendChild(panel);
        window.go = {
            main: {
                App: {
                ReadDiagram: jest.fn().mockResolvedValue({
                    path: 'Diagrams/flow.drawio.svg',
                    mtime: 10,
                    content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                }),
                },
            },
        };
        saveFileSnapshot.mockResolvedValue({ success: true, mtime: 11 });
        jest.clearAllMocks();
    });

    afterEach(() => {
        disposeDrawioTab(panel);
        panel.remove();
        document.documentElement.style.removeProperty('--bg-color');
        consoleError.mockRestore();
    });

    test('loads source SVG, turns a Save into an editable SVG export, then persists it', async () => {
        const tab = { id: 'Diagrams/flow.drawio.svg', path: 'Diagrams/flow.drawio.svg', title: 'flow.drawio.svg', mtime: 0 };
        await renderDrawioTab(panel, tab);

        const frame = panel.querySelector('.drawio-frame');
        expect(frame).not.toBeNull();
        const postMessage = jest.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});

        sendEditorMessage(frame, { event: 'init' });
        const loadMessage = JSON.parse(postMessage.mock.calls[0][0]);
        expect(loadMessage).toEqual(expect.objectContaining({ action: 'load', autosave: 1, title: 'flow.drawio.svg' }));
        expect(loadMessage.xml).toMatch(/^data:image\/svg\+xml;base64,/);

        sendEditorMessage(frame, { event: 'autosave' });
        await flush();
        expect(markTabDirty).toHaveBeenCalledWith(tab.id);

        const messagesBeforeSave = postMessage.mock.calls.length;
        sendEditorMessage(frame, { event: 'save', xml: '<mxGraphModel />' });
        const exportMessage = JSON.parse(postMessage.mock.calls.at(-1)[0]);
        expect(exportMessage).toEqual(expect.objectContaining({ action: 'export', format: 'xmlsvg' }));
        expect(exportMessage.xml).toBeUndefined();
        expect(postMessage.mock.calls.slice(messagesBeforeSave).map(([message]) => JSON.parse(message))).toEqual([
            expect.objectContaining({ action: 'export', format: 'xmlsvg', spinKey: 'saving' }),
        ]);

        const savedSVG = '<svg xmlns="http://www.w3.org/2000/svg"><content>diagram</content></svg>';
        sendEditorMessage(frame, { event: 'export', data: savedSVG });
        await flush();
        await flush();

        expect(saveFileSnapshot).toHaveBeenCalledWith(tab, savedSVG);
        expect(refreshFileTree).toHaveBeenCalled();
    });

    test('keeps the themed loader until Draw.io finishes loading, edits dark, and exports light SVG', async () => {
        document.documentElement.style.setProperty('--bg-color', '#1a1816');
        const tab = { id: 'Diagrams/flow.drawio.svg', path: 'Diagrams/flow.drawio.svg', title: 'flow.drawio.svg', mtime: 0 };
        await renderDrawioTab(panel, tab);

        const frame = panel.querySelector('.drawio-frame');
        const stage = panel.querySelector('[data-drawio-stage]');
        const loading = panel.querySelector('[data-drawio-loading]');
        const postMessage = jest.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});

        expect(loading).not.toBeNull();
        expect(loading.hidden).toBe(false);
        expect(stage.getAttribute('aria-busy')).toBe('true');
        expect(loading.querySelector('[role="progressbar"]').getAttribute('aria-valuetext')).toBe('Connecting to diagrams.net…');

        sendEditorMessage(frame, { event: 'init' });
        expect(JSON.parse(postMessage.mock.calls.at(-1)[0])).toEqual(expect.objectContaining({
            action: 'load',
            dark: true,
        }));
        expect(loading.querySelector('[role="progressbar"]').getAttribute('aria-valuetext')).toBe('Preparing editable canvas…');

        sendEditorMessage(frame, { event: 'load' });
        expect(loading.hidden).toBe(true);
        expect(stage.getAttribute('aria-busy')).toBe('false');

        sendEditorMessage(frame, { event: 'save', xml: '<mxGraphModel />' });
        expect(JSON.parse(postMessage.mock.calls.at(-1)[0])).toEqual(expect.objectContaining({
            action: 'export',
            format: 'xmlsvg',
            theme: 'light',
            keepTheme: false,
        }));
    });

    test('records metadata-only protocol diagnostics when Draw.io tracing is enabled', async () => {
        window.__figaroDrawioDebug = true;
        const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const tab = { id: 'Diagrams/flow.drawio.svg', path: 'Diagrams/flow.drawio.svg', title: 'flow.drawio.svg', mtime: 0 };
            await renderDrawioTab(panel, tab);

            const frame = panel.querySelector('.drawio-frame');
            jest.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
            sendEditorMessage(frame, { event: 'init' });

            expect(window.__figaroDrawioProtocolTrace).toEqual(expect.arrayContaining([
                expect.objectContaining({ stage: 'received', event: 'init' }),
                expect.objectContaining({ stage: 'sent', action: 'load', xmlBytes: expect.any(Number) }),
            ]));
            expect(JSON.stringify(window.__figaroDrawioProtocolTrace)).not.toContain('<svg');
        } finally {
            consoleLog.mockRestore();
            delete window.__figaroDrawioDebug;
            delete window.__figaroDrawioProtocolTrace;
        }
    });

    test('clears a rejected export spinner and lets the user save again', async () => {
        const tab = { id: 'Diagrams/flow.drawio.svg', path: 'Diagrams/flow.drawio.svg', title: 'flow.drawio.svg', mtime: 0 };
        await renderDrawioTab(panel, tab);

        const frame = panel.querySelector('.drawio-frame');
        const postMessage = jest.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
        sendEditorMessage(frame, { event: 'init' });
        sendEditorMessage(frame, { event: 'save', xml: '<mxGraphModel />' });

        expect(panel._drawioSession.saving).toBe(true);
        sendEditorMessage(frame, { event: 'error', message: 'Export failed upstream' });
        await Promise.resolve();

        expect(panel._drawioSession.saving).toBe(false);
        expect(panel.querySelector('[data-drawio-status]').textContent).toBe('Save failed — try Save again');
        expect(errorDialog).toHaveBeenCalledWith('Couldn’t save diagram', expect.objectContaining({ message: 'Export failed upstream' }), expect.any(String));
        expect(saveFileSnapshot).not.toHaveBeenCalled();
        expect(postMessage.mock.calls.map(([message]) => JSON.parse(message))).toContainEqual({ action: 'spinner', show: false });

        sendEditorMessage(frame, { event: 'save', xml: '<mxGraphModel />' });
        expect(JSON.parse(postMessage.mock.calls.at(-1)[0])).toEqual(expect.objectContaining({
            action: 'export',
            format: 'xmlsvg',
        }));
    });

    test('times out a missing export response instead of leaving Save blocked indefinitely', async () => {
        jest.useFakeTimers();
        try {
            const tab = { id: 'Diagrams/flow.drawio.svg', path: 'Diagrams/flow.drawio.svg', title: 'flow.drawio.svg', mtime: 0 };
            await renderDrawioTab(panel, tab);

            const frame = panel.querySelector('.drawio-frame');
            const postMessage = jest.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
            sendEditorMessage(frame, { event: 'init' });
            sendEditorMessage(frame, { event: 'save', xml: '<mxGraphModel />' });
            jest.advanceTimersByTime(drawioExportTimeoutMs);
            await Promise.resolve();

            expect(panel._drawioSession.saving).toBe(false);
            expect(panel.querySelector('[data-drawio-status]').textContent).toBe('Save failed — try Save again');
            expect(errorDialog).toHaveBeenCalledWith('Couldn’t save diagram', expect.objectContaining({ message: expect.stringMatching(/did not finish exporting/i) }), expect.any(String));
            expect(postMessage.mock.calls.map(([message]) => JSON.parse(message))).toContainEqual({ action: 'spinner', show: false });
        } finally {
            jest.useRealTimers();
        }
    });
});
