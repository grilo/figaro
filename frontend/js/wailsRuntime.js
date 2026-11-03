/**
 * Wails v3 native runtime adapter.
 *
 * Wails v3 no longer publishes `window.go` or `window.runtime`; bound methods
 * and events come from the @wailsio/runtime module instead. Figaro's
 * frontend, and its tests, consume one small native surface: the bound App
 * facade plus EventsOn, BrowserOpenURL, LogDebug and OnFileDrop. This adapter
 * rebuilds exactly that surface on top of the v3 runtime when Figaro runs in
 * its desktop webview, so browser-only debugging keeps its explicit mock.
 */

import { Browser, Call, Events } from '@wailsio/runtime';
import { BACKEND_METHODS } from './backendContract.js';

/** Fully qualified Go name of the bound App service. */
export const NATIVE_APP_SERVICE = 'figaro/internal/desktop.App';

/** Native file drops arrive as an event carrying viewport coordinates. */
export const NATIVE_FILES_DROPPED_EVENT = 'native:files-dropped';

/** Wails v3 serves Figaro from wails://localhost or http://wails.localhost. */
export function isDesktopWebview(location = globalThis.location) {
    return location?.protocol === 'wails:' || location?.hostname === 'wails.localhost';
}

export function createNativeApp(call = Call.ByName) {
    const app = {};
    for (const name of BACKEND_METHODS) {
        app[name] = (...args) => call(`${NATIVE_APP_SERVICE}.${name}`, ...args);
    }
    return Object.freeze(app);
}

export function createNativeRuntime({
    on = Events.On,
    openURL = Browser.OpenURL,
    // log.js already writes to the console; v3 has no Go-side JS logger.
    debug = () => {},
} = {}) {
    return Object.freeze({
        EventsOn(name, callback) {
            return on(name, event => callback(event?.data));
        },
        BrowserOpenURL(url) {
            return openURL(url);
        },
        LogDebug(message) {
            debug(message);
        },
        // The second argument mirrors the Wails v2 drop-target switch. Figaro
        // routes every drop itself, so the document body is the only target.
        OnFileDrop(callback) {
            return on(NATIVE_FILES_DROPPED_EVENT, event => {
                const drop = event?.data || {};
                callback(Number(drop.x) || 0, Number(drop.y) || 0, Array.isArray(drop.paths) ? drop.paths : []);
            });
        },
    });
}

/**
 * Publish the native surface before application startup reads it, and mark
 * the document so desktop-only chrome such as the frameless resize edges shows.
 */
export function installWailsRuntime(target = globalThis, location = globalThis.location) {
    if (!isDesktopWebview(location)) return false;
    target.go = { desktop: { App: createNativeApp() } };
    target.runtime = createNativeRuntime();
    target.document?.documentElement?.setAttribute('data-desktop-webview', '');
    return true;
}
