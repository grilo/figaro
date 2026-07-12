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
        }
    },
    
    /**
    
    /**
     * Clear status (set to Ready)
     */
    clear() {
        this.set('Ready');
    }
};

export { statusBar };
export default statusBar;
