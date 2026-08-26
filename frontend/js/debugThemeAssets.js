const fallbackThemes = [{ id: 'default', name: 'Figaro Dark' }];

function validThemeId(value) {
    const id = String(value || '');
    return /^[a-z0-9-]+$/.test(id) ? id : 'default';
}

/** Asset-backed theme adapter for the browser development shell. */
export function createDebugThemeAssets(fetchImpl = globalThis.fetch) {
    let manifestPromise = null;
    const loadThemes = async () => {
        if (!manifestPromise) {
            manifestPromise = (async () => {
                try {
                    const response = await fetchImpl('/themes/manifest.json');
                    if (!response?.ok) throw new Error('Theme manifest is unavailable');
                    const themes = await response.json();
                    return Array.isArray(themes) && themes.length ? themes : fallbackThemes;
                } catch (_) {
                    return fallbackThemes;
                }
            })();
        }
        return manifestPromise;
    };

    return {
        async getThemes() {
            return { themes: await loadThemes() };
        },
        async getThemeCSS(requestedId) {
            const themes = await loadThemes();
            const candidate = validThemeId(requestedId);
            const id = themes.some(theme => theme.id === candidate) ? candidate : 'default';
            try {
                const response = await fetchImpl(`/themes/${id}.css`);
                if (!response?.ok) throw new Error('Theme stylesheet is unavailable');
                return { css: await response.text() };
            } catch (_) {
                return { css: '' };
            }
        },
    };
}
