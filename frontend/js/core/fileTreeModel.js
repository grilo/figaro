export function normalizeFileTreeStyles(styles) {
    const entries = {};
    if (styles?.entries && typeof styles.entries === 'object') {
        for (const [path, rawStyle] of Object.entries(styles.entries)) {
            if (!rawStyle || typeof rawStyle !== 'object') continue;
            const style = { ...rawStyle };
            if (typeof style.pinned !== 'boolean') delete style.pinned;
            entries[path] = style;
        }
    }
    return {
        version: Number(styles?.version) || 1,
        entries,
        recent_icons: Array.isArray(styles?.recent_icons) ? styles.recent_icons.slice(0, 10) : [],
    };
}

export function isFileTreeEntryPinned(item, styles = {}) {
    const preference = styles?.[item?.path]?.pinned;
    if (typeof preference === 'boolean') return preference;
    return item?.type === 'directory' && item?.path === 'Inbox';
}

export function sortFileTreeItems(items, styles = {}) {
    return (Array.isArray(items) ? items : [])
        .map((item, index) => ({ item, index, pinned: isFileTreeEntryPinned(item, styles) }))
        .sort((left, right) => Number(right.pinned) - Number(left.pinned) || left.index - right.index)
        .map(entry => entry.item);
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
