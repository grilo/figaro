import {
    matchesCatalogQuery,
    normalizeThemeManifest,
    THEME_MANIFEST_PATH,
    themeStylesheetPath,
} from './themeCatalogModel.js';
import { enhanceSelectCombobox } from '../js/selectCombobox.js';
import { initTooltips } from '../js/tooltip.js';

function sectionRecords(root) {
    return Array.from(root.querySelectorAll('[data-catalog-section]'), section => ({
        element: section,
        id: section.id,
        title: section.querySelector('h2')?.textContent?.trim() || section.id,
        terms: section.dataset.catalogTerms || '',
        selectors: Array.from(section.querySelectorAll('.ds-selector'), item => item.textContent.trim()),
    }));
}

function renderIndex(root, sections) {
    const nav = root.querySelector('#catalog-index');
    if (!nav) return;

    const fragment = root.createDocumentFragment();
    for (const section of sections) {
        const link = root.createElement('a');
        link.href = `#${section.id}`;
        link.dataset.catalogLink = section.id;
        link.textContent = section.title;
        fragment.appendChild(link);
    }
    nav.replaceChildren(fragment);
}

function renderVisibleCount(root, visible, total) {
    const count = root.querySelector('#catalog-visible-count');
    if (count) count.textContent = `${visible} of ${total} groups`;
}

function applySectionFilter(root, sections, query) {
    let visible = 0;
    for (const section of sections) {
        const matches = matchesCatalogQuery(section, query);
        section.element.hidden = !matches;
        const link = root.querySelector(`[data-catalog-link="${section.id}"]`);
        if (link) link.hidden = !matches;
        if (matches) visible += 1;
    }
    renderVisibleCount(root, visible, sections.length);
    const empty = root.querySelector('#catalog-empty');
    if (empty) empty.hidden = visible !== 0;
    return visible;
}

function refreshTokenValues(root) {
    const computed = root.defaultView?.getComputedStyle(root.documentElement);
    if (!computed) return;

    for (const item of root.querySelectorAll('[data-token]')) {
        const token = item.dataset.token;
        const value = computed.getPropertyValue(token).trim();
        const swatch = item.querySelector('.ds-token-swatch');
        const output = item.querySelector('.ds-token-value');
        if (swatch) swatch.style.background = `var(${token})`;
        if (output) output.textContent = value || 'not defined';
    }
}

function setThemeStatus(root, text, state = 'ready') {
    const status = root.querySelector('#theme-status');
    if (!status) return;
    status.textContent = text;
    status.dataset.state = state;
}

async function fetchThemeManifest(fetchImpl) {
    const response = await fetchImpl(THEME_MANIFEST_PATH);
    if (!response?.ok) {
        throw new Error(`Theme manifest returned ${response?.status || 'an error'}`);
    }
    return response.json();
}

async function loadThemeManifest(themeManifest, fetchImpl) {
    if (themeManifest !== undefined) return themeManifest;
    return fetchThemeManifest(fetchImpl);
}

function populateThemeSelector(root, select, themes, activeThemeId) {
    const fragment = root.createDocumentFragment();
    for (const theme of themes) {
        const option = root.createElement('option');
        option.value = theme.id;
        option.textContent = theme.name;
        option.selected = theme.id === activeThemeId;
        fragment.appendChild(option);
    }
    select.replaceChildren(fragment);
    if (!themes.some(theme => theme.id === activeThemeId)) {
        select.value = themes[0]?.id || '';
    }
    select.disabled = themes.length === 0;
}

function enhanceCatalogueComboboxes(root) {
    return Array.from(root.querySelectorAll('[data-catalog-combobox]'), select => {
        const picker = enhanceSelectCombobox(select, {
            ariaLabel: select.getAttribute('aria-label') || '',
        });
        picker?.setDisabled(select.disabled);
        return picker;
    }).filter(Boolean);
}

export async function initDesignSystemCatalog({
    root = document,
    fetchImpl = globalThis.fetch,
    themeManifest,
} = {}) {
    initTooltips({ root });
    const sections = sectionRecords(root);
    const comboboxes = enhanceCatalogueComboboxes(root);
    renderIndex(root, sections);
    applySectionFilter(root, sections, '');
    refreshTokenValues(root);

    const search = root.querySelector('#catalog-search');
    search?.addEventListener('input', () => {
        applySectionFilter(root, sections, search.value);
    });

    const select = root.querySelector('#theme-select');
    const stylesheet = root.querySelector('#catalog-theme');
    if (!select || !stylesheet) return { sections, themes: [], comboboxes };

    try {
        const themes = normalizeThemeManifest(await loadThemeManifest(themeManifest, fetchImpl));
        if (themes.length === 0) throw new Error('Theme manifest contains no valid themes');

        const activeThemeId = stylesheet.dataset.themeId || 'default';
        populateThemeSelector(root, select, themes, activeThemeId);
        const activeTheme = themes.find(theme => theme.id === select.value) || themes[0];
        root.documentElement.dataset.theme = activeTheme.id;
        setThemeStatus(root, `${themes.length} themes · ${activeTheme.name}`);

        stylesheet.addEventListener('load', () => {
            const theme = themes.find(item => item.id === select.value);
            root.documentElement.dataset.theme = select.value;
            refreshTokenValues(root);
            setThemeStatus(root, `${themes.length} themes · ${theme?.name || select.value}`);
        });
        stylesheet.addEventListener('error', () => {
            setThemeStatus(root, 'Could not load that theme', 'error');
        });
        select.addEventListener('change', () => {
            const theme = themes.find(item => item.id === select.value);
            setThemeStatus(root, `Loading ${theme?.name || select.value}…`, 'loading');
            stylesheet.dataset.themeId = select.value;
            stylesheet.href = themeStylesheetPath(select.value);
        });

        return { sections, themes, comboboxes };
    } catch (error) {
        select.disabled = true;
        setThemeStatus(root, 'Theme list unavailable; showing Figaro Dark', 'error');
        console.error('Could not initialize the design-system theme selector:', error);
        return { sections, themes: [], comboboxes, error };
    }
}
