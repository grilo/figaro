import { getState, subscribe } from './state.js';
import { externalFileNotice } from './core/externalFileModel.js';

function activeTab() {
    const activeId = getState('activeTabId');
    return (getState('openTabs') || []).find(tab => tab.id === activeId) || null;
}

/**
 * Show an info notice above the editor while the active document lives outside
 * the vault, with an action that imports it. The notice changes only when the
 * active document or its identity changes, never while typing.
 */
export function initExternalFileNotice({
    element = document.getElementById('external-file-notice'),
    onImport,
} = {}) {
    if (!element || typeof onImport !== 'function') return () => {};
    const text = element.querySelector('.external-file-notice-text');
    const button = element.querySelector('.external-file-notice-import');
    let shownFor = null;

    function render() {
        const tab = activeTab();
        const notice = externalFileNotice(tab);
        const key = notice ? tab.id : null;
        if (key === shownFor) return;
        shownFor = key;
        element.hidden = !notice;
        if (!notice) return;
        text.textContent = notice.message;
        button.textContent = notice.actionLabel;
        button.setAttribute('aria-label', `${notice.actionLabel}: ${notice.name}`);
    }

    button.addEventListener('click', async () => {
        const tab = activeTab();
        if (!externalFileNotice(tab) || button.disabled) return;
        button.disabled = true;
        try {
            await onImport(tab);
        } finally {
            button.disabled = false;
            render();
        }
    });

    const unsubscribers = [
        subscribe('activeTabId', render, 'external file notice'),
        subscribe('tabPresentation', render, 'external file notice'),
    ];
    render();
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}
