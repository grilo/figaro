function unchanged(tabs, tab = null) {
    return { tabs, tab, previous: tab, changed: false };
}

/** Repeating the selected presentation returns to its companion view. */
export function toggledWorkspacePresentation(current, requested, alternative) {
    return requested === current ? alternative : requested;
}

/** Replace one workspace tab without mutating the shared state snapshot. */
export function updateWorkspaceTab(tabs, tabId, update) {
    const source = Array.isArray(tabs) ? tabs : [];
    const index = source.findIndex(tab => tab?.id === tabId);
    if (index < 0) return unchanged(source);

    const previous = source[index];
    const patch = typeof update === 'function' ? update(previous) : update;
    if (!patch) return unchanged(source, previous);
    const tab = { ...previous, ...patch };
    if (Object.keys(patch).every(key => Object.is(previous[key], tab[key]))) {
        return unchanged(source, previous);
    }
    const next = [...source];
    next[index] = tab;
    return { tabs: next, tab, previous, changed: true };
}

export function recordWorkspaceTabEdit(tabs, tabId) {
    const result = updateWorkspaceTab(tabs, tabId, tab => tab.type === 'file' ? {
        dirty: true,
        _editGeneration: (tab._editGeneration || 0) + 1,
    } : null);
    return { ...result, becameDirty: result.changed && !result.previous?.dirty };
}

export function recordWorkspaceTabContent(tabs, tabId, generation, content) {
    return updateWorkspaceTab(tabs, tabId, tab => (
        tab.type === 'file' && tab.dirty && tab._editGeneration === generation
            ? { _content: content }
            : null
    ));
}

export function recordWorkspaceTabCursor(tabs, tabId, cursorState) {
    return updateWorkspaceTab(tabs, tabId, tab => tab.type === 'file'
        ? { cursorState: { ...cursorState } }
        : null);
}

export function recordWorkspaceTabTextScale(tabs, tabId, scale) {
    return updateWorkspaceTab(tabs, tabId, tab => tab.type === 'file'
        ? { _editorTextScale: scale }
        : null);
}

export function resetWorkspaceTabTextScale(tabs, tabId) {
    const source = Array.isArray(tabs) ? tabs : [];
    const index = source.findIndex(tab => tab?.id === tabId);
    if (index < 0) return unchanged(source);
    const previous = source[index];
    if (previous.type !== 'file' || !Object.hasOwn(previous, '_editorTextScale')) {
        return unchanged(source, previous);
    }
    const tab = { ...previous };
    delete tab._editorTextScale;
    const next = [...source];
    next[index] = tab;
    return { tabs: next, tab, previous, changed: true };
}

export function resetWorkspaceTabTextScales(tabs) {
    let changed = false;
    const next = (Array.isArray(tabs) ? tabs : []).map(tab => {
        if (tab?.type !== 'file' || !Object.hasOwn(tab, '_editorTextScale')) return tab;
        changed = true;
        const restored = { ...tab };
        delete restored._editorTextScale;
        return restored;
    });
    return changed ? next : tabs;
}

export function restoreWorkspaceTabCursors(tabs, cursorStates) {
    const restored = cursorStates && typeof cursorStates === 'object' ? cursorStates : {};
    let changed = false;
    const next = (Array.isArray(tabs) ? tabs : []).map(tab => {
        if (tab?.type !== 'file' || !restored[tab.id]) return tab;
        changed = true;
        return { ...tab, cursorState: { ...restored[tab.id] } };
    });
    return changed ? next : tabs;
}

export function beginWorkspaceTabSave(tabs, tabId) {
    return updateWorkspaceTab(tabs, tabId, tab => ({
        _saveGeneration: (tab._saveGeneration || 0) + 1,
    }));
}

/** A load ticket survives immutable cursor/layout updates, but not a newer load. */
export function beginWorkspaceFileLoad(tabs, tabId) {
    return updateWorkspaceTab(tabs, tabId, tab => ({ _loadGeneration: (tab._loadGeneration || 0) + 1 }));
}

export function workspaceFileLoadIsCurrent(current, loading, activeId, { allowEdits = false } = {}) {
    return Boolean(current && current.id === activeId && current.id === loading.id
        && current.path === loading.path && current.externalFileId === loading.externalFileId
        && current._loadGeneration === loading._loadGeneration
        && (current._saveGeneration || 0) === (loading._saveGeneration || 0)
        && (allowEdits || ((current._editGeneration || 0) === (loading._editGeneration || 0)
            && (loading.dirty || !current.dirty))));
}

/** A mounted snapshot supplies a baseline, without clearing edits made since it mounted. */
export function finishWorkspaceFileLoad(tabs, loading, file, activeId) {
    return updateWorkspaceTab(tabs, loading.id, current => {
        if (!workspaceFileLoadIsCurrent(current, loading, activeId, { allowEdits: true })) return null;
        return {
            mtime: file.mtime,
            ...((current._editGeneration || 0) === (loading._editGeneration || 0)
                ? { _content: file.content, dirty: false } : {}),
        };
    });
}

/** Disk acknowledgements survive newer queued saves, without marking later edits clean. */
export function acknowledgeWorkspaceFileSave(tabs, snapshot, result) {
    let changed = false;
    const next = tabs.map(tab => {
        if ((tab.type !== 'file' && tab.type !== 'drawio') || tab.path !== snapshot.path
            || (tab.externalFileId || null) !== (snapshot.externalFileId || null) || tab.mtime === result.mtime) return tab;
        changed = true;
        return { ...tab, mtime: result.mtime };
    });
    return changed ? next : tabs;
}
