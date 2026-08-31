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

const fileTreeCodeExtensions = new Set([
    'astro', 'c', 'cc', 'cfg', 'conf', 'cpp', 'cs', 'css', 'go', 'h', 'hpp',
    'htm', 'html', 'ini', 'java', 'js', 'jsx', 'kt', 'kts', 'less', 'mjs',
    'php', 'py', 'rb', 'rs', 'sass', 'scss', 'sql', 'svelte', 'toml', 'ts',
    'tsx', 'vue', 'xml', 'yaml', 'yml',
]);
const fileTreeImageExtensions = new Set([
    'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp',
]);
const fileTreeSpreadsheetExtensions = new Set(['csv', 'ods', 'tsv', 'xls', 'xlsx']);
const fileTreeArchiveExtensions = new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip']);
const fileTreeAudioExtensions = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'wav']);
const fileTreeVideoExtensions = new Set(['avi', 'mkv', 'mov', 'mp4', 'mpeg', 'webm']);
const fileTreeTerminalExtensions = new Set(['bash', 'bat', 'cmd', 'fish', 'ps1', 'sh', 'zsh']);
const fileTreeCodeBasenames = new Set(['dockerfile', 'gemfile', 'makefile', 'procfile']);

/**
 * Choose one semantic default icon without coupling file identity to editor
 * capability. The DOM adapter may still decide whether activation can open a
 * file, while every vault entry receives a normal, recognizable presentation.
 */
export function fileTreeFilePresentation(path) {
    const normalized = String(path || '').replaceAll('\\', '/');
    const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
    const lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.drawio.svg')) return { icon: 'Workflow', label: 'Draw.io diagram' };

    const dot = lowerName.lastIndexOf('.');
    const extension = dot >= 0 ? lowerName.slice(dot + 1) : '';
    if (['md', 'markdown', 'mdx'].includes(extension)) {
        return { icon: 'FileText', label: 'Markdown document' };
    }
    if (['log', 'rst', 'rtf', 'txt'].includes(extension)) {
        return { icon: 'FileText', label: 'Text document' };
    }
    if (extension === 'pdf') return { icon: 'FileText', label: 'PDF document' };
    if (fileTreeImageExtensions.has(extension)) return { icon: 'FileImage', label: 'Image file' };
    if (['json', 'jsonc'].includes(extension)) return { icon: 'FileJson', label: 'JSON file' };
    if (fileTreeSpreadsheetExtensions.has(extension)) {
        return { icon: 'FileSpreadsheet', label: 'Spreadsheet file' };
    }
    if (fileTreeArchiveExtensions.has(extension)) return { icon: 'FileArchive', label: 'Archive file' };
    if (fileTreeAudioExtensions.has(extension)) return { icon: 'FileAudio', label: 'Audio file' };
    if (fileTreeVideoExtensions.has(extension)) return { icon: 'FileVideo', label: 'Video file' };
    if (fileTreeTerminalExtensions.has(extension)) return { icon: 'FileTerminal', label: 'Script file' };
    if (fileTreeCodeExtensions.has(extension) || fileTreeCodeBasenames.has(lowerName)) {
        return { icon: 'FileCode2', label: 'Source file' };
    }
    return {
        icon: 'File',
        label: extension ? `${extension.toUpperCase()} file` : 'File',
    };
}

/**
 * Place a file-tree tooltip beside its row while keeping the complete surface
 * inside the viewport. The DOM adapter owns measurement and applies this pure
 * positioning decision to its fixed overlay.
 */
export function fileTreeTooltipPosition(anchorRect, tooltipRect, viewport = {}) {
    const margin = 8;
    const gap = 6;
    const viewportWidth = Math.max(0, Number(viewport.width ?? viewport.innerWidth) || 0);
    const viewportHeight = Math.max(0, Number(viewport.height ?? viewport.innerHeight) || 0);
    const tooltipWidth = Math.max(0, Number(tooltipRect?.width) || 0);
    const tooltipHeight = Math.max(0, Number(tooltipRect?.height) || 0);
    const anchorLeft = Number(anchorRect?.left) || 0;
    const anchorRight = Number(anchorRect?.right) || anchorLeft;
    const anchorTop = Number(anchorRect?.top) || 0;
    const anchorHeight = Math.max(0, Number(anchorRect?.height) || 0);
    const maximumLeft = Math.max(margin, viewportWidth - tooltipWidth - margin);
    const maximumTop = Math.max(margin, viewportHeight - tooltipHeight - margin);
    const preferredRight = anchorRight + gap;
    const preferredLeft = anchorLeft - tooltipWidth - gap;
    const left = preferredRight + tooltipWidth <= viewportWidth - margin
        ? preferredRight
        : preferredLeft;
    const top = anchorTop + ((anchorHeight - tooltipHeight) / 2);

    return {
        left: Math.max(margin, Math.min(left, maximumLeft)),
        top: Math.max(margin, Math.min(top, maximumTop)),
    };
}

/**
 * Resolve the vault entries affected by an item action. A context action on
 * one member of a multi-selection applies to the whole selection; an action
 * on any other row intentionally falls back to that row alone.
 */
export function fileTreeActionPaths(targetPath, selectedPaths = []) {
    const target = String(targetPath || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (!target) return [];
    const selected = [...new Set((Array.isArray(selectedPaths) ? selectedPaths : [])
        .map(path => String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, ''))
        .filter(Boolean))];
    return selected.includes(target) ? selected : [target];
}

/** Keep operation selection path-based and drop entries removed by refresh. */
export function reconcileSelectedTreePaths(selectedPaths, items) {
    const available = new Set();
    const visit = entries => {
        for (const item of Array.isArray(entries) ? entries : []) {
            if (item?.path) available.add(item.path);
            if (Array.isArray(item?.children)) visit(item.children);
        }
    };
    visit(items);
    return [...new Set(Array.isArray(selectedPaths) ? selectedPaths : [])]
        .filter(path => available.has(path));
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
    if (key === 'Enter') return { action: 'activate', path: current.path };
    if (key === ' ') return { action: 'toggle-selection', path: current.path };

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

/**
 * Classify the complete file-tree keyboard surface from plain state. The DOM
 * adapter owns focus, dialogs, and mutations; this plan owns command priority
 * and modifier policy so those branches cannot drift across handlers.
 */
function fileTreeDirectKeyCommand(input) {
    if (input.contextMenuRequested) return { action: 'context-menu' };
    if (input.key === 'Escape' && input.cutActive) return { action: 'cancel-cut' };
    if (input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) return null;
    if (input.key === 'F2' && input.itemActionable) return { action: 'rename' };
    if (input.key === 'Delete' && input.itemActionable) return { action: 'delete' };
    return null;
}

function fileTreeNavigationKeyCommand(input) {
    if (input.altKey || input.ctrlKey || input.metaKey) return null;
    return input.navigationPlan || null;
}

function fileTreeClipboardKeyCommand(input) {
    if (!(input.ctrlKey || input.metaKey) || input.altKey || input.shiftKey) return null;
    const commandKey = String(input.key || '').toLowerCase();
    if (commandKey === 'x' && input.selectedEntryCount > 0) return { action: 'cut' };
    if (commandKey === 'c' && input.selectedEntryCount > 0) return { action: 'copy' };
    if (commandKey === 'v' && input.clipboardAvailable && input.pasteAllowed) return { action: 'paste' };
    return null;
}

export function fileTreeKeyCommand(input = {}) {
    const directCommand = fileTreeDirectKeyCommand(input);
    if (directCommand) return directCommand;
    const navigationCommand = fileTreeNavigationKeyCommand(input);
    if (navigationCommand) return navigationCommand;
    return fileTreeClipboardKeyCommand(input);
}
