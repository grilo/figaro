import { backend } from './backend.js';

function fileName(path) {
    return String(path || '').split(/[\\/]/).pop() || 'Untitled.md';
}

// Open only the Markdown files the native process received at launch. The
// backend keeps the capability mapping, so this module never asks it to open
// an arbitrary path supplied by the webview.
export async function openLaunchExternalFiles(openTab, api = backend()) {
    if (typeof openTab !== 'function' || typeof api?.GetLaunchExternalFiles !== 'function') return [];
    const files = await api.GetLaunchExternalFiles();
    for (const file of Array.isArray(files) ? files : []) {
        if (!file?.id || !file?.path) continue;
        openTab(`external:${file.id}`, file.name || fileName(file.path), 'file', {
            path: file.path,
            mtime: file.mtime,
            externalFileId: file.id,
        });
    }
    return Array.isArray(files) ? files : [];
}

// Importing is an explicit copy. CopyExternalPaths already allocates a new
// name when needed, so the source file and any same-named vault note survive.
export async function offerExternalFileImport(tab, {
    openTab,
    closeTab,
    api = backend(),
    confirm = window.confirmDialog,
} = {}) {
    if (!tab?.externalFileId || !tab.path || typeof openTab !== 'function' || typeof api?.CopyExternalPaths !== 'function') {
        return false;
    }
    const shouldImport = await confirm(
        'Import this note into the vault?',
        `“${tab.title || fileName(tab.path)}” was saved in its original location. Importing copies it into this vault without replacing an existing note.`,
        false,
        false,
        { confirmLabel: 'Import note', cancelLabel: 'Keep outside vault' }
    );
    if (!shouldImport) return false;

    const result = await api.CopyExternalPaths([tab.path], '.', false);
    const importedPath = result?.paths?.[0];
    if (!result?.success || !importedPath) {
        throw new Error(result?.error || 'Could not import the external note');
    }
    openTab(importedPath, fileName(importedPath), 'file', { path: importedPath, mtime: result.mtime });
    if (typeof closeTab === 'function') await closeTab(tab.id);
    return true;
}

// Editor drops deliberately offer a controlled path insertion or one recursive
// import. One batch maps to one confirmation and one backend operation, even
// when the batch consists of a single folder.
export async function importDroppedExternalPaths(paths, targetDirectory, {
    api = backend(),
    confirm = window.confirmDialog,
} = {}) {
    const sourcePaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
    if (!sourcePaths.length || typeof api?.MergeExternalPaths !== 'function') {
        return { action: 'cancel', result: null, paths: [] };
    }
    const count = sourcePaths.length;
    const label = count === 1 ? `“${fileName(sourcePaths[0])}”` : `${count} items`;
    const choice = await confirm(
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
