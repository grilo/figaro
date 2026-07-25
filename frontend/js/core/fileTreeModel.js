export function normalizeFileTreeStyles(styles) {
    return {
        version: Number(styles?.version) || 1,
        entries: styles?.entries && typeof styles.entries === 'object' ? styles.entries : {},
        recent_icons: Array.isArray(styles?.recent_icons) ? styles.recent_icons.slice(0, 10) : [],
    };
}

export function toggleExpandedDirectory(expandedDirectories, path) {
    const next = new Set(expandedDirectories || []);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
}

export function toggleSelectedPath(selectedPaths, path) {
    const next = [...new Set(selectedPaths || [])];
    const index = next.indexOf(path);
    if (index >= 0) next.splice(index, 1);
    else next.push(path);
    return next;
}
