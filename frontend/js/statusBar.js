/**
 * Status Bar - Simple status text display
 */

import { statusBarPresentationModel } from './core/statusBarPresentationModel.js';

const delayedActivities = new Set();
let presentationInitialized = false;
let observedVaultPanel = null;
let vaultLoadingObserver = null;
let editorScaleRevealTimer = null;

function editorOwnsFocus() {
    return Boolean(document.activeElement?.closest?.('#editor-container .cm-content'));
}

function syncWritingRestPresentation() {
    const footer = document.getElementById('status-bar');
    if (!footer) return;
    const presentation = statusBarPresentationModel({
        editorFocused: editorOwnsFocus(),
        statusText: document.getElementById('status-text')?.textContent || '',
        hasAction: document.querySelector('.status-left')?.dataset.hasAction === 'true',
        activityVisible: !document.getElementById('status-activity-spinner')?.hidden,
        vaultLoading: !document.getElementById('vault-loading-panel')?.hidden,
    });
    footer.dataset.applicationIdle = String(presentation.applicationIdle);
    footer.dataset.writingRest = String(presentation.writingRest);
}

function syncEditorSideReveal(event) {
    const footer = document.getElementById('status-bar');
    if (!footer) return;
    const scroller = event.target?.closest?.('#editor-container .cm-scroller');
    const reveal = Boolean(scroller && !event.target?.closest?.('.cm-content'));
    const value = String(reveal);
    if (footer.dataset.editorSideReveal !== value) footer.dataset.editorSideReveal = value;
}

function initStatusBarPresentation() {
    if (!presentationInitialized) {
        document.addEventListener('focusin', syncWritingRestPresentation);
        document.addEventListener('focusout', () => Promise.resolve().then(syncWritingRestPresentation));
        document.addEventListener('pointermove', syncEditorSideReveal, { passive: true });
        presentationInitialized = true;
    }
    const vaultPanel = document.getElementById('vault-loading-panel');
    if (vaultPanel !== observedVaultPanel && typeof MutationObserver === 'function') {
        vaultLoadingObserver?.disconnect();
        observedVaultPanel = vaultPanel;
        vaultLoadingObserver = vaultPanel ? new MutationObserver(syncWritingRestPresentation) : null;
        vaultLoadingObserver?.observe(vaultPanel, {
            attributes: true,
            attributeFilter: ['hidden'],
        });
    }
    syncWritingRestPresentation();
}

function updateApplicationStatusPresentation(text) {
    const region = document.querySelector('.status-left');
    if (!region) return;
    const message = String(text || 'Ready');
    region.dataset.applicationActive = String(message !== 'Ready');
    region.title = message;
    syncWritingRestPresentation();
}

function clearStatusAction() {
    const action = document.getElementById('status-action');
    const region = document.querySelector('.status-left');
    if (region) region.dataset.hasAction = 'false';
    if (!action) return;
    action.hidden = true;
    action.disabled = false;
    action.textContent = '';
    action.removeAttribute('aria-label');
    action.onclick = null;
    syncWritingRestPresentation();
}

function updateActivitySpinner() {
    const spinner = document.getElementById('status-activity-spinner');
    if (!spinner) return;
    const revealed = [...delayedActivities].some(activity => activity.visible);
    const continuing = !spinner.hidden && delayedActivities.size > 0;
    spinner.hidden = !(revealed || continuing);
    syncWritingRestPresentation();
}

const statusBar = {
    /**
     * Set status text
     * @param {string} text - Status message
     */
    set(text) {
        clearStatusAction();
        const el = document.getElementById('status-text');
        if (el) {
            el.textContent = text;
            el.title = text;
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.setAttribute('aria-atomic', 'true');
        }
        updateApplicationStatusPresentation(text);
    },

    /** Set a status message with one adjacent keyboard-operable action. */
    setWithAction(text, label, onActivate, { ariaLabel = '' } = {}) {
        this.set(text);
        const action = document.getElementById('status-action');
        if (!action || typeof onActivate !== 'function') return;
        action.textContent = label;
        if (ariaLabel) action.setAttribute('aria-label', ariaLabel);
        action.onclick = event => onActivate(event);
        action.hidden = false;
        const region = document.querySelector('.status-left');
        if (region) region.dataset.hasAction = 'true';
        syncWritingRestPresentation();
    },

    /** Keep the quiet footer's one essential document metric current. */
    setWritingSummary(text) {
        const region = document.querySelector('.status-right');
        if (region) region.dataset.writingSummary = String(text || '0 words');
    },

    /** Briefly reveal the quiet footer after a modified-wheel scale gesture. */
    revealEditorScale(duration = 3000) {
        const footer = document.getElementById('status-bar');
        if (!footer) return false;
        footer.dataset.editorScaleReveal = 'true';
        if (editorScaleRevealTimer !== null) clearTimeout(editorScaleRevealTimer);
        editorScaleRevealTimer = setTimeout(() => {
            editorScaleRevealTimer = null;
            if (footer.isConnected) footer.dataset.editorScaleReveal = 'false';
        }, Math.max(0, Number(duration) || 0));
        return true;
    },
    /**
     * Clear status (set to Ready)
     */
    clear() {
        this.set('Ready');
    },

    /** Clear one message later without overwriting newer activity. */
    clearAfter(delay, expectedText) {
        const currentText = expectedText ?? document.getElementById('status-text')?.textContent;
        setTimeout(() => {
            const el = document.getElementById('status-text');
            if (el?.textContent === currentText) this.clear();
        }, delay);
    },

    /**
     * Show the shared indeterminate spinner only if an operation outlasts its
     * delay. The returned idempotent callback clears that operation without
     * hiding another overlapping activity.
     */
    beginDelayedActivity(delay = 1000) {
        const activity = { visible: false, timer: 0, finished: false };
        delayedActivities.add(activity);
        activity.timer = setTimeout(() => {
            if (activity.finished) return;
            activity.visible = true;
            updateActivitySpinner();
        }, Math.max(0, Number(delay) || 0));

        return () => {
            if (activity.finished) return;
            activity.finished = true;
            clearTimeout(activity.timer);
            delayedActivities.delete(activity);
            updateActivitySpinner();
        };
    }
};

export { initStatusBarPresentation, statusBar };
export default statusBar;
