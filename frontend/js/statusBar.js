/**
 * Status Bar - Simple status text display
 */

const statusBar = {
    /**
     * Set status text
     * @param {string} text - Status message
     */
    set(text) {
        const el = document.getElementById('status-text');
        if (el) {
            el.textContent = text;
            el.title = text;
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.setAttribute('aria-atomic', 'true');
        }
    },
    
    /**
    
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
    }
};

export { statusBar };
export default statusBar;
