function normalizePath(path) {
    return String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

function parentPath(path) {
    const separator = path.lastIndexOf('/');
    return separator >= 0 ? path.slice(0, separator) : '';
}

function containsPath(parent, child) {
    return child === parent || child.startsWith(`${parent}/`);
}

/** Resolve a context target to the directory that receives a transfer. */
export function transferTargetDirectory(path, type) {
    const normalized = normalizePath(path);
    if (type === 'directory') return normalized;
    if (type === 'file') return parentPath(normalized);
    return '';
}

/**
 * Normalize, deduplicate, and reduce a transfer selection. A selected child
 * is redundant when its selected directory already contains it; retaining
 * only the top-level source prevents accidental duplicate moves/copies.
 */
export function normalizeTransferEntries(entries) {
    const normalized = [];
    const seen = new Set();
    for (const entry of Array.isArray(entries) ? entries : []) {
        const path = normalizePath(entry?.path);
        const type = entry?.type;
        if (!path || (type !== 'file' && type !== 'directory') || seen.has(path)) continue;
        seen.add(path);
        normalized.push({ path, type });
    }
    return normalized.filter((entry, index, all) => !all.some((candidate, candidateIndex) => (
        candidateIndex !== index
        && candidate.type === 'directory'
        && containsPath(candidate.path, entry.path)
    )));
}

/**
 * Produce the deterministic, effect-free part of a batch transfer. The
 * adapter can refuse the complete batch before any filesystem call when a
 * source would recurse into itself or when the selection contains nested
 * sources. Same-parent cuts are safe no-ops and are returned separately.
 */
export function planFileTreeTransfer(entries, targetDirectory, operation) {
    const sources = normalizeTransferEntries(entries);
    const target = normalizePath(targetDirectory);
    if (operation !== 'copy' && operation !== 'cut') {
        return { valid: false, reason: 'unsupported-operation', entries: sources, pending: [], skipped: [] };
    }

    const invalid = sources.some(source => source.type === 'directory' && containsPath(source.path, target));
    if (invalid) {
        return { valid: false, reason: operation === 'copy' ? 'recursive-copy' : 'recursive-move', entries: sources, pending: [], skipped: [] };
    }

    const skipped = operation === 'cut'
        ? sources.filter(source => parentPath(source.path) === target)
        : [];
    const pending = operation === 'cut'
        ? sources.filter(source => parentPath(source.path) !== target)
        : sources;
    return { valid: true, reason: null, entries: sources, pending, skipped };
}

export { normalizePath as normalizeTransferPath };
