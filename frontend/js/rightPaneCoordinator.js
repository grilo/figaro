/**
 * Own the single-active-mode contract for the shared right pane.
 *
 * Feature adapters register their own cleanup and restoration callbacks. Opening a mode
 * releases the previous owner without either feature knowing the other's
 * event name or lifecycle details.
 */
import { switchRightPaneState } from './core/rightPaneState.js';

const modes = new Map();
let workspace = { activeId: null, selections: {} };

export function registerRightPaneMode(name, close, open) {
    const normalized = String(name || '').trim();
    if (!normalized || typeof close !== 'function') {
        throw new TypeError('Right-pane modes require a name and close callback');
    }
    modes.set(normalized, { close, open });
    return () => {
        if (modes.get(normalized)?.close === close) modes.delete(normalized);
    };
}

export function claimRightPane(name, sidebar = document.getElementById('right-sidebar')) {
    const normalized = String(name || '').trim();
    if (!normalized) throw new TypeError('A right-pane owner is required');
    if (!sidebar) return false;

    const current = String(sidebar.dataset.mode || '');
    if (current && current !== normalized) {
        const close = modes.get(current)?.close;
        if (!close) {
            throw new Error(`Right-pane mode “${current}” has no registered owner`);
        }
        close({ keepSidebarOpen: true, restoreFocus: false });
        if (sidebar.dataset.mode === current) {
            throw new Error(`Right-pane mode “${current}” did not release ownership`);
        }
    }
    return true;
}

export function closeActiveRightPane({
    sidebar = document.getElementById('right-sidebar'),
    ...options
} = {}) {
    const current = String(sidebar?.dataset.mode || '');
    if (!current) return false;
    const close = modes.get(current)?.close;
    if (!close) return false;
    close(options);
    return true;
}

export function switchRightPaneTab(tabId, sidebar = document.getElementById('right-sidebar')) {
    const next = switchRightPaneState(workspace, tabId, sidebar?.classList.contains('open') ? sidebar.dataset.mode : null);
    if (next === workspace) return;
    workspace = next;
    closeActiveRightPane({ sidebar, restoreFocus: false });
}

export async function restoreRightPaneTab(tabId, request) {
    if (workspace.activeId !== tabId) return;
    await modes.get(workspace.selections[tabId])?.open?.(request);
}

export function forgetRightPaneTab(tabId) { delete workspace.selections[tabId]; }

export function resetRightPaneModesForTests() {
    modes.clear();
    workspace = { activeId: null, selections: {} };
}
