/**
 * Save every dirty document before a native window close. Closing is allowed
 * only when each requested write succeeds and no newer edit remains dirty.
 */
export async function saveDirtyDocumentsBeforeExit({
    tabs = [],
    activeId = null,
    activeContent,
    save,
    currentTabs = () => tabs,
} = {}) {
    for (const tab of tabs) {
        if (!tab?.dirty || tab.type !== 'file') continue;
        const content = tab.id === activeId ? activeContent() : tab._content;
        if (typeof content !== 'string') return false;
        try {
            const result = await save(tab, content, { failurePrompt: 'always' });
            if (!result?.success || tab.dirty) return false;
        } catch (_) {
            return false;
        }
    }
    return !currentTabs().some(tab => tab?.dirty && tab.type === 'file');
}
