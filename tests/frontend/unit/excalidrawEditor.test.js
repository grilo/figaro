import {
    configureExcalidrawWorkspace,
    disposeExcalidrawTab,
    renderExcalidrawTab,
    trackExcalidrawSurface,
} from '../frontend/js/excalidraw.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const path = 'Sketches/board.excalidraw.svg';
const savedSVG = '<svg><!-- payload-type:application/vnd.excalidraw+json --></svg>';

function createFakeVendor() {
    const vendor = {
        editors: [],
        loadSceneFromSVG: jest.fn(async svg => (svg.trim() ? { elements: [{ id: 'a' }] } : null)),
        mount: jest.fn((element, options) => {
            const editor = {
                element,
                options,
                theme: options.theme,
                setTheme: jest.fn(theme => { editor.theme = theme; }),
                replaceScene: jest.fn(),
                exportSVG: jest.fn(async () => '<svg>exported</svg>'),
                unmount: jest.fn(),
                change: version => options.onChange({ version }),
            };
            vendor.editors.push(editor);
            return editor;
        }),
    };
    return vendor;
}

describe('Excalidraw drawing tab', () => {
    let panel;
    let tabs;
    let vendor;
    let ports;
    let consoleError;

    const tab = () => tabs.find(candidate => candidate.id === panel.dataset.tabId);

    beforeEach(() => {
        document.body.innerHTML = '';
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        tabs = [{ id: path, type: 'excalidraw', path, title: 'board.excalidraw.svg', mtime: 1, dirty: false }];
        panel = document.createElement('div');
        panel.dataset.tabId = path;
        document.body.appendChild(panel);
        vendor = createFakeVendor();
        window.FigaroExcalidraw = vendor;
        window.go = { desktop: { App: {
            ReadDiagram: jest.fn().mockResolvedValue({ path, mtime: 10, content: savedSVG }),
        } } };
        ports = {
            findTab: jest.fn(id => tabs.find(candidate => candidate.id === id) || null),
            recordTabEdit: jest.fn(id => {
                tabs = tabs.map(candidate => candidate.id === id
                    ? { ...candidate, dirty: true, _editGeneration: (candidate._editGeneration || 0) + 1 }
                    : candidate);
            }),
            recordTabMtime: jest.fn((id, mtime) => {
                tabs = tabs.map(candidate => candidate.id === id ? { ...candidate, mtime } : candidate);
            }),
            saveFileSnapshot: jest.fn(async () => ({ success: true, mtime: 11 })),
            refreshFileTree: jest.fn(async () => {}),
        };
        configureExcalidrawWorkspace(ports);
    });

    afterEach(() => {
        disposeExcalidrawTab(panel);
        delete window.FigaroExcalidraw;
        consoleError.mockRestore();
        jest.restoreAllMocks();
    });

    async function openDrawing() {
        const rendering = renderExcalidrawTab(panel, tab());
        expect(panel.querySelector('[role="status"] .ui-spinner')).not.toBeNull();
        await rendering;
        const editor = vendor.editors.at(-1);
        editor.change(3); // Excalidraw reports the loaded scene once.
        return editor;
    }

    test('opens the embedded scene and records the file time without marking it edited', async () => {
        const editor = await openDrawing();
        expect(window.go.desktop.App.ReadDiagram).toHaveBeenCalledWith(path);
        expect(vendor.loadSceneFromSVG).toHaveBeenCalledWith(savedSVG);
        expect(editor.options.scene).toEqual({ elements: [{ id: 'a' }] });
        expect(ports.recordTabMtime).toHaveBeenCalledWith(path, 10);
        expect(ports.recordTabEdit).not.toHaveBeenCalled();
        editor.change(3);
        expect(ports.recordTabEdit).not.toHaveBeenCalled();
        editor.change(4);
        expect(ports.recordTabEdit).toHaveBeenCalledWith(path);
    });

    test('reopening the active tab keeps the mounted editor and its unsaved edits', async () => {
        const editor = await openDrawing();
        editor.change(4);
        await renderExcalidrawTab(panel, tab());
        expect(vendor.mount).toHaveBeenCalledTimes(1);
        expect(editor.unmount).not.toHaveBeenCalled();
    });

    test('saves the exported SVG with the edit generation captured before export', async () => {
        const editor = await openDrawing();
        editor.change(4);
        editor.exportSVG.mockImplementation(async () => {
            editor.change(5); // An edit lands while the SVG is being exported.
            return '<svg>exported</svg>';
        });

        const result = await panel._excalidrawSession.save({ failurePrompt: 'always' });

        expect(result).toEqual({ success: true, mtime: 11 });
        expect(ports.saveFileSnapshot).toHaveBeenCalledWith(
            expect.objectContaining({ id: path, _editGeneration: 1 }),
            '<svg>exported</svg>',
            { failurePrompt: 'always', editGeneration: 1 },
        );
        expect(tab()._editGeneration).toBe(2);
        expect(ports.refreshFileTree).toHaveBeenCalled();
    });

    test('a clean drawing is not rewritten', async () => {
        await openDrawing();
        await expect(panel._excalidrawSession.save()).resolves.toMatchObject({ success: true, path });
        expect(ports.saveFileSnapshot).not.toHaveBeenCalled();
    });

    test('saves to the moved path after a rename', async () => {
        const editor = await openDrawing();
        editor.change(4);
        const moved = 'Archive/board.excalidraw.svg';
        tabs = tabs.map(candidate => ({ ...candidate, id: moved, path: moved }));
        panel.dataset.tabId = moved;
        await panel._excalidrawSession.save();
        expect(ports.saveFileSnapshot).toHaveBeenCalledWith(expect.objectContaining({ path: moved }), expect.any(String), expect.any(Object));
    });

    test('reloads a clean drawing changed on disk, but never replaces unsaved edits', async () => {
        const editor = await openDrawing();
        window.go.desktop.App.ReadDiagram.mockResolvedValue({ path, mtime: 20, content: savedSVG });

        document.dispatchEvent(new CustomEvent('vault-filesystem-changed', { detail: { paths: ['Notes/a.md'] } }));
        await flush();
        expect(editor.replaceScene).not.toHaveBeenCalled();

        document.dispatchEvent(new CustomEvent('vault-filesystem-changed', { detail: { paths: [path] } }));
        await flush();
        await flush();
        expect(editor.replaceScene).toHaveBeenCalledWith({ elements: [{ id: 'a' }] });
        expect(tab().mtime).toBe(20);

        editor.change(7);
        editor.change(8);
        window.go.desktop.App.ReadDiagram.mockResolvedValue({ path, mtime: 30, content: savedSVG });
        document.dispatchEvent(new CustomEvent('vault-filesystem-changed'));
        await flush();
        await flush();
        expect(editor.replaceScene).toHaveBeenCalledTimes(1);
    });

    test('follows the app appearance and stops listening once disposed', async () => {
        const editor = await openDrawing();
        expect(editor.theme).toBe('dark');
        document.documentElement.style.setProperty('--bg-color', '#fafafa');
        const surface = document.createElement('div');
        trackExcalidrawSurface(surface);
        expect(surface.dataset.figaroSurface).toBe('light');
        document.dispatchEvent(new CustomEvent('figaro:appearance-changed'));
        expect(editor.setTheme).toHaveBeenLastCalledWith('light');

        disposeExcalidrawTab(panel);
        expect(editor.unmount).toHaveBeenCalledTimes(1);
        document.documentElement.style.setProperty('--bg-color', '#101010');
        document.dispatchEvent(new CustomEvent('figaro:appearance-changed'));
        expect(editor.setTheme).toHaveBeenCalledTimes(1);
        expect(surface.dataset.figaroSurface).toBe('dark');
        document.documentElement.style.removeProperty('--bg-color');
    });

    test('shows an error notice instead of a blank editor for an SVG without a scene', async () => {
        vendor.loadSceneFromSVG.mockRejectedValue(new Error('This SVG has no embedded Excalidraw scene, so it cannot be edited here.'));
        await renderExcalidrawTab(panel, tab());
        const notice = panel.querySelector('.ui-notice.ui-notice--danger[role="alert"]');
        expect(notice.textContent).toContain('Couldn’t open this drawing');
        expect(notice.textContent).toContain('no embedded Excalidraw scene');
        expect(vendor.mount).not.toHaveBeenCalled();
        expect(ports.saveFileSnapshot).not.toHaveBeenCalled();
    });

    test('reports a missing vendored editor', async () => {
        delete window.FigaroExcalidraw;
        await renderExcalidrawTab(panel, tab());
        expect(panel.textContent).toContain('The Excalidraw editor did not load');
    });
});
