/**
 * Status Bar - Simple status text display
 */

const delayedActivities = new Set();

function clearStatusAction() {
    const action = document.getElementById('status-action');
    if (!action) return;
    action.hidden = true;
    action.disabled = false;
    action.textContent = '';
    action.removeAttribute('aria-label');
    action.onclick = null;
}

function updateActivitySpinner() {
    const spinner = document.getElementById('status-activity-spinner');
    if (!spinner) return;
    const revealed = [...delayedActivities].some(activity => activity.visible);
    const continuing = !spinner.hidden && delayedActivities.size > 0;
    spinner.hidden = !(revealed || continuing);
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

export { statusBar };
export default statusBar;
