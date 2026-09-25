import { backend } from './backend.js';
import { externalTreeImportPrompt } from './core/externalFileModel.js';

function fileName(path) {
    return String(path || '').split(/[\\/]/).pop() || 'Untitled.md';
}

function requiredConfirm(confirm) {
    if (typeof confirm !== 'function') throw new TypeError('External-file confirmation port is required');
    return confirm;
}

// Resolve only the Markdown files the native process received at launch. The
// backend keeps the capability mapping, so this module never asks it to open
// an arbitrary path supplied by the webview.
export async function openLaunchExternalFiles(openTab, {
    api = backend(),
    ...options
} = {}) {
    if (typeof openTab !== 'function' || typeof api?.GetLaunchExternalFiles !== 'function') return [];
    const files = await api.GetLaunchExternalFiles();
    return openExternalLaunchFiles(files, openTab, { api, ...options });
}

// Process descriptors delivered after another operating-system launch. The
// caller owns ID claiming so the startup snapshot and a simultaneous runtime
// event cannot show the same prompt twice.
export async function openExternalLaunchFiles(files, openTab, {
    api = backend(),
    confirm,
    closeTab,
    onExternalKept = () => {},
    onImported = async () => {},
    onImportError = () => {},
    claimExternalFile = () => true,
} = {}) {
    if (typeof openTab !== 'function') return [];
    for (const file of Array.isArray(files) ? files : []) {
        if (!file?.id || !file?.path) continue;
        if (!claimExternalFile(file)) continue;
        const tab = {
            id: `external:${file.id}`,
            title: file.name || fileName(file.path),
            path: file.path,
            mtime: file.mtime,
            externalFileId: file.id,
        };
        let imported = false;
        try {
            imported = await offerExternalFileImport(tab, {
                openTab,
                closeTab,
                api,
                confirm: requiredConfirm(confirm),
                onImported,
            });
        } catch (error) {
            onImportError(error, file);
        }
        if (imported) continue;
        openTab(tab.id, tab.title, 'file', {
            path: tab.path,
            mtime: tab.mtime,
            externalFileId: tab.externalFileId,
        });
        onExternalKept(file);
    }
    return Array.isArray(files) ? files : [];
}

// Importing is an explicit copy. MergeExternalPaths picks “name (copy).md”
// when the vault root already has that name, so neither the source file nor
// an existing note is replaced.
export async function importExternalTab(tab, {
    openTab,
    closeTab,
    api = backend(),
    onImported = async () => {},
} = {}) {
    if (!tab?.externalFileId || !tab.path || typeof openTab !== 'function' || typeof api?.MergeExternalPaths !== 'function') {
        return null;
    }
    const result = await api.MergeExternalPaths([tab.path], '');
    const importedPath = result?.paths?.[0];
    if (!result?.success || !importedPath) {
        throw new Error(result?.error || 'Could not import the external note');
    }
    await onImported(importedPath);
    openTab(importedPath, fileName(importedPath), 'file', { path: importedPath });
    if (typeof closeTab === 'function') await closeTab(tab.id);
    return importedPath;
}

export async function offerExternalFileImport(tab, {
    confirm,
    ...options
} = {}) {
    if (!tab?.externalFileId || !tab.path || typeof options.openTab !== 'function') return false;
    const shouldImport = await requiredConfirm(confirm)(
        'Import this note into the vault?',
        `“${tab.title || fileName(tab.path)}” is outside this vault. Importing copies it into the vault without replacing an existing note. Keeping it outside adds a temporary root shortcut and continues saving to the original file.`,
        false,
        false,
        { confirmLabel: 'Import note', cancelLabel: 'Keep outside vault' }
    );
    if (!shouldImport) return false;
    return Boolean(await importExternalTab(tab, options));
}

/**
 * Import the open external document from its notice. Unsaved edits are saved
 * to the original file first, so the vault copy holds what the user sees.
 * Returns the imported vault path, or null when saving did not complete.
 */
export async function importOpenExternalTab(tab, {
    save,
    forgetShortcut = () => {},
    ...options
} = {}) {
    if (!tab?.externalFileId) return null;
    if (tab.dirty) {
        const saved = typeof save === 'function' ? await save(tab) : null;
        if (!saved?.success) return null;
    }
    const importedPath = await importExternalTab(tab, options);
    if (importedPath) forgetShortcut(tab.externalFileId);
    return importedPath;
}

/**
 * Open Markdown files dropped outside the file tree. Vault notes open as
 * ordinary tabs; other files open in place and gain a temporary root
 * shortcut, exactly like files the operating system opened.
 */
export async function openDroppedMarkdownFiles(paths, {
    api = backend(),
    openTab,
    onExternalKept = () => {},
} = {}) {
    const empty = { opened: 0, skipped: [] };
    if (typeof openTab !== 'function' || typeof api?.OpenDroppedMarkdownFiles !== 'function') return empty;
    const result = await api.OpenDroppedMarkdownFiles(Array.isArray(paths) ? paths : []);
    let opened = 0;
    for (const path of result?.vaultPaths || []) {
        openTab(path, fileName(path), 'file', { path });
        opened += 1;
    }
    for (const file of result?.external || []) {
        if (!file?.id || !file?.path) continue;
        openTab(`external:${file.id}`, file.name || fileName(file.path), 'file', {
            path: file.path,
            mtime: file.mtime,
            externalFileId: file.id,
        });
        onExternalKept(file);
        opened += 1;
    }
    return { opened, skipped: result?.skipped || [] };
}

// Editor drops deliberately offer a controlled path insertion or one recursive
// import. One batch maps to one confirmation and one backend operation, even
// when the batch consists of a single folder.
export async function importDroppedExternalPaths(paths, targetDirectory, {
    api = backend(),
    confirm,
} = {}) {
    const sourcePaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
    if (!sourcePaths.length || typeof api?.MergeExternalPaths !== 'function') {
        return { action: 'cancel', result: null, paths: [] };
    }
    const count = sourcePaths.length;
    const label = count === 1 ? `“${fileName(sourcePaths[0])}”` : `${count} items`;
    const choice = await requiredConfirm(confirm)(
        count === 1 ? 'How should Figaro handle this drop?' : 'How should Figaro handle these drops?',
        `${label} can be inserted into the current note as a path, or copied into the vault. Imported folders keep their complete structure, existing files are never overwritten, and the originals stay where they are.`,
        false,
        false,
        { confirmLabel: 'Import to vault', extraLabel: count === 1 ? 'Insert path' : 'Insert paths', cancelLabel: 'Cancel' }
    );
    if (choice === 'extra') return { action: 'path', result: null, paths: sourcePaths };
    if (!choice) return { action: 'cancel', result: null, paths: [] };

    return {
        action: 'import',
        result: await api.MergeExternalPaths(sourcePaths, targetDirectory),
        paths: sourcePaths,
    };
}

// A file-tree drop already expresses the destination, so it needs only an
// import/cancel decision. Unlike an editor drop, there is no path-insertion
// action and cancellation leaves the tree and source items unchanged.
export async function confirmExternalTreeImport(paths, targetDirectory, {
    confirm,
} = {}) {
    const prompt = externalTreeImportPrompt(paths, targetDirectory);
    if (!prompt) return false;
    const choice = await requiredConfirm(confirm)(
        prompt.title,
        prompt.message,
        false,
        false,
        prompt.options,
    );
    return choice === true || choice === 'confirm';
}
