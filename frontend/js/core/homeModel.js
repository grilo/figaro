import { isFileTreeEntryPinned } from './fileTreeModel.js';

function normalizedPath(path) {
    return String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

function flattenTree(items, result = []) {
    for (const item of items || []) {
        if (!item?.path || (item.type !== 'file' && item.type !== 'directory')) continue;
        result.push(item);
        if (item.type === 'directory') flattenTree(item.children, result);
    }
    return result;
}

function markdownFiles(items) {
    return items.filter(item => item.type === 'file' && /\.md$/i.test(item.path || ''));
}

function stableSeed(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function localDatePath(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}.md`;
}

export function todayPresentation(date = new Date(), locale = undefined) {
    return {
        path: localDatePath(date),
        eyebrow: new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
        }).format(date),
    };
}

export function todayNotePlan(todayPath, tree) {
    const path = normalizedPath(todayPath);
    if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(path)) {
        return { kind: 'invalid', error: 'The application returned an invalid daily-note date.' };
    }
    const inboxPath = `Inbox/${path}`;
    const files = flattenTree(tree, []).filter(item => item.type === 'file');
    const existing = [inboxPath, path]
        .map(candidate => files.find(item => normalizedPath(item.path) === candidate))
        .find(Boolean);
    if (existing) return { kind: 'open', path: normalizedPath(existing.path), mtime: existing.mtime };
    return {
        kind: 'create',
        directory: 'Inbox',
        path: inboxPath,
        content: `# ${path.slice(0, -3)}\n\n`,
    };
}

export function homeCollections({
    tree = [],
    styles = { entries: {} },
    recentPaths = [],
    todayPath = '',
    rediscoverySeed = todayPath,
    limit = 5,
} = {}) {
    const entries = flattenTree(tree, []);
    const files = markdownFiles(entries);
    const safeLimit = Math.max(1, Number(limit) || 5);
    const normalizedToday = normalizedPath(todayPath);
    const todayPaths = new Set([normalizedToday, `Inbox/${normalizedToday}`]);
    const recent = new Set((recentPaths || []).map(normalizedPath));
    const styleEntries = styles?.entries || {};

    const inboxFiles = files
        .filter(item => normalizedPath(item.path).startsWith('Inbox/'))
        .sort((left, right) => Number(right.mtime || 0) - Number(left.mtime || 0) || String(left.path).localeCompare(String(right.path)));

    const pinned = entries
        .filter(item => isFileTreeEntryPinned(item, styleEntries))
        .slice(0, safeLimit);

    const preferredRediscovery = files.filter(item => {
        const path = normalizedPath(item.path);
        return !todayPaths.has(path) && !path.startsWith('Inbox/') && !recent.has(path);
    });
    const fallbackRediscovery = files.filter(item => {
        const path = normalizedPath(item.path);
        return !todayPaths.has(path) && !path.startsWith('Inbox/');
    });
    const rediscoveryPool = preferredRediscovery.length ? preferredRediscovery : fallbackRediscovery;
    const rediscover = rediscoveryPool.length
        ? rediscoveryPool[stableSeed(rediscoverySeed) % rediscoveryPool.length]
        : null;

    return {
        inbox: inboxFiles.slice(0, safeLimit),
        inboxCount: inboxFiles.length,
        pinned,
        rediscover,
        todayExists: files.some(item => todayPaths.has(normalizedPath(item.path))),
    };
}

export default { homeCollections, localDatePath, todayNotePlan, todayPresentation };
