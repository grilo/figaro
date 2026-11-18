import { BACKEND_METHODS } from '../../../frontend/js/backendContract.js';
import {
    NATIVE_APP_SERVICE,
    NATIVE_FILES_DROPPED_EVENT,
    createNativeApp,
    createNativeFramelessResize,
    createNativeRuntime,
    installWailsRuntime,
    isDesktopWebview,
} from '../../../frontend/js/wailsRuntime.js';

describe('Wails v3 runtime adapter', () => {
    test('recognises only the origins Wails v3 serves Figaro from', () => {
        expect(isDesktopWebview({ protocol: 'wails:', hostname: 'localhost' })).toBe(true);
        expect(isDesktopWebview({ protocol: 'http:', hostname: 'wails.localhost' })).toBe(true);
        expect(isDesktopWebview({ protocol: 'http:', hostname: 'localhost' })).toBe(false);
        expect(isDesktopWebview({ protocol: 'https:', hostname: 'embed.diagrams.net' })).toBe(false);
    });

    test('calls every bound App method by its fully qualified Go name', async () => {
        const call = jest.fn().mockResolvedValue([{ path: 'Welcome.md' }]);
        const app = createNativeApp(call);

        expect(Object.keys(app).sort()).toEqual([...BACKEND_METHODS].sort());
        await expect(app.GetFileTree()).resolves.toEqual([{ path: 'Welcome.md' }]);
        await app.ReadFile('notes/today.md');
        expect(call).toHaveBeenNthCalledWith(1, `${NATIVE_APP_SERVICE}.GetFileTree`);
        expect(call).toHaveBeenNthCalledWith(2, `${NATIVE_APP_SERVICE}.ReadFile`, 'notes/today.md');
    });

    test('delivers event payloads and native file drops in the v2 callback shapes', () => {
        const listeners = new Map();
        const on = jest.fn((name, listener) => {
            listeners.set(name, listener);
            return () => listeners.delete(name);
        });
        const runtime = createNativeRuntime({ on, openURL: jest.fn() });

        const changed = jest.fn();
        const off = runtime.EventsOn('vault:changed', changed);
        listeners.get('vault:changed')({ name: 'vault:changed', data: { paths: ['a.md'] } });
        expect(changed).toHaveBeenCalledWith({ paths: ['a.md'] });
        off();
        expect(listeners.has('vault:changed')).toBe(false);

        const dropped = jest.fn();
        runtime.OnFileDrop(dropped, false);
        listeners.get(NATIVE_FILES_DROPPED_EVENT)({ data: { x: 40, y: 12, paths: ['/tmp/a.md'] } });
        listeners.get(NATIVE_FILES_DROPPED_EVENT)({ data: {} });
        expect(dropped).toHaveBeenNthCalledWith(1, 40, 12, ['/tmp/a.md']);
        expect(dropped).toHaveBeenNthCalledWith(2, 0, 0, []);
    });

    test('starts the native frameless resize only where Wails offers one', () => {
        const system = os => ({ IsWindows: () => os === 'windows', IsLinux: () => os === 'linux', invoke: jest.fn() });
        const frameless = { GetFlag: key => key === 'frameless' };

        const windows = system('windows');
        expect(createNativeFramelessResize(windows, { GetFlag: () => { throw new Error('no flags'); } })('se-resize')).toBe(true);
        expect(windows.invoke).toHaveBeenCalledWith('wails:resize:se-resize');

        const linux = system('linux');
        expect(createNativeFramelessResize(linux, frameless)('se-resize')).toBe(true);
        expect(createNativeFramelessResize(linux, { GetFlag: () => false })('se-resize')).toBe(false);
        expect(linux.invoke).toHaveBeenCalledTimes(1);

        const mac = system('darwin');
        expect(createNativeFramelessResize(mac, frameless)('se-resize')).toBe(false);
        expect(mac.invoke).not.toHaveBeenCalled();

        const startResize = jest.fn(() => true);
        expect(createNativeRuntime({ on: jest.fn(), startResize }).WindowStartNativeResize('se-resize')).toBe(true);
        expect(startResize).toHaveBeenCalledWith('se-resize');
    });

    test('opens external links through the native browser bridge', () => {
        const openURL = jest.fn();
        createNativeRuntime({ on: jest.fn(), openURL }).BrowserOpenURL('https://example.com/');
        expect(openURL).toHaveBeenCalledWith('https://example.com/');
    });

    test('publishes the native surface only inside the desktop webview', () => {
        const browser = {};
        expect(installWailsRuntime(browser, { protocol: 'http:', hostname: 'localhost' })).toBe(false);
        expect(browser).toEqual({});

        const desktop = { document: document.implementation.createHTMLDocument('') };
        expect(installWailsRuntime(desktop, { protocol: 'wails:', hostname: 'localhost' })).toBe(true);
        expect(typeof desktop.go.desktop.App.GetFileTree).toBe('function');
        expect(typeof desktop.runtime.EventsOn).toBe('function');
        expect(typeof desktop.runtime.OnFileDrop).toBe('function');
        expect(desktop.document.documentElement.hasAttribute('data-desktop-webview')).toBe(true);
    });
});
