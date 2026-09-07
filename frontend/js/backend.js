/**
 * Native Wails backend access.
 *
 * Figaro binds App directly through Wails. This module deliberately exposes
 * the native PascalCase method names rather than maintaining a compatibility
 * translation layer. Browser-only debugging can install an explicit mock
 * backend without pretending to be a desktop runtime.
 */

import { assertBackendContract, missingBackendMethods } from './backendContract.js';

const debugBackendKey = '__figaroDebugBackend';

function nativeBackend() {
    const app = window.go?.desktop?.App;
    return app && typeof app === 'object' ? app : null;
}

export function hasBackend() {
    const app = nativeBackend() || window[debugBackendKey];
    return Boolean(app) && missingBackendMethods(app).length === 0;
}

export function backend() {
    const app = nativeBackend() || window[debugBackendKey];
    if (!app) {
        throw new Error('Figaro backend is not connected');
    }
    return app;
}

export function installDebugBackend(app) {
    window[debugBackendKey] = assertBackendContract(app, 'Debug backend');
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
