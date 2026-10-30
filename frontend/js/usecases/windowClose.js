import { readTabContent } from './tabContent.js';

/** Notes and Excalidraw drawings hold unsaved edits that closing must not lose. */
export function isUnsavedDocumentTab(tab) {
    return Boolean(tab?.dirty) && (tab.type === 'file' || tab.type === 'excalidraw');
}

/**
 * Save every dirty document before a native window close. Closing is allowed
 * only when each requested write succeeds and no newer edit remains dirty.
 */
export async function saveDirtyDocumentsBeforeExit({
    tabs = [],
    activeId = null,
    activeContent,
    save,
    saveDrawing = async () => null,
    currentTabs = () => tabs,
} = {}) {
    for (const tab of tabs) {
        if (!isUnsavedDocumentTab(tab)) continue;
        if (tab.type === 'excalidraw') {
            try {
                const result = await saveDrawing(tab, { failurePrompt: 'always' });
                if (!result?.success || currentTabs().find(current => current.id === tab.id)?.dirty) return false;
            } catch (_) {
                return false;
            }
            continue;
        }
        const content = tab.id === activeId ? activeContent() : readTabContent(tab);
        if (typeof content !== 'string') return false;
        try {
            const result = await save(tab, content, { failurePrompt: 'always' });
            if (!result?.success || currentTabs().find(current => current.id === tab.id)?.dirty) return false;
        } catch (_) {
            return false;
        }
    }
    return !currentTabs().some(isUnsavedDocumentTab);
}
