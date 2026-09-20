/** Fields consumed by workspace presentation, never editor text or selection. */
const presentationFields = ['id', 'type', 'title', 'path', 'externalFileId', 'dateStr', 'dirty'];
const bufferFields = ['_content', '_editGeneration', '_saveGeneration', '_loadGeneration', 'mtime', '_editorTextScale'];

/** Classify one immutable publication once, before waking any consumers. */
export function workspaceTabChanges(previous = [], next = []) {
    const before = Array.isArray(previous) ? previous : [];
    const after = Array.isArray(next) ? next : [];
    let presentation = before.length !== after.length;
    let cursors = false, buffers = false;
    for (let index = 0; index < after.length; index++) {
        const oldTab = before[index], tab = after[index];
        if (oldTab === tab) continue;
        if (!oldTab || !tab || oldTab.id !== tab.id) {
            presentation = true;
            continue;
        }
        presentation ||= presentationFields.some(field => oldTab[field] !== tab[field]);
        cursors ||= oldTab.cursorState?.anchor !== tab.cursorState?.anchor
            || oldTab.cursorState?.head !== tab.cursorState?.head;
        buffers ||= bufferFields.some(field => oldTab[field] !== tab[field]);
    }
    return { presentation, cursors, buffers };
}
