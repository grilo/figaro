import { createWritingDecisionsView } from '../js/views/writingDecisionsView.js';
import { createWritingResultsView } from '../js/views/writingResultsView.js';
import {
    matchesCatalogQuery,
    normalizeThemeManifest,
    THEME_MANIFEST_PATH,
    themeStylesheetPath,
} from './themeCatalogModel.js';
import { enhanceSelectCombobox } from '../js/selectCombobox.js';
import { enhanceSettingsPicker } from '../js/settingsPicker.js';
import { initTooltips } from '../js/tooltip.js';
import { createWritingInlineView } from '../js/views/writingInlineView.js';
import { createWritingLensesView } from '../js/views/writingLensesView.js';
import { changeWritingLenses } from '../js/core/writingLensesModel.js';
import { createDisclosure } from '../js/disclosure.js';

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
            className: select.closest('.settings-card') ? 'ui-picker--quiet' : '',
        });
        picker?.setDisabled(select.disabled);
        return picker;
    }).filter(Boolean);
}

function enhanceCatalogueSettingsPickers(root) {
    const examples = {
        theme: {
            value: 'default',
            label: 'Theme',
            options: [
                { id: 'default', name: 'Figaro Dark' },
                { id: 'figaro-light', name: 'Figaro Light' },
                { id: 'figaro-crt-phosphor', name: 'Figaro CRT Phosphor' },
            ],
            optionClass: 'theme-picker-item',
        },
        font: {
            value: 'inter',
            label: 'Font',
            options: [
                { id: 'inter', name: 'Inter' },
                { id: 'figtree', name: 'Figtree' },
                { id: 'atkinson', name: 'Atkinson Hyperlegible' },
            ],
            optionClass: 'font-picker-item',
        },
    };
    return Array.from(root.querySelectorAll('[data-catalog-settings-picker]'), picker => {
        const example = examples[picker.dataset.catalogSettingsPicker];
        if (!example) return null;
        return enhanceSettingsPicker({
            trigger: picker.querySelector('.ui-picker-trigger'),
            menu: picker.querySelector('.ui-picker-menu'),
            options: example.options,
            value: example.value,
            ariaLabel: example.label,
            optionClass: example.optionClass,
        });
    }).filter(Boolean);
}

export async function initDesignSystemCatalog({
    root = document,
    fetchImpl = globalThis.fetch,
    themeManifest,
} = {}) {
    initTooltips({ root });
    for (const host of root.querySelectorAll('[data-disclosure-state-demo]')) {
        const busy = host.dataset.disclosureStateDemo === 'busy';
        const content = document.createElement('p'); content.textContent = 'Related options appear below the disclosure.';
        const disclosure = createDisclosure({ id: `catalog-disclosure-${host.dataset.disclosureStateDemo}`, label: 'Options', content });
        disclosure.setSummary(busy ? 'Loading…' : 'Unavailable');
        disclosure.setDisabled(true, { busy });
        host.replaceChildren(disclosure.element);
    }
    for (const host of root.querySelectorAll('[data-writing-lenses-demo]')) {
        let preferences = { language: 'en-US', lenses: ['spelling', 'plain', 'direct'] };
        const view = createWritingLensesView({ id: 'catalog-writing-lenses',
            onChange(action) { preferences = changeWritingLenses(preferences, action); view.update({ preferences, status: 'saved' }); },
            onRetry() {}, onApplyAll() { view.element.querySelector('[data-save-status]').textContent = 'Example choices applied to all documents.'; } });
        view.update({ preferences, status: 'saved' });
        host.replaceChildren(view.element);
    }
    for (const host of root.querySelectorAll('[data-catalog-writing-suggestion]')) {
        const report = text => { const status = host.querySelector('[role="status"]'); status.hidden = false; status.textContent = text; };
        host.replaceChildren(createWritingInlineView({
            findings: [{ id: 'catalog-word', lens: 'spelling', actual: 'teh', title: 'Possible spelling mistake', message: 'Review this word in context.',
                fixes: [{ expected: 'teh', replacement: 'the' }] }],
            onApply: () => report('Example replacement applied.'), onIgnore: () => report('Example occurrence ignored.'),
            onAddWord: async () => report('Example word added.'), onClose: () => report('Example review closed.'),
        }));
    }
    for (const host of root.querySelectorAll('[data-writing-result-demo]')) {
        const view = createWritingResultsView({ onApply: () => view.announce('Example replacement applied.'),
            onApplyAll: () => view.announce('Both example occurrences replaced in one undoable action.'),
            onDismiss: () => view.announce('Example occurrence remembered.'), onAcceptAcronym: () => view.announce('Example acronym accepted for this document.'), onNavigate: () => view.announce('Example selected.'), onRetry() {} });
        view.update({ current: { id: 'catalog', language: 'en-US', preferences: { lenses: ['plain', 'readability', 'inclusive', 'consistency'] }, spelling: { enabled: false } },
            count: 7, groups: [{ text: 'We utilize words in order to help.', findings: [
                { id: 'word', title: 'Simpler word', message: 'Consider a familiar alternative.', actual: 'utilize', kind: 'lexicon.complex-word', sources: [], fixes: [{ expected: 'utilize', replacement: 'use' }] },
                { id: 'word-two', title: 'Simpler word', message: 'Consider a familiar alternative.', actual: 'utilize', kind: 'lexicon.complex-word', sources: [], fixes: [{ expected: 'utilize', replacement: 'use' }] },
                { id: 'phrase', title: 'Shorter phrase', message: 'Consider a shorter alternative.', actual: 'in order to', kind: 'style.wordiness', sources: [], fixes: [{ expected: 'in order to', replacement: 'to' }] },
                { id: 'sentence', title: 'Long sentence', message: 'Consider splitting this sentence where the idea changes.', actual: 'A long sentence in your draft.', kind: 'readability.long-sentence', sources: [], fixes: [] },
                { id: 'inclusive', title: 'Consider inclusive wording', message: 'Review this wording in context and choose an alternative that fits your meaning.', actual: 'chairman', kind: 'language.inclusive', sources: [], fixes: [{ expected: 'chairman', replacement: 'chairperson' }] },
                { id: 'spacing', title: 'Space between sentences', message: 'Consider using one space between sentences on the same line.', actual: 'sentence.  Two', kind: 'style.sentence-spacing', sources: [], fixes: [{ expected: 'sentence.  Two', replacement: 'sentence. Two' }] },
                { id: 'acronym', title: 'Consider explaining this acronym', message: 'Consider spelling it out if your readers may not know it.', actual: 'SLO', kind: 'clarity.undefined-acronym', sources: [], fixes: [] },
            ] }] });
        const saved = createWritingDecisionsView({ id: 'catalog-saved-decisions',
            onRestore: async () => saved.update({ status: 'saved', decisions: [] }, 'catalog'), onRetry: async () => {} });
        saved.update({ status: 'saved', decisions: [{ id: 'catalog-accepted-acronym', type: 'acronym', acronym: 'SLO', language: 'en-US' }] }, 'catalog');
        host.replaceChildren(view.element, saved.element);
    }
    const sections = sectionRecords(root);
    const comboboxes = enhanceCatalogueComboboxes(root);
    const settingsPickers = enhanceCatalogueSettingsPickers(root);
    renderIndex(root, sections);
    applySectionFilter(root, sections, '');
    refreshTokenValues(root);

    const search = root.querySelector('#catalog-search');
    search?.addEventListener('input', () => {
        applySectionFilter(root, sections, search.value);
    });

    const select = root.querySelector('#theme-select');
    const stylesheet = root.querySelector('#catalog-theme');
    if (!select || !stylesheet) return { sections, themes: [], comboboxes, settingsPickers };

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

        return { sections, themes, comboboxes, settingsPickers };
    } catch (error) {
        select.disabled = true;
        setThemeStatus(root, 'Theme list unavailable; showing Figaro Dark', 'error');
        console.error('Could not initialize the design-system theme selector:', error);
        return { sections, themes: [], comboboxes, settingsPickers, error };
    }
}
