function externalBaseName(path) {
    return String(path || '').split(/[\\/]/).pop() || 'item';
}

/**
 * Describe the confirmation required before native paths are copied into a
 * file-tree destination. This policy stays independent from dialogs and
 * filesystem effects so every native-drop adapter can share the same wording.
 */
export function externalTreeImportPrompt(paths, targetDirectory = '') {
    const sourcePaths = Array.isArray(paths)
        ? paths.map(path => String(path || '')).filter(Boolean)
        : [];
    if (!sourcePaths.length) return null;

    const destination = String(targetDirectory || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    const destinationLabel = destination ? `“${destination}”` : 'the vault root';
    const count = sourcePaths.length;
    const subject = count === 1 ? `“${externalBaseName(sourcePaths[0])}”` : `${count} items`;

    return {
        title: `Import ${subject} into ${destinationLabel}?`,
        message: `Figaro will copy ${count === 1 ? 'this item' : 'these items'} into the vault. ${count === 1 ? 'The original stays' : 'The originals stay'} in the current location and will not be modified or removed.`,
        options: {
            confirmLabel: 'Import to vault',
            cancelLabel: 'Cancel',
            icon: 'file-add',
        },
    };
}

/**
 * Plan the backend read for a file tab without performing I/O. External tabs
 * are capability-backed; their absolute display path is never a vault path.
 */
export function fileTabReadTarget(tab) {
    const externalFileId = String(tab?.externalFileId || '');
    if (externalFileId) return { kind: 'external', externalFileId };

    const path = String(tab?.path || '');
    if (path) return { kind: 'vault', path };

    return null;
}
