export function createSaveSnapshot(tab, content, { offerExternalImport = false } = {}) {
    if (!tab?.path || typeof content !== 'string') return null;
    return Object.freeze({
        tab,
        path: tab.path,
        content,
        generation: (tab._saveGeneration || 0) + 1,
        editGeneration: tab._editGeneration || 0,
        externalFileId: tab.externalFileId || null,
        offerExternalImport: Boolean(offerExternalImport),
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
