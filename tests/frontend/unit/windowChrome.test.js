import {
    initWindowChrome, resetWindowChromeForTests, requestApplicationExit, setWindowCloseRequestHandler,
    acknowledgeNativeCloseRequest, declineNativeCloseRequest,
} from '../frontend/js/windowChrome.js';
import { getState, setState } from '../frontend/js/state.js';

describe('native window chrome', () => {
    beforeEach(() => {
        resetWindowChromeForTests();
        setState('openTabs', []);
        setState('activeTabId', null);
        document.body.innerHTML = `
            <header class="top-bar">
                <button id="topbar-action"></button>
                <div id="document-tab" role="tab" tabindex="0">Document</div>
            </header>
            <button id="win-minimize"></button><button id="win-maximize"></button><button id="win-close"></button>
            <span id="resize-grip"></span>
        `;
        window.go = {
            desktop: {
                App: {
                    GetFileTree: jest.fn(),
                    WindowMinimize: jest.fn(),
                    WindowMaximize: jest.fn(),
                    WindowClose: jest.fn(),
                    WindowCaptureState: jest.fn(),
                    WindowGetSize: jest.fn().mockResolvedValue({ w: 1000, h: 700 }),
                    WindowSetSize: jest.fn(),
                    WindowSetTitle: jest.fn(),
                },
            },
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('binds controls to Wails and captures state only after a real resize', async () => {
        jest.useFakeTimers();
        initWindowChrome();

        document.getElementById('win-minimize').click();
        document.getElementById('win-maximize').click();
        document.getElementById('document-tab').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        document.querySelector('.top-bar').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(window.go.desktop.App.WindowMinimize).toHaveBeenCalledTimes(1);
        expect(window.go.desktop.App.WindowMaximize).toHaveBeenCalledTimes(2);
        expect(window.go.desktop.App.WindowCaptureState).not.toHaveBeenCalled();

        window.dispatchEvent(new Event('resize'));
        jest.advanceTimersByTime(249);
        expect(window.go.desktop.App.WindowCaptureState).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(window.go.desktop.App.WindowCaptureState).toHaveBeenCalledTimes(1);
    });

    function pointer(type, { buttons = 1, x = 0, y = 0 } = {}) {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, screenX: x, screenY: y });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        Object.defineProperty(event, 'isPrimary', { value: true });
        document.getElementById('resize-grip').dispatchEvent(event);
        return event;
    }

    test('the resize grip hands a held press to the native corner resize and then lets go', () => {
        const startNative = jest.fn(() => true);
        window.runtime = { WindowStartNativeResize: startNative };
        try {
            initWindowChrome();
            const press = pointer('pointerdown', { x: 100, y: 100 });
            expect(press.defaultPrevented).toBe(true);
            expect(startNative).not.toHaveBeenCalled();

            pointer('pointermove', { x: 104, y: 103 });
            expect(startNative).toHaveBeenCalledTimes(1);
            expect(startNative).toHaveBeenCalledWith('se-resize');

            // Windows swallows the release that ends its resize; later moves,
            // held or not, must not keep resizing the window.
            pointer('pointermove', { buttons: 0, x: 300, y: 300 });
            pointer('pointermove', { buttons: 1, x: 320, y: 320 });
            expect(startNative).toHaveBeenCalledTimes(1);
            expect(window.go.desktop.App.WindowSetSize).not.toHaveBeenCalled();
        } finally {
            delete window.runtime;
        }
    });

    test('without a native resize the grip resizes from the real size and stops when the button is up', async () => {
        const app = window.go.desktop.App;
        initWindowChrome();
        pointer('pointerdown', { x: 100, y: 100 });
        pointer('pointermove', { x: 110, y: 105 });
        expect(app.WindowGetSize).toHaveBeenCalledTimes(1);
        expect(app.WindowSetSize).not.toHaveBeenCalled();
        await Promise.resolve();
        await Promise.resolve();

        pointer('pointermove', { x: 150, y: 120 });
        expect(app.WindowSetSize).toHaveBeenLastCalledWith(1050, 720);

        // A release the page never saw: the first move without the button ends it.
        pointer('pointermove', { buttons: 0, x: 400, y: 400 });
        pointer('pointermove', { buttons: 1, x: 420, y: 420 });
        expect(app.WindowSetSize).toHaveBeenCalledTimes(1);

        pointer('pointerdown', { x: 100, y: 100 });
        pointer('pointerup', { buttons: 0, x: 100, y: 100 });
        pointer('pointermove', { x: 200, y: 200 });
        expect(app.WindowGetSize).toHaveBeenCalledTimes(1);
    });

    test('leaving another way uses the installed exit flow and answers native close requests through the host', async () => {
        const restart = jest.fn();
        // Before startup installs the flow, leaving simply leaves.
        await expect(requestApplicationExit(restart)).resolves.toBe(true);
        expect(restart).toHaveBeenCalledTimes(1);
        expect(window.go.desktop.App.WindowClose).not.toHaveBeenCalled();

        const flow = jest.fn(async () => false);
        setWindowCloseRequestHandler(flow);
        await expect(requestApplicationExit(restart)).resolves.toBe(false);
        expect(flow).toHaveBeenCalledWith(restart);
        expect(restart).toHaveBeenCalledTimes(1);

        window.go.desktop.App.WindowCloseAcknowledged = jest.fn();
        window.go.desktop.App.WindowCloseDeclined = jest.fn();
        await acknowledgeNativeCloseRequest();
        await declineNativeCloseRequest();
        expect(window.go.desktop.App.WindowCloseAcknowledged).toHaveBeenCalledTimes(1);
        expect(window.go.desktop.App.WindowCloseDeclined).toHaveBeenCalledTimes(1);
    });

    test('keeps the browser and native window titles aligned with the active document', () => {
        initWindowChrome();
        expect(document.title).toBe('Figaro');
        expect(window.go.desktop.App.WindowSetTitle).toHaveBeenLastCalledWith('Figaro');

        setState('openTabs', [{ id: 'brief', title: 'Project brief.md', type: 'file' }]);
        setState('activeTabId', 'brief');

        expect(document.title).toBe('Project brief.md — Figaro');
        expect(window.go.desktop.App.WindowSetTitle).toHaveBeenLastCalledWith('Project brief.md — Figaro');

        setState('activeTabId', null);
        expect(document.title).toBe('Figaro');
        expect(window.go.desktop.App.WindowSetTitle).toHaveBeenLastCalledWith('Figaro');
    });

    test('cursor and buffer publications do not cross the native title boundary again', () => {
        setState('openTabs', [{ id: 'note', title: 'Note.md', type: 'file' }]);
        setState('activeTabId', 'note');
        initWindowChrome();
        const title = window.go.desktop.App.WindowSetTitle;
        title.mockClear();
        for (let head = 1; head <= 20; head++) {
            setState('openTabs', [{ ...getState('openTabs')[0], cursorState: { anchor: head, head }, _content: `Edit ${head}` }]);
        }
        expect(title).not.toHaveBeenCalled();
        setState('openTabs', [{ ...getState('openTabs')[0], title: 'Renamed.md' }]);
        expect(title).toHaveBeenCalledTimes(1);
        expect(title).toHaveBeenLastCalledWith('Renamed.md — Figaro');
    });

    test('a failed native title update can retry on the next publication', async () => {
        const title = window.go.desktop.App.WindowSetTitle;
        title.mockRejectedValueOnce(new Error('Window is not ready'));
        initWindowChrome();
        await Promise.resolve();
        setState('activeTabId', 'workspace-home');
        expect(title).toHaveBeenCalledTimes(2);
        expect(document.title).toBe('Figaro');
    });
});
