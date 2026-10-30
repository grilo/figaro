/**
 * Pure decisions for an open Excalidraw drawing. The editor reports a scene
 * version on every change, including pointer and selection updates; only a
 * new version is an edit.
 */

export function isDrawingEdit(previousVersion, version) {
    return previousVersion !== null && version !== previousVersion;
}

/**
 * Reload a clean drawing when the vault reports that its file changed (for
 * example a history restore or an external editor). A `null` scope is an
 * unknown batch that may include it. Unsaved edits are never replaced.
 */
export function shouldReloadDrawing({ scope, path, dirty, saving }) {
    if (dirty || saving || !path) return false;
    if (scope === null || scope === undefined) return true;
    return scope.includes(path);
}

/** A reload is only needed when the file on disk is not the one already shown. */
export function isNewerDrawingFile(result, shownMtime) {
    return Boolean(result) && result.mtime !== shownMtime;
}
