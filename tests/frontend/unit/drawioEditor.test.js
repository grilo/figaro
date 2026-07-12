jest.mock('../frontend/js/tabManager.js', () => ({
    markTabDirty: jest.fn(),
    saveFileSnapshot: jest.fn(),
}));

jest.mock('../frontend/js/fileTree.js', () => ({
    refreshFileTree: jest.fn(),
}));

import { refreshFileTree } from '../frontend/js/fileTree.js';
import { markTabDirty, saveFileSnapshot } from '../frontend/js/tabManager.js';
import { disposeDrawioTab, drawioEditorOrigin, renderDrawioTab } from '../frontend/js/drawio.js';

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

    beforeEach(() => {
        document.body.innerHTML = '';
        panel = document.createElement('div');
        document.body.appendChild(panel);
        window.pywebview = {
            api: {
                read_diagram: jest.fn().mockResolvedValue({
                    path: 'Diagrams/flow.drawio.svg',
                    mtime: 10,
                    content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                }),
            },
        };
        saveFileSnapshot.mockResolvedValue({ success: true, mtime: 11 });
        jest.clearAllMocks();
    });

    afterEach(() => {
        disposeDrawioTab(panel);
        panel.remove();
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

        sendEditorMessage(frame, { event: 'save', xml: '<mxGraphModel />' });
        const exportMessage = JSON.parse(postMessage.mock.calls.at(-1)[0]);
        expect(exportMessage).toEqual(expect.objectContaining({ action: 'export', format: 'xmlsvg', xml: '<mxGraphModel />' }));

        const savedSVG = '<svg xmlns="http://www.w3.org/2000/svg"><content>diagram</content></svg>';
        sendEditorMessage(frame, { event: 'export', data: savedSVG });
        await flush();
        await flush();

        expect(saveFileSnapshot).toHaveBeenCalledWith(tab, savedSVG);
        expect(refreshFileTree).toHaveBeenCalled();
    });
});
