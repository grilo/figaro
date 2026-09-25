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

const MARKDOWN_FILE = /\.(?:md|markdown)$/iu;

/** Markdown documents open where they are; other dropped files do not. */
export function isMarkdownDropPath(path) {
    return MARKDOWN_FILE.test(externalBaseName(path));
}

/**
 * Decide what a native file drop does. The file tree names a destination, so
 * a drop there imports into that folder. A batch of Markdown files dropped
 * anywhere else opens in place. Other files dropped on the editor keep the
 * insert-a-path or import choice; anywhere else they are ignored.
 *
 * `target` is 'tree', 'editor' or 'elsewhere'.
 */
export function externalDropAction(paths, target) {
    const sourcePaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
    if (!sourcePaths.length) return 'ignore';
    if (target === 'tree') return 'import';
    if (sourcePaths.every(isMarkdownDropPath)) return 'open';
    return target === 'editor' ? 'ask' : 'ignore';
}

/** Notice for an open document that lives outside the vault, or null. */
export function externalFileNotice(tab) {
    if (tab?.type !== 'file' || !tab.externalFileId) return null;
    return {
        name: tab.title || externalBaseName(tab.path),
        message: 'Outside the vault. Edits save to the original file and are not kept in history.',
        actionLabel: 'Import to vault',
    };
}
