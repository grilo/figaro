/**
 * The vault path a Markdown link destination addresses, by the rules the
 * link rewriter and Vault Health follow: a leading "/" starts at the vault
 * root, "./" and "../" are relative to the linking note, and every other
 * destination is already a vault path. Returns null when a relative
 * destination climbs out of the vault.
 */
export function vaultPathForNoteLink(target, sourcePath = '') {
    const destination = String(target ?? '');
    if (destination.startsWith('/')) return destination.replace(/^\/+/, '');
    const relative = destination === '.' || destination === '..'
        || destination.startsWith('./') || destination.startsWith('../');
    if (!relative) return destination;
    const parts = String(sourcePath || '').split('/').slice(0, -1).filter(Boolean);
    for (const segment of destination.split('/')) {
        if (segment === '..') {
            if (!parts.length) return null;
            parts.pop();
        } else if (segment && segment !== '.') {
            parts.push(segment);
        }
    }
    return parts.join('/');
}

/**
 * Classify the editor's decoded destination without reading workspace state.
 * sourcePath is the linking note; without one the destination is used as
 * written, which is right for wikilinks: they always name a vault path.
 */
export function linkedNoteNavigationPlan(target, label, sourcePath = null) {
    let path = target;
    for (let pass = 0; pass < 2; pass++) {
        try { path = decodeURI(path); } catch { /* Keep malformed source spelling. */ }
    }
    if (String(path || '').startsWith('#')) return { kind: 'heading', path };
    const date = !path && label
        ? label.match(/^(\d{4}-\d{2}-\d{2})$/)
        : path.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (date) return {
        kind: 'calendar', id: `calendar-${date[1]}`,
        title: `Mention of Date: [[${date[1]}]]`, data: { dateStr: date[1] },
    };
    if (!path && label) return { kind: 'none' };
    // A destination that leaves the vault keeps its spelling: reading it
    // fails and the author is told, instead of opening some other note.
    if (sourcePath !== null) path = vaultPathForNoteLink(path, sourcePath) ?? path;
    return { kind: 'file', path };
}

export function linkedNoteCreationPlan(path) {
    const fileName = path.split('/').pop();
    const fullPath = path.endsWith('.md') ? path : `${path}.md`;
    const displayName = path.endsWith('.md') ? fileName.replace('.md', '') : fileName;
    return {
        path: fullPath, title: fullPath.split('/').pop(), content: `# ${displayName}\n\n`,
        message: `The note “${fileName}” doesn’t exist yet.\n\nPath: ${fullPath}`,
    };
}

export function linkedNoteTabAction(replaceCurrent, openTabs, id) {
    return replaceCurrent && !openTabs.some(tab => tab.id === id) ? 'replace' : 'open';
}
