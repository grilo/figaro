import { initWindowChrome, resetWindowChromeForTests } from '../frontend/js/windowChrome.js';

describe('native window chrome', () => {
    beforeEach(() => {
        resetWindowChromeForTests();
        document.body.innerHTML = `
            <header class="top-bar"><button id="topbar-action"></button></header>
            <button id="win-minimize"></button><button id="win-maximize"></button><button id="win-close"></button>
            <span id="resize-grip"></span>
        `;
        window.go = {
            main: {
                App: {
                    GetFileTree: jest.fn(),
                    WindowMinimize: jest.fn(),
                    WindowMaximize: jest.fn(),
                    WindowClose: jest.fn(),
                    WindowCaptureState: jest.fn(),
                    WindowGetSize: jest.fn().mockResolvedValue({ w: 1000, h: 700 }),
                    WindowSetSize: jest.fn(),
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
        document.querySelector('.top-bar').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(window.go.main.App.WindowMinimize).toHaveBeenCalledTimes(1);
        expect(window.go.main.App.WindowMaximize).toHaveBeenCalledTimes(2);
        expect(window.go.main.App.WindowCaptureState).not.toHaveBeenCalled();

        window.dispatchEvent(new Event('resize'));
        jest.advanceTimersByTime(249);
        expect(window.go.main.App.WindowCaptureState).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(window.go.main.App.WindowCaptureState).toHaveBeenCalledTimes(1);
    });
});
