/**
 * Scope of an external vault change batch. `null` means the scope is unknown
 * (an unscoped or oversized notification), and every consumer must refresh.
 * An array lists the vault-relative paths that changed; it may be empty when
 * the batch only acknowledged Figaro's own writes.
 */

const renderedAssetExtensions = new Set([
    'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp', 'drawio',
]);

/** Normalize a backend payload's `paths` field into a change scope. */
export function vaultChangeScope(paths) {
    return Array.isArray(paths) ? paths.map(path => String(path).replaceAll('\\', '/')) : null;
}

/**
 * Combine coalesced batches. `undefined` means nothing is pending yet; any
 * unknown batch makes the combined scope unknown.
 */
export function mergeVaultChangeScopes(pending, next) {
    if (pending === undefined) return next === null ? null : [...next];
    if (pending === null || next === null) return null;
    return [...new Set([...pending, ...next])];
}

// A watcher entry without an extension may be a folder that was renamed,
// moved or deleted; everything beneath it may have changed with it.
function mayBeFolder(path) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    return !name.includes('.');
}

/** Rendered previews depend only on image and diagram files, or folders holding them. */
export function vaultChangeTouchesRenderedAssets(scope) {
    if (scope === null || scope === undefined) return true;
    return scope.some(path => mayBeFolder(path)
        || renderedAssetExtensions.has(path.slice(path.lastIndexOf('.') + 1).toLowerCase()));
}

/** Per-note history and status depend on that note's file or a folder containing it. */
export function vaultChangeTouchesPath(scope, path) {
    if (scope === null || scope === undefined) return true;
    if (!path) return false;
    const target = String(path).replaceAll('\\', '/');
    return scope.some(changed => changed === target || target.startsWith(`${changed}/`));
}
