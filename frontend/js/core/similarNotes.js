const minimumCanonicalLength = 4;

function normalizedPath(value) {
    return String(value || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

function baseName(path) {
    return normalizedPath(path).split('/').pop() || '';
}

function parentPath(path) {
    const normalized = normalizedPath(path);
    const separator = normalized.lastIndexOf('/');
    return separator >= 0 ? normalized.slice(0, separator) : '';
}

export function canonicalMarkdownName(path) {
    const name = baseName(path);
    if (!/\.md$/i.test(name)) return '';
    const stem = name.slice(0, -3).normalize('NFKC').toLowerCase();
    const canonical = [...stem].filter(character => /[\p{L}\p{N}]/u.test(character)).join('');
    return [...canonical].length >= minimumCanonicalLength ? canonical : '';
}

function flattenTree(items, entries = []) {
    for (const item of Array.isArray(items) ? items : []) {
        entries.push(item);
        flattenTree(item?.children, entries);
    }
    return entries;
}

// Plans the name decision without owning dialogs, navigation, or filesystem I/O.
export function planSameDirectoryNoteName({
    tree,
    parentDirectory = '',
    proposedName,
    currentPath = '',
}) {
    const canonical = canonicalMarkdownName(proposedName);
    if (!canonical) return { kind: 'none' };

    const parent = normalizedPath(parentDirectory);
    const excluded = normalizedPath(currentPath);
    const proposedBase = baseName(proposedName).toLowerCase();
    const matches = flattenTree(tree)
        .filter(item => item?.type === 'file')
        .filter(item => normalizedPath(item.path) !== excluded)
        .filter(item => parentPath(item.path) === parent)
        .filter(item => canonicalMarkdownName(item.path) === canonical)
        .sort((left, right) => String(left.path).localeCompare(String(right.path)));

    if (matches.length === 0) return { kind: 'none' };
    const match = matches[0];
    return {
        kind: baseName(match.path).toLowerCase() === proposedBase ? 'exact' : 'similar',
        path: normalizedPath(match.path),
        name: baseName(match.path),
    };
}
