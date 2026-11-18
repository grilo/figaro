import { countEditorWork } from './editorDiagnostics.js';
/**
 * Native frameless-window controls shared by every Wails desktop webview.
 *
 * The Go App binding owns actual window operations. This module only wires
 * Figaro's themed chrome to those native methods and never probes GTK state
 * before a real user/native resize has occurred.
 */

import { backend } from './backend.js';
import { getState, subscribe } from './state.js';
import { windowTitleForTab } from './core/windowTitleModel.js';

let initialized = false;
// Until startup installs the save-protecting flow, leaving simply leaves.
const leaveDirectly = async exit => { await (typeof exit === 'function' ? exit() : callNative('WindowClose')); return true; };
let closeRequestHandler = leaveDirectly;
let titleSubscriptions = [];
let nativeTitle = null;

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

/** The native event the host sends when it holds a close for this page to answer. */
export const NATIVE_CLOSE_REQUESTED_EVENT = 'native:close-requested';

/** Tell the host this page received its close request and is answering it. */
export function acknowledgeNativeCloseRequest() {
    return callNative('WindowCloseAcknowledged');
}

/** Tell the host the author chose to keep working, so a later request asks again. */
export function declineNativeCloseRequest() {
    return callNative('WindowCloseDeclined');
}

export function setWindowCloseRequestHandler(handler) {
    closeRequestHandler = typeof handler === 'function' ? handler : leaveDirectly;
}

/**
 * Leave through the unsaved-changes flow, finishing with `exit` instead of
 * closing the window (the restart that installs an update). Resolves true
 * only when Figaro is exiting.
 */
export async function requestApplicationExit(exit) {
    return await closeRequestHandler(exit) === true;
}

function isInteractiveTitlebarTarget(target) {
    return Boolean(target?.closest?.('button, input, textarea, select, a, [role="tab"], [contenteditable="true"]'));
}

const PRIMARY_BUTTON = 1;
const MINIMUM_WINDOW_WIDTH = 800;
const MINIMUM_WINDOW_HEIGHT = 500;

function startNativeCornerResize() {
    try {
        return window.runtime?.WindowStartNativeResize?.('se-resize') === true;
    } catch (_) {
        return false;
    }
}

/**
 * The grip resizes from the bottom-right corner. Where the operating system
 * can resize the frameless window itself (Windows, Linux), the first move of a
 * held press hands the gesture to it; a second resize loop in the page would
 * outlive the native one, because Windows swallows the release that ends it.
 * Elsewhere the page resizes the window, and any move without the primary
 * button down ends that resize.
 */
function installResizeGrip() {
    const grip = document.getElementById('resize-grip');
    if (!grip || grip.dataset.nativeResizeBound) return;
    grip.dataset.nativeResizeBound = 'true';

    let gesture = null;
    const end = event => {
        if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;
        gesture = null;
    };

    grip.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.isPrimary === false) return;
        // Cancelling the press withholds its compatibility mouse events, so
        // the Wails runtime's own border zone cannot start a second resize.
        event.preventDefault();
        event.stopPropagation();
        try { grip.setPointerCapture?.(event.pointerId); } catch (_) { /* pointer already gone */ }
        gesture = { pointerId: event.pointerId, startX: event.screenX, startY: event.screenY, mode: 'armed', size: null };
    });

    grip.addEventListener('pointermove', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        if ((event.buttons & PRIMARY_BUTTON) === 0) {
            gesture = null;
            return;
        }
        if (gesture.mode === 'armed') {
            if (startNativeCornerResize()) {
                gesture = null;
                return;
            }
            const current = gesture;
            current.mode = 'script';
            callNative('WindowGetSize').then(size => {
                if (gesture !== current) return;
                current.size = { w: Number(size?.w) || MINIMUM_WINDOW_WIDTH, h: Number(size?.h) || MINIMUM_WINDOW_HEIGHT };
            });
        }
        // Moves before the starting size is known only count toward the delta.
        if (!gesture.size) return;
        const width = Math.max(MINIMUM_WINDOW_WIDTH, gesture.size.w + event.screenX - gesture.startX);
        const height = Math.max(MINIMUM_WINDOW_HEIGHT, gesture.size.h + event.screenY - gesture.startY);
        callNative('WindowSetSize', width, height);
    });

    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        grip.addEventListener(type, end);
    }
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

function syncWindowTitle() {
    const activeId = getState('activeTabId');
    const activeTab = (getState('openTabs') || []).find(tab => tab.id === activeId) || null;
    const title = windowTitleForTab(activeTab);
    if (document.title !== title) document.title = title;
    if (nativeTitle === title) return;
    try {
        countEditorWork('io.windowTitle');
        const result = backend().WindowSetTitle(title);
        nativeTitle = title;
        Promise.resolve(result).catch(() => {
            if (nativeTitle === title) nativeTitle = null;
        });
    } catch (_) { nativeTitle = null; }
}

function installWindowTitleSync() {
    titleSubscriptions = [
        subscribe('activeTabId', syncWindowTitle, 'window-title'),
        subscribe('tabPresentation', syncWindowTitle, 'window-title'),
    ];
    syncWindowTitle();
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
    installWindowTitleSync();
}

export function resetWindowChromeForTests() {
    for (const unsubscribe of titleSubscriptions) unsubscribe?.();
    titleSubscriptions = [];
    nativeTitle = null;
    initialized = false;
    closeRequestHandler = leaveDirectly;
}
