export const editorNavigationDefaults = Object.freeze({
    stickyHeadings: true,
    blockGuides: true,
    documentOutline: true,
});

const preferenceKeys = new Set(Object.keys(editorNavigationDefaults));

export function normalizeEditorNavigationPreference(input) {
    const source = input && typeof input === 'object' ? input : {};
    return Object.fromEntries(Object.entries(editorNavigationDefaults).map(([key, fallback]) => [
        key,
        typeof source[key] === 'boolean' ? source[key] : fallback,
    ]));
}

export function updateEditorNavigationPreference(current, key, enabled) {
    if (!preferenceKeys.has(key)) throw new Error(`Unknown editor navigation preference: ${key}`);
    return {
        ...normalizeEditorNavigationPreference(current),
        [key]: Boolean(enabled),
    };
}
