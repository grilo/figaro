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

export function directoryPathsForReveal(path) {
    const parts = String(path || '').replaceAll('\\', '/').split('/').filter(Boolean);
    return parts.map((_part, index) => parts.slice(0, index + 1).join('/'));
}

export function toggleSelectedPath(selectedPaths, path) {
    const next = [...new Set(selectedPaths || [])];
    const index = next.indexOf(path);
    if (index >= 0) next.splice(index, 1);
    else next.push(path);
    return next;
}

/**
 * Project tab ownership into the only secondary file marker the tree needs.
 * Clean open tabs are deliberately absent: whether a clean document has a tab
 * open does not change any file-tree action. Dirty buffers are different
 * because their in-memory contents have not necessarily reached disk yet.
 */
export function dirtyFilePaths(openTabs) {
    return new Set((Array.isArray(openTabs) ? openTabs : [])
        .filter(tab => (tab?.type === 'file' || tab?.type === 'drawio')
            && tab.path
            && tab.dirty)
        .map(tab => tab.path));
}

/** Flatten only the rows a collapsed/expanded tree currently exposes. */
export function visibleFileTreeRows(items, expandedDirectories, styles = {}, depth = 1, parentPath = null) {
    const expanded = expandedDirectories instanceof Set
        ? expandedDirectories
        : new Set(expandedDirectories || []);
    const rows = [];

    for (const item of sortFileTreeItems(items, styles)) {
        const children = item?.type === 'directory' && Array.isArray(item.children)
            ? item.children
            : [];
        const hasChildren = children.length > 0;
        const isExpanded = hasChildren && expanded.has(item.path);
        rows.push({
            item,
            path: item.path,
            type: item.type,
            depth,
            parentPath,
            hasChildren,
            expanded: isExpanded,
        });
        if (isExpanded) {
            rows.push(...visibleFileTreeRows(children, expanded, styles, depth + 1, item.path));
        }
    }

    return rows;
}

export function fileTreeWindow(
    rowCount,
    { anchorIndex = 0, selectedIndex = -1, windowSize = 160 } = {},
) {
    const count = Math.max(0, Number(rowCount) || 0);
    if (!count) return { start: 0, end: 0 };
    const size = Math.min(count, Math.max(1, Number(windowSize) || 1));
    const requestedAnchor = selectedIndex >= 0 ? selectedIndex : anchorIndex;
    const anchor = Math.min(count - 1, Math.max(0, Number(requestedAnchor) || 0));
    const start = Math.min(count - size, Math.max(0, anchor - Math.floor(size / 2)));
    return { start, end: start + size };
}

/**
 * Plan one WAI-ARIA tree keyboard command without touching DOM or state.
 * Focus navigation is independent from current-document and multi-selection
 * state; activation and expansion remain adapter effects.
 */
export function fileTreeKeyboardPlan(key, rows, currentPath) {
    const supported = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '];
    if (!supported.includes(key)) return null;
    if (!Array.isArray(rows) || !rows.length) return { action: 'none' };

    const foundIndex = rows.findIndex(row => row.path === currentPath);
    const currentIndex = foundIndex >= 0 ? foundIndex : 0;
    const current = rows[currentIndex];
    const focus = index => ({ action: 'focus', path: rows[index].path });

    if (key === 'Home') return focus(0);
    if (key === 'End') return focus(rows.length - 1);
    if (key === 'ArrowDown') return focus(foundIndex < 0 ? 0 : Math.min(rows.length - 1, currentIndex + 1));
    if (key === 'ArrowUp') return focus(foundIndex < 0 ? 0 : Math.max(0, currentIndex - 1));
    if (key === 'Enter' || key === ' ') return { action: 'activate', path: current.path };

    if (key === 'ArrowRight') {
        if (current.type !== 'directory' || !current.hasChildren) return { action: 'none' };
        if (!current.expanded) return { action: 'expand', path: current.path };
        const child = rows[currentIndex + 1];
        return child?.parentPath === current.path
            ? { action: 'focus', path: child.path }
            : { action: 'none' };
    }

    if (current.type === 'directory' && current.expanded) {
        return { action: 'collapse', path: current.path };
    }
    return current.parentPath
        ? { action: 'focus', path: current.parentPath }
        : { action: 'none' };
}
