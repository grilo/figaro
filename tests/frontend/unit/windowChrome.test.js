import { initWindowChrome, resetWindowChromeForTests } from '../frontend/js/windowChrome.js';
import { setState } from '../frontend/js/state.js';

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
});
