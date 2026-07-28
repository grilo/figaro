const THEME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const THEME_MANIFEST_PATH = '../themes/manifest.json';

export function normalizeThemeManifest(manifest) {
    if (!Array.isArray(manifest)) return [];

    const seen = new Set();
    return manifest.flatMap(entry => {
        const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
        if (!THEME_ID_PATTERN.test(id) || !name || seen.has(id)) return [];
        seen.add(id);
        return [{ id, name }];
    });
}

export function themeStylesheetPath(themeId) {
    if (!THEME_ID_PATTERN.test(themeId)) {
        throw new Error(`Invalid theme identifier: ${themeId}`);
    }
    return `../themes/${themeId}.css`;
}

export function matchesCatalogQuery(section, query) {
    const needles = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (needles.length === 0) return true;

    const haystack = [
        section.id,
        section.title,
        section.terms,
        ...(section.selectors || []),
    ].join(' ').toLocaleLowerCase();
    return needles.every(needle => haystack.includes(needle));
}
