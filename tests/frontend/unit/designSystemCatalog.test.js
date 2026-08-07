import fs from 'node:fs';
import path from 'node:path';

import { initDesignSystemCatalog } from '../../../frontend/design-system/catalog.js';
import {
    matchesCatalogQuery,
    normalizeThemeManifest,
    themeStylesheetPath,
} from '../../../frontend/design-system/themeCatalogModel.js';
import {
    designSystemBundlePath,
    designSystemSourceHash,
} from '../../../scripts/designSystemBundle.js';
import {
    applicationStylePaths,
} from '../support/styleSources.js';

const manifestPath = path.resolve('frontend/themes/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const componentRegistryPath = path.resolve('frontend/design-system/approved-components.json');
const componentRegistry = JSON.parse(fs.readFileSync(componentRegistryPath, 'utf8'));
const styleManifest = JSON.parse(
    fs.readFileSync(path.resolve('frontend/design-system/style-manifest.json'), 'utf8'),
);
const themeContract = JSON.parse(
    fs.readFileSync(path.resolve('frontend/design-system/theme-contract.json'), 'utf8'),
);

describe('design-system catalogue', () => {
    test('indexes the shared component families and intentional feature variants', () => {
        const source = fs.readFileSync(path.resolve('frontend/design-system/index.html'), 'utf8');
        const template = document.createElement('template');
        template.innerHTML = source;

        const sections = Array.from(
            template.content.querySelectorAll('[data-catalog-section]'),
            section => section.id,
        );
        expect(sections).toEqual([
            'foundations',
            'shell-navigation',
            'buttons-actions',
            'form-controls',
            'menus-popovers',
            'surfaces-cards',
            'indicators-metadata',
            'feedback-states',
            'dialogs',
            'markdown-content',
            'loading-progress',
            'review-map',
        ]);

        const catalogue = template.content;
        for (const selector of [
            '[data-catalog-combobox]',
            '.ui-picker .theme-picker-btn',
            '.ui-stepper.font-size-control',
            '.ui-stepper.text-width-control',
            '.ui-button.settings-action-btn',
            '.ui-button.drawio-edit-button',
            '.ui-menu.context-menu',
            '.ui-icon-button',
            '.ui-badge',
            '.ui-field',
            '.ui-date-picker',
            '.ui-notice',
            '.settings-card',
            '.home-card',
            '.kanban-card',
            '.result-card',
            '.custom-modal',
            '.markdown-preview-document',
            '.drawio-loading-card',
        ]) {
            expect(catalogue.querySelector(selector)).not.toBeNull();
        }

        const ids = Array.from(catalogue.querySelectorAll('[id]'), element => element.id);
        expect(new Set(ids).size).toBe(ids.length);

        for (const element of catalogue.querySelectorAll('link[href], script[src], img[src]')) {
            const attribute = element.hasAttribute('href') ? 'href' : 'src';
            const assetPath = element.getAttribute(attribute);
            expect(assetPath).toMatch(/^\.\.?\//);
            expect(fs.existsSync(path.resolve('frontend/design-system', assetPath))).toBe(true);
        }
        expect(catalogue.querySelector('script[src]').getAttribute('src')).toBe('./catalog.bundle.js');
        expect(catalogue.querySelector('.catalog-audit-note').textContent).toContain('Shared foundations');
        expect(Array.from(
            catalogue.querySelectorAll('#review-map tbody tr td:last-child'),
            cell => cell.textContent.trim(),
        )).not.toContain('Review');

        const comboboxSources = Array.from(
            catalogue.querySelectorAll('#form-controls [data-catalog-combobox]'),
            select => select.id,
        );
        expect(comboboxSources).toEqual([
            'catalog-auto-save',
            'catalog-link-style',
            'catalog-unavailable-combobox',
        ]);

        const allTabsMenu = catalogue.querySelector('#menus-popovers .all-tabs-dropdown');
        expect(allTabsMenu.getAttribute('role')).toBe('menu');
        expect(allTabsMenu.getAttribute('aria-label')).toBe('All open tabs');
        expect([...allTabsMenu.querySelectorAll('.all-tabs-item')].every(item => (
            item instanceof HTMLButtonElement && item.getAttribute('role') === 'menuitem'
        ))).toBe(true);
        expect([...catalogue.querySelectorAll('.all-tabs-btn')].every(button => (
            button.getAttribute('aria-label') === 'Show all open tabs'
            && button.getAttribute('aria-haspopup') === 'menu'
            && button.getAttribute('aria-expanded') === 'false'
        ))).toBe(true);
        expect(catalogue.querySelector('.ds-tab-bar').classList.contains('tabs-can-scroll-end')).toBe(true);
    });

    test('loads the canonical approved primitives in Figaro and the catalogue', () => {
        const app = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
        const catalogue = fs.readFileSync(path.resolve('frontend/design-system/index.html'), 'utf8');
        const appStyles = [...app.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
            .map(match => match[1]);
        const catalogueStyles = [...catalogue.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
            .map(match => match[1]);
        const expectedAppStyles = styleManifest.eagerStylesheets;
        const expectedCatalogueStyles = expectedAppStyles.map(stylesheet => (
            stylesheet.startsWith('design-system/')
                ? `./${stylesheet.slice('design-system/'.length)}`
                : `../${stylesheet}`
        ));

        expect(appStyles.filter(stylesheet => expectedAppStyles.includes(stylesheet)))
            .toEqual(expectedAppStyles);
        expect(catalogueStyles.filter(stylesheet => expectedCatalogueStyles.includes(stylesheet)))
            .toEqual(expectedCatalogueStyles);
        expect(expectedAppStyles[0]).toBe('design-system/tokens.css');
        expect(expectedAppStyles.at(-1)).toBe('design-system/theme-surfaces.css');
        expect(expectedAppStyles.indexOf('design-system/primitives.css'))
            .toBeGreaterThan(expectedAppStyles.indexOf('styles/overrides.css'));

        const compatibilityStyles = fs.readFileSync(path.resolve('frontend/styles.css'), 'utf8');
        const compatibilityImports = [...compatibilityStyles.matchAll(/@import url\("\.\/([^"]+)"\);/g)]
            .map(match => match[1]);
        expect(compatibilityImports).toEqual(expectedAppStyles);

        const primitiveStyles = fs.readFileSync(path.resolve('frontend/design-system/primitives.css'), 'utf8');
        const featureStyles = applicationStylePaths
            .filter(stylesheet => stylesheet.startsWith('frontend/styles/'))
            .map(stylesheet => fs.readFileSync(path.resolve(stylesheet), 'utf8'))
            .join('\n');
        const approvedSelectors = componentRegistry.families.flatMap(family => family.primitives).sort();
        const implementedSelectors = [...new Set(
            [...primitiveStyles.matchAll(/\.ui-[a-z0-9-]+/g)].map(match => match[0]),
        )].sort();

        expect(componentRegistry.families.map(family => family.id)).toEqual([
            'picker',
            'stepper',
            'button',
            'icon-button',
            'badge',
            'menu',
            'field',
            'date-picker',
            'notice',
            'document-tabs',
            'editor-fold-control',
        ]);
        expect(implementedSelectors).toEqual(approvedSelectors);
        expect(featureStyles).not.toMatch(/^\.ui-[a-z0-9-]+(?:\s|:|,|\{)/m);
        expect(componentRegistry.approvalPolicy).toContain('explicit user approval');
    });

    test('keeps all bundled themes on the token-only theme contract', () => {
        const tokenDefaults = fs.readFileSync(
            path.resolve('frontend/design-system/tokens.css'),
            'utf8',
        );
        const tokenConsumers = applicationStylePaths
            .filter(stylesheet => !stylesheet.endsWith('/tokens.css'))
            .map(stylesheet => fs.readFileSync(path.resolve(stylesheet), 'utf8'))
            .join('\n');
        const required = new Set(themeContract.requiredThemeTokens);
        const optionalSemantic = new Set(themeContract.optionalSemanticTokens);
        const optionalArtDirection = new Set(themeContract.optionalArtDirectionTokens);
        const optional = new Set([...optionalSemantic, ...optionalArtDirection]);
        const allowed = new Set([...required, ...optional]);

        for (const token of allowed) expect(tokenDefaults).toContain(`${token}:`);
        for (const token of optional) {
            expect(tokenConsumers).toMatch(new RegExp(`var\\(${token}(?:,|\\))`));
        }

        for (const theme of normalizeThemeManifest(manifest)) {
            const source = fs.readFileSync(path.resolve(`frontend/themes/${theme.id}.css`), 'utf8');
            const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').trim();
            const rootRule = withoutComments.match(/^:root\s*\{([\s\S]*)\}$/);
            expect(rootRule).not.toBeNull();
            expect(rootRule[1].replace(/--[a-z0-9-]+\s*:[^;]+;/gi, '').trim()).toBe('');

            const declarations = [...rootRule[1].matchAll(/(--[a-z0-9-]+)\s*:/gi)]
                .map(match => match[1]);
            const declared = new Set(declarations);
            expect(declarations).toHaveLength(declared.size);
            expect([...required].filter(token => !declared.has(token))).toEqual([]);
            expect([...declared].filter(token => !allowed.has(token))).toEqual([]);
        }
    });

    test('uses the approved shared primitives in production without merging distinct card or toggle semantics', () => {
        const sources = [
            'frontend/index.html',
            'frontend/js/backlinks.js',
            'frontend/js/dialogs.js',
            'frontend/js/drawio.js',
            'frontend/js/frontmatterPlugin.js',
            'frontend/js/historyPanel.js',
            'frontend/js/kanban.js',
            'frontend/js/markdownPreview.js',
            'frontend/js/pdfPreview.js',
            'frontend/js/datePicker.js',
            'frontend/js/editor.js',
            'frontend/js/selectCombobox.js',
            'frontend/js/tabManager.js',
            'frontend/js/vaultHealth.js',
        ].map(file => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');

        for (const primitive of componentRegistry.families.map(family => `ui-${family.id}`)) {
            expect(sources).toContain(primitive);
        }

        const styles = fs.readFileSync(path.resolve('frontend/design-system/primitives.css'), 'utf8');
        for (const selector of [
            '.ui-picker',
            '.ui-stepper',
            '.ui-button',
            '.ui-icon-button',
            '.ui-badge',
            '.ui-field',
            '.ui-date-picker',
            '.ui-menu',
            '.ui-notice',
            '.ui-document-tabs',
            '.ui-document-tab',
            '.ui-editor-fold-control',
        ]) {
            expect(styles).toContain(selector);
        }
        expect(styles).not.toMatch(/\.font-size-control\s*\{[^}]*border:/s);
        expect(styles).not.toMatch(/\.text-width-control\s*\{[^}]*border:/s);
        expect(styles).not.toMatch(/\.settings-picker-btn\s*\{/);
        expect(styles).not.toMatch(/\.settings-action-btn\s*\{/);

        const catalogue = fs.readFileSync(path.resolve('frontend/design-system/index.html'), 'utf8');
        expect(catalogue).toContain('<div class="settings-card');
        expect(catalogue).toContain('class="toggle-switch"');
        expect(catalogue).not.toContain('class="ui-card');
        expect(catalogue).not.toContain('class="ui-toggle');
    });

    test('binds remaining approved-family controls to shared primitives', () => {
        const bindings = new Map([
            ['frontend/index.html', ['ui-icon-button md-cheatsheet-close']],
            ['frontend/js/home.js', ['ui-button home-card-action']],
            ['frontend/js/views/searchView.js', ['ui-button search-filter-chip']],
            ['frontend/js/frontmatterPlugin.js', [
                'ui-button cm-frontmatter-panel-action',
                'ui-button cm-frontmatter-panel-add',
            ]],
            ['frontend/js/kanban.js', [
                'ui-icon-button ui-icon-button--small kanban-column-btn',
                'ui-icon-button ui-icon-button--small ui-icon-button--danger kanban-card-delete',
            ]],
            ['frontend/js/tabManager.js', [
                'class="ui-button" data-kanban-density',
                'class="ui-button" data-kanban-layout',
            ]],
        ]);

        for (const [file, expectedBindings] of bindings) {
            const source = fs.readFileSync(path.resolve(file), 'utf8');
            for (const binding of expectedBindings) expect(source).toContain(binding);
        }
    });

    test('keeps the explicit component-approval gate in repository instructions', () => {
        const instructions = fs.readFileSync(path.resolve('AGENTS.md'), 'utf8');
        expect(instructions).toContain('explicit user approval');
        expect(instructions).toContain('approved-components.json');
        expect(instructions).toContain('design-system/primitives.css');
    });

    test('normalizes every bundled theme and maps it to an existing stylesheet', () => {
        const themes = normalizeThemeManifest(manifest);
        expect(themes).toHaveLength(17);
        expect(themes[0]).toEqual({ id: 'default', name: 'Figaro Dark' });

        for (const theme of themes) {
            const stylesheet = themeStylesheetPath(theme.id);
            expect(stylesheet).toBe(`../themes/${theme.id}.css`);
            expect(fs.existsSync(path.resolve('frontend/design-system', stylesheet))).toBe(true);
        }
    });

    test('keeps the direct-file classic bundle synchronized with its module sources', () => {
        const root = path.resolve('.');
        const bundle = fs.readFileSync(designSystemBundlePath(root), 'utf8');
        expect(bundle).toContain(`Source hash: ${designSystemSourceHash(root)}.`);
    });

    test('rejects malformed and duplicate manifest records', () => {
        expect(normalizeThemeManifest([
            { id: 'default', name: 'Figaro Dark' },
            { id: 'default', name: 'Duplicate' },
            { id: '../escape', name: 'Unsafe' },
            { id: 'valid-theme', name: '  Valid Theme  ' },
            { id: 'missing-name' },
        ])).toEqual([
            { id: 'default', name: 'Figaro Dark' },
            { id: 'valid-theme', name: 'Valid Theme' },
        ]);
        expect(() => themeStylesheetPath('../escape')).toThrow('Invalid theme identifier');
    });

    test('matches headings, terms, and production selectors for catalogue search', () => {
        const section = {
            id: 'buttons-actions',
            title: 'Buttons & action variants',
            terms: 'primary secondary compact',
            selectors: ['.settings-action-btn', '.drawio-edit-button'],
        };
        expect(matchesCatalogQuery(section, 'buttons')).toBe(true);
        expect(matchesCatalogQuery(section, 'compact')).toBe(true);
        expect(matchesCatalogQuery(section, 'compact action')).toBe(true);
        expect(matchesCatalogQuery(section, 'drawio-edit')).toBe(true);
        expect(matchesCatalogQuery(section, 'dialog')).toBe(false);
        expect(matchesCatalogQuery(section, '')).toBe(true);
    });

    test('loads the manifest, switches stylesheets, and filters the generated index', async () => {
        document.body.innerHTML = `
            <link id="catalog-theme" href="../themes/default.css" data-theme-id="default">
            <select id="theme-select" disabled><option>Loading…</option></select>
            <p id="theme-status"></p>
            <input id="catalog-search">
            <p id="catalog-visible-count"></p>
            <nav id="catalog-index"></nav>
            <p id="catalog-empty" hidden></p>
            <label>
                Auto-save
                <select id="catalog-test-combobox" data-catalog-combobox aria-label="Auto-save interval">
                    <option value="300">5 minutes</option>
                    <option value="0">Off</option>
                </select>
            </label>
            <label>
                Unavailable
                <select id="catalog-disabled-combobox" data-catalog-combobox disabled>
                    <option>Loading…</option>
                </select>
            </label>
            <section id="buttons-actions" data-catalog-section data-catalog-terms="compact actions">
                <h2>Buttons</h2><code class="ds-selector">.settings-action-btn</code>
            </section>
            <section id="menus-popovers" data-catalog-section data-catalog-terms="overlays">
                <h2>Menus</h2><code class="ds-selector">.context-menu</code>
            </section>
        `;

        const result = await initDesignSystemCatalog({
            root: document,
            fetchImpl: jest.fn().mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(manifest),
            }),
        });

        const select = document.querySelector('#theme-select');
        expect(result.themes).toHaveLength(17);
        expect(select.disabled).toBe(false);
        expect(select.options).toHaveLength(17);
        expect(select.value).toBe('default');
        expect(document.querySelectorAll('#catalog-index a')).toHaveLength(2);
        expect(document.querySelector('#theme-status').textContent).toBe('17 themes · Figaro Dark');
        expect(result.comboboxes).toHaveLength(2);

        const source = document.querySelector('#catalog-test-combobox');
        const picker = source.closest('.select-combobox');
        const trigger = picker.querySelector('.select-combobox-trigger');
        const menu = picker.querySelector('.select-combobox-menu');
        expect(source.classList.contains('select-combobox-native')).toBe(true);
        expect(picker.classList.contains('ui-picker')).toBe(true);
        expect(trigger.classList.contains('ui-picker-trigger')).toBe(true);
        expect(menu.classList.contains('ui-menu')).toBe(true);
        expect(menu.classList.contains('ui-picker-menu')).toBe(true);
        expect(menu.querySelector('[role="option"]').classList.contains('ui-menu-item')).toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(menu.hidden).toBe(true);

        const changed = jest.fn();
        source.addEventListener('change', changed);
        trigger.click();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(menu.hidden).toBe(false);
        menu.querySelector('[data-value="0"]').click();
        expect(source.value).toBe('0');
        expect(trigger.querySelector('.select-combobox-label').textContent).toBe('Off');
        expect(changed).toHaveBeenCalledTimes(1);
        expect(menu.hidden).toBe(true);

        const disabledTrigger = document.querySelector('#catalog-disabled-combobox')
            .closest('.select-combobox')
            .querySelector('.select-combobox-trigger');
        expect(disabledTrigger.disabled).toBe(true);

        select.value = 'figaro-light';
        select.dispatchEvent(new Event('change'));
        expect(document.querySelector('#catalog-theme').getAttribute('href')).toBe('../themes/figaro-light.css');
        expect(document.querySelector('#theme-status').textContent).toBe('Loading Figaro Light…');

        document.querySelector('#catalog-theme').dispatchEvent(new Event('load'));
        expect(document.documentElement.dataset.theme).toBe('figaro-light');
        expect(document.querySelector('#theme-status').textContent).toBe('17 themes · Figaro Light');

        const search = document.querySelector('#catalog-search');
        search.value = 'button';
        search.dispatchEvent(new Event('input'));
        expect(document.querySelector('#buttons-actions').hidden).toBe(false);
        expect(document.querySelector('#menus-popovers').hidden).toBe(true);
        expect(document.querySelector('#catalog-visible-count').textContent).toBe('1 of 2 groups');

        search.value = 'not-a-real-component';
        search.dispatchEvent(new Event('input'));
        expect(document.querySelector('#catalog-empty').hidden).toBe(false);
        expect(document.querySelector('#catalog-visible-count').textContent).toBe('0 of 2 groups');
    });

    test('keeps the default theme visible when the manifest cannot be loaded', async () => {
        document.body.innerHTML = `
            <link id="catalog-theme" href="../themes/default.css" data-theme-id="default">
            <select id="theme-select"><option>Loading…</option></select>
            <p id="theme-status"></p>
            <input id="catalog-search">
            <p id="catalog-visible-count"></p>
            <nav id="catalog-index"></nav>
            <p id="catalog-empty" hidden></p>
        `;
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await initDesignSystemCatalog({
            root: document,
            fetchImpl: jest.fn().mockRejectedValue(new Error('offline')),
        });

        expect(result.error).toBeInstanceOf(Error);
        expect(document.querySelector('#theme-select').disabled).toBe(true);
        expect(document.querySelector('#catalog-theme').getAttribute('href')).toBe('../themes/default.css');
        expect(document.querySelector('#theme-status').textContent)
            .toBe('Theme list unavailable; showing Figaro Dark');
        expect(document.querySelector('#theme-status').dataset.state).toBe('error');
        consoleError.mockRestore();
    });
});
