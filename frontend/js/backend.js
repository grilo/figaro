/**
 * Native Wails backend access.
 *
 * Figaro binds App directly through Wails. This module deliberately exposes
 * the native PascalCase method names rather than maintaining a compatibility
 * translation layer. Browser-only debugging can install an explicit mock
 * backend without pretending to be a desktop runtime.
 */

const debugBackendKey = '__figaroDebugBackend';

function nativeBackend() {
    const app = window.go?.main?.App;
    return app && typeof app === 'object' ? app : null;
}

export function hasBackend() {
    const app = nativeBackend() || window[debugBackendKey];
    return typeof app?.GetFileTree === 'function';
}

export function backend() {
    const app = nativeBackend() || window[debugBackendKey];
    if (!app) {
        throw new Error('Figaro backend is not connected');
    }
    return app;
}

export function installDebugBackend(app) {
    if (!app || typeof app.GetFileTree !== 'function') {
        throw new TypeError('A debug backend must implement GetFileTree');
    }
    window[debugBackendKey] = app;
}

export function clearDebugBackend() {
    delete window[debugBackendKey];
}

export function waitForBackend({ interval = 15 } = {}) {
    return new Promise(resolve => {
        const check = () => {
            if (hasBackend()) {
                resolve(backend());
                return;
            }
            setTimeout(check, interval);
        };
        check();
    });
}
