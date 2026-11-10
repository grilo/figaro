export function createSaveSnapshot(tab, content, options = {}) {
    if (!tab?.path || typeof content !== 'string') return null;
    return Object.freeze({
        tabId: tab.id || tab.path,
        path: tab.path,
        content,
        generation: options.generation || (tab._saveGeneration || 0) + 1,
        // A caller that prepared content asynchronously passes the generation it captured.
        editGeneration: options.editGeneration ?? (tab._editGeneration || 0),
        expectedMtime: tab.mtime || 0,
        externalFileId: tab.externalFileId || null,
        failurePrompt: options.failurePrompt || 'once',
    });
}

/**
 * Decide which text a save of `tabId` may write. The shared editor answers
 * only for the tab that owns it; every other tab answers from its cached
 * buffer. A tab with neither (still loading, or never mounted) has nothing
 * authoritative to save: 'none' must never become an empty file.
 */
export function saveContentSource({ ownerId = null, tabId, activeTabId = null, hasCachedContent = false } = {}) {
    if (tabId == null) return 'none';
    if (ownerId === tabId) return 'editor';
    // Before any document is mounted the editor still belongs to the active tab.
    if (ownerId == null && activeTabId === tabId && !hasCachedContent) return 'editor';
    return hasCachedContent ? 'cache' : 'none';
}

export function isLatestSave(tab, snapshot) {
    return tab?._saveGeneration === snapshot?.generation;
}

export function savedLatestEdit(tab, snapshot) {
    return (tab?._editGeneration || 0) === (snapshot?.editGeneration || 0);
}

export function saveStatusMessage({
    historyCommitFailed = false,
    latestEdit = true,
    successMessage = 'Saved',
} = {}) {
    if (historyCommitFailed) return 'Saved; history commit failed';
    if (!latestEdit) return 'Saved older snapshot; newer changes remain';
    return successMessage;
}

export function saveFailureStatusMessage(error) {
    const rawCause = error?.message || error?.error || error;
    const cause = String(rawCause || '').trim().replace(/^Error:\s*/i, '');
    return cause ? `Save failed — ${cause}` : 'Save failed — unknown error';
}

export function isDiskFullError(error) {
    const rawCause = error?.message || error?.error || error;
    return /(?:\benospc\b|no space left|disk (?:is )?full|not enough (?:disk )?space|insufficient (?:disk )?space)/i
        .test(String(rawCause || ''));
}

export function saveResultDisposition(result) {
    if (result?.success) return 'saved';
    if (String(result?.error || '').trim() === 'File modified externally') return 'conflict';
    return 'failure';
}
