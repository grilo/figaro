/**
 * Native frameless-window controls shared by every Wails desktop webview.
 *
 * The Go App binding owns actual window operations. This module only wires
 * Figaro's themed chrome to those native methods and never probes GTK state
 * before a real user/native resize has occurred.
 */

import { backend } from './backend.js';

let initialized = false;
let closeRequestHandler = () => callNative('WindowClose');

function callNative(method, ...args) {
    try {
        const result = backend()[method](...args);
        return Promise.resolve(result).catch(() => {});
    } catch (_) {
        return Promise.resolve();
    }
}

export function closeNativeWindow() {
    return callNative('WindowClose');
}

export function setWindowCloseRequestHandler(handler) {
    closeRequestHandler = typeof handler === 'function' ? handler : () => closeNativeWindow();
}

function isInteractiveTitlebarTarget(target) {
    return Boolean(target?.closest?.('button, input, textarea, select, a, [contenteditable="true"]'));
}

function installResizeGrip() {
    const grip = document.getElementById('resize-grip');
    if (!grip || grip.dataset.nativeResizeBound) return;
    grip.dataset.nativeResizeBound = 'true';

    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 800;
    let startH = 600;

    grip.addEventListener('mousedown', event => {
        event.preventDefault();
        event.stopPropagation();
        resizing = true;
        startX = event.screenX;
        startY = event.screenY;
        callNative('WindowGetSize').then(size => {
            if (!size) return;
            startW = Number(size.w) || startW;
            startH = Number(size.h) || startH;
        });
    });

    window.addEventListener('mousemove', event => {
        if (!resizing) return;
        const width = Math.max(800, startW + event.screenX - startX);
        const height = Math.max(500, startH + event.screenY - startY);
        callNative('WindowSetSize', width, height);
    });

    window.addEventListener('mouseup', () => {
        resizing = false;
    });
}

function installTitleBarDoubleClick() {
    const topBar = document.querySelector('.top-bar');
    if (!topBar || topBar.dataset.nativeTitlebarBound) return;
    topBar.dataset.nativeTitlebarBound = 'true';
    topBar.addEventListener('dblclick', event => {
        if (isInteractiveTitlebarTarget(event.target)) return;
        event.preventDefault();
        callNative('WindowMaximize');
    });
}

function installWindowStateCapture() {
    let timer = null;
    window.addEventListener('resize', () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            // GTK's window does not always exist at DOM-ready time. A real
            // resize is the first safe moment to ask Wails to save its state.
            callNative('WindowCaptureState');
        }, 250);
    }, { passive: true });
}

export function initWindowChrome() {
    if (initialized) return;
    initialized = true;

    document.getElementById('win-minimize')?.addEventListener('click', () => callNative('WindowMinimize'));
    document.getElementById('win-maximize')?.addEventListener('click', () => callNative('WindowMaximize'));
    document.getElementById('win-close')?.addEventListener('click', () => closeRequestHandler());
    installResizeGrip();
    installTitleBarDoubleClick();
    installWindowStateCapture();
}

export function resetWindowChromeForTests() {
    initialized = false;
    closeRequestHandler = () => closeNativeWindow();
}
