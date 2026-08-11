function normalizedPath(value) {
    return String(value || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}
export function tabLocationLabel(tab) {
    const path = normalizedPath(tab?.path);
    if (!path) return '';
    const separator = path.lastIndexOf('/');
    return separator >= 0 ? path.slice(0, separator) : 'Vault root';
}

export function tabAccessibleLabel(tab) {
    const title = String(tab?.title || tab?.id || 'Untitled');
    const path = normalizedPath(tab?.path);
    return path && path !== title ? `${title} — ${path}` : title;
}

/**
 * Preserve both ends of a long filename. The differentiating portion of note
 * names commonly lives beside the extension, so end-only CSS ellipsis hides
 * exactly the text needed to choose between similar tabs.
 */
export function compactTabTitle(title, maxCharacters = 34) {
    const characters = [...String(title || '')];
    if (characters.length <= maxCharacters) {
        return { compacted: false, leading: characters.join(''), trailing: '' };
    }
    const trailingLength = Math.min(19, Math.max(14, Math.floor(maxCharacters * 0.56)));
    const leadingLength = Math.max(8, maxCharacters - trailingLength - 1);
    return {
        compacted: true,
        leading: characters.slice(0, leadingLength).join(''),
        trailing: characters.slice(-trailingLength).join(''),
    };
}
