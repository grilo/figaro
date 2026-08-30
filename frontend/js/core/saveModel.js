export function createSaveSnapshot(tab, content, options = {}) {
    if (!tab?.path || typeof content !== 'string') return null;
    return Object.freeze({
        tab,
        path: tab.path,
        content,
        generation: (tab._saveGeneration || 0) + 1,
        editGeneration: tab._editGeneration || 0,
        externalFileId: tab.externalFileId || null,
        failurePrompt: options.failurePrompt || 'once',
    });
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

export function saveResultDisposition(result) {
    if (result?.success) return 'saved';
    if (String(result?.error || '').trim() === 'File modified externally') return 'conflict';
    return 'failure';
}
