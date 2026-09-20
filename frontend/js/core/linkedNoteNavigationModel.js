/** Classify the editor's decoded destination without reading workspace state. */
export function linkedNoteNavigationPlan(target, label) {
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
