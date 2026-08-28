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
            '.ui-stepper.tab-size-control',
            '.ui-button.settings-action-btn',
            '.ui-button.ui-button--quiet.cm-frontmatter-panel-action',
            '.ui-button.drawio-edit-button',
            '.ui-button.cm-drawio-action-button',
            '.ui-menu.context-menu',
            '.ds-help-popup',
            '.md-cheatsheet-tab.ui-button--accent',
            '.ui-tooltip',
            '.ui-icon-button',
            '.ui-badge',
            '.ui-field',
            '.ui-field--quiet',
            '.ui-checkbox',
            '.ui-date-picker',
            '.ui-date-picker-day--weekend',
            '.ui-date-picker-day--note-1',
            '.ui-date-picker-day--note-2',
            '.ui-date-picker-day--note-3',
            '.ui-date-picker-day--note-4',
            '.ui-date-picker-day--note-5',
            '.ui-date-picker-day--due',
            '.cal-day-tooltip',
            '.ui-notice',
            '.ui-document-tabs--titlebar',
            '.ui-document-tab--connected',
            '.settings-card',
            '.home-card',
            '.kanban-card',
            '.result-card',
            '.custom-modal',
            '.raw-text-preview-source',
            '.raw-text-preview-copy.ui-button--primary',
            '.drawio-loading-card',
            '.ui-spinner',
            '.ui-skeleton',
            '.ui-progress',
            '.ui-editor-block-guide--danger',
            '.create-inbox-note',
            '.file-tree-node.selected',
            '.file-tree-node.cut-marked',
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
        expect(catalogue.querySelector('.ds-help-popup').textContent)
            .toMatch(/#tag.*Press Space for due-date actions/);
        expect(Array.from(
            catalogue.querySelectorAll('.ds-help-popup [role="tab"]'),
            tab => tab.textContent.trim(),
        )).toEqual(['Markdown', 'Macros', 'Shortcuts']);
        expect(catalogue.querySelector('.ds-help-popup').textContent)
            .toMatch(/F1.*Toggle Figaro help/);
        expect(catalogue.querySelector('.context-menu').textContent)
            .toMatch(/Editor.*Cut.*Copy.*Paste/s);
        expect(catalogue.querySelector('.context-menu').textContent).not.toContain('Add row above');
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
        expect(catalogue.querySelector('.top-bar-center .ui-document-tabs--titlebar')).not.toBeNull();
        expect(catalogue.querySelector('.ds-tab-bar .ui-document-tab--connected.ui-document-tab--active')).not.toBeNull();
        expect([...catalogue.querySelectorAll('.ds-tab-state .ds-tab-bar')]
            .at(-1)?.querySelector('.tab-strip')?.children).toHaveLength(0);
        expect(catalogue.querySelector('.ds-status-bar .status-left').getAttribute('aria-label'))
            .toBe('Application status');
        expect(catalogue.querySelector('.ds-status-bar .status-right').getAttribute('aria-label'))
            .toBe('Active buffer status');
        expect(catalogue.querySelector('.ds-status-bar .status-buffer-left').getAttribute('aria-label'))
            .toBe('History, relationships, and editor state');
        expect(catalogue.querySelector('.ds-status-bar .status-buffer-right').getAttribute('aria-label'))
            .toBe('Document metrics');
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
            'tooltip',
            'field',
            'checkbox',
            'date-picker',
            'notice',
            'document-tabs',
            'editor-fold-control',
            'spinner',
            'skeleton',
            'progress',
        ]);
        expect(implementedSelectors).toEqual(approvedSelectors);
        expect(featureStyles).not.toMatch(/^\.ui-[a-z0-9-]+(?:\s|:|,|\{)/m);
        expect(componentRegistry.approvalPolicy).toContain('explicit user approval');
        expect(componentRegistry.featureVariants).toEqual([
            '.file-tree-node.selected',
            '.file-tree-node.cut-marked',
        ]);
    });

    test('keeps Search notes, Quick note, and selected file surfaces within the sidebar border budget', () => {
        const appSource = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
        const appTemplate = document.createElement('template');
        appTemplate.innerHTML = appSource;
        expect(appTemplate.content.querySelector('#global-search-input').classList
            .contains('ui-field--quiet')).toBe(true);

        const catalogueSource = fs.readFileSync(
            path.resolve('frontend/design-system/index.html'),
            'utf8',
        );
        const catalogueTemplate = document.createElement('template');
        catalogueTemplate.innerHTML = catalogueSource;
        expect(catalogueTemplate.content.querySelector('#global-search-input').classList
            .contains('ui-field--quiet')).toBe(true);
        expect(catalogueTemplate.content.querySelector('.create-inbox-note')).not.toBeNull();

        const primitives = fs.readFileSync(
            path.resolve('frontend/design-system/primitives.css'),
            'utf8',
        );
        expect(primitives).toMatch(
            /\.ui-field\.ui-field--quiet,[\s\S]*?border-color:\s*transparent;/,
        );
        expect(primitives).toMatch(
            /\.ui-field\.ui-field--quiet:focus-visible:not\(\[aria-invalid="true"\]\)[\s\S]*?border-color:\s*transparent;/,
        );
        expect(primitives).toMatch(
            /\.ui-field:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 3px[^}]*var\(--accent-color\)/s,
        );
        expect(primitives).toMatch(
            /\.ui-field\[aria-invalid="true"\]:hover:not\(:disabled\)\s*\{[^}]*border-color:\s*var\(--danger-color\)/s,
        );

        const shell = fs.readFileSync(path.resolve('frontend/styles/shell.css'), 'utf8');
        expect(shell).toMatch(
            /\.create-inbox-note\s*\{[^}]*border:\s*1px solid transparent/s,
        );
        expect(shell).toMatch(
            /\.create-inbox-note:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px var\(--focus-ring\)/s,
        );
        expect(shell).toMatch(
            /\.create-inbox-note\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--text-color\) 3%, var\(--sidebar-bg\)\)/s,
        );
        expect(shell).toMatch(
            /\.create-inbox-note:hover:not\(:disabled\),[\s\S]*?\.create-inbox-note:focus-visible\s*\{[^}]*background:\s*var\(--hover-bg\)/s,
        );
        expect(shell).toMatch(
            /\.create-inbox-note small\s*\{[^}]*color:\s*var\(--text-dim\)/s,
        );
        expect(shell).toMatch(
            /\.file-tree-node \.node-icon\s*\{[^}]*color:\s*var\(--text-muted\)/s,
        );
        expect(shell).not.toContain('--inbox-capture-color');
        expect(shell).toMatch(
            /\.file-tree-item > \.file-tree-node\.selected\s*\{[^}]*box-shadow:\s*none/s,
        );
        expect(shell).toMatch(
            /\.file-tree-node:focus-visible\s*\{[^}]*outline:\s*1px solid/s,
        );
        expect(shell).toMatch(
            /\.search-input-wrapper \.search-count\[hidden\]\s*\{[^}]*display:\s*none/s,
        );

        for (const theme of ['default', 'figaro-light', 'figaro-crt-phosphor']) {
            const source = fs.readFileSync(path.resolve(`frontend/themes/${theme}.css`), 'utf8');
            expect(source).toContain('--file-node-selected-shadow: none;');
            expect(source).toMatch(/--file-node-selected-surface:\s*linear-gradient/);
            expect(source).toContain('--file-node-selected-weight: 600;');
        }
    });

    test('distinguishes the workspace sidebar and document outline icon geometries', () => {
        const parse = source => {
            const template = document.createElement('template');
            template.innerHTML = source;
            return template.content;
        };
        const iconPaths = control => [...control.querySelectorAll('path')]
            .map(pathElement => pathElement.getAttribute('d'));
        const assertPair = root => {
            const sidebar = root.querySelector('[aria-label="Toggle sidebar"]');
            const outline = root.querySelector('[aria-label="Show document outline"]');
            expect(sidebar.querySelector('rect')).not.toBeNull();
            expect(iconPaths(sidebar)).toEqual(['M9 3v18']);
            expect(iconPaths(outline)).toEqual([
                'M8 5h13',
                'M13 12h8',
                'M13 19h8',
                'M3 10a2 2 0 0 0 2 2h3',
                'M3 5v12a2 2 0 0 0 2 2h3',
            ]);
            expect(iconPaths(sidebar)).not.toEqual(iconPaths(outline));
        };

        assertPair(parse(fs.readFileSync(path.resolve('frontend/index.html'), 'utf8')));
        assertPair(parse(fs.readFileSync(
            path.resolve('frontend/design-system/index.html'),
            'utf8',
        )));
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

    test('keeps CRT Phosphor ambient effects theme-owned and reduced-motion safe', () => {
        const theme = normalizeThemeManifest(manifest).find(item => (
            item.id === 'figaro-crt-phosphor'
        ));
        const source = fs.readFileSync(
            path.resolve('frontend/themes/figaro-crt-phosphor.css'),
            'utf8',
        );
        const surfaces = fs.readFileSync(
            path.resolve('frontend/design-system/theme-surfaces.css'),
            'utf8',
        );

        expect(theme).toEqual({
            id: 'figaro-crt-phosphor',
            name: 'Figaro CRT Phosphor',
        });
        expect(source).toContain('--bg-color: #04110b;');
        expect(source).toContain('--accent-color: #39ff7a;');
        expect(source).toContain('--font-sans: \'JetBrains Mono\'');
        expect(source).toContain('--screen-vignette:');
        expect(source).toContain('--screen-scan-animation: figaro-crt-scan;');
        expect(source).toContain('--screen-scan-duration: 300s;');
        expect(source).toContain('--screen-content-transform: perspective(2200px)');
        expect(source).toContain('--application-status-surface: #000503;');
        expect(surfaces).toContain('@keyframes figaro-crt-scan');
        expect(surfaces).toMatch(
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#app::before[\s\S]*?animation-name: none !important;/,
        );
    });

    test('keeps native Figaro surfaces connected and gives Dark a brighter reading plane', () => {
        for (const [themeId, editorSurface] of [
            ['default', '#211e1a'],
            ['figaro-light', '#fffdf8'],
        ]) {
            const source = fs.readFileSync(
                path.resolve(`frontend/themes/${themeId}.css`),
                'utf8',
            );
            expect(source).toContain('--navigation-surface: var(--sidebar-bg);');
            expect(source).toContain('--file-tree-surface: var(--sidebar-bg);');
            expect(source).toContain(`--editor-surface: ${editorSurface};`);
            expect(source).toContain('--editor-gutter-surface: var(--editor-surface);');
            expect(source).toContain('--workspace-surface: var(--editor-surface);');
            expect(source).toContain('--application-status-surface: var(--file-tree-surface);');
            expect(source).toContain('--status-bar-surface: var(--editor-surface);');
            expect(source).toContain('--titlebar-divider-color: transparent;');
            expect(source).toContain('--sidebar-rail-surface: transparent;');
            expect(source).toContain('--sidebar-resizer-color: transparent;');
            expect(source).toContain('--tab-active-border: transparent;');
            expect(source).toContain('--status-bar-border: transparent;');
            expect(source).toMatch(/--sidebar-tools-border-color: rgba\([^)]+\);/);
            expect(source).toMatch(/--status-separator-color: rgba\([^)]+\);/);
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
            'frontend/js/rawTextPreview.js',
            'frontend/js/pdfPreview.js',
            'frontend/js/datePicker.js',
            'frontend/js/editor.js',
            'frontend/js/markdownBlockGuides.js',
            'frontend/js/markdownImagePlugin.js',
            'frontend/js/selectCombobox.js',
            'frontend/js/settingsPicker.js',
            'frontend/js/tabManager.js',
            'frontend/js/tooltip.js',
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
            '.ui-button--quiet',
            '.ui-icon-button',
            '.ui-badge',
            '.ui-field',
            '.ui-field--quiet',
            '.ui-checkbox',
            '.ui-date-picker',
            '.ui-date-picker-day--weekend',
            '.ui-date-picker-day--note-1',
            '.ui-date-picker-day--note-2',
            '.ui-date-picker-day--note-3',
            '.ui-date-picker-day--note-4',
            '.ui-date-picker-day--note-5',
            '.ui-date-picker-day--due',
            '.ui-menu',
            '.ui-tooltip',
            '.ui-notice',
            '.ui-document-tabs',
            '.ui-document-tabs--titlebar',
            '.ui-document-tab',
            '.ui-document-tab--connected',
            '.ui-editor-fold-control',
            '.ui-editor-block-guide',
            '.ui-spinner',
            '.ui-skeleton',
            '.ui-progress',
            '.ui-progress-value',
        ]) {
            expect(styles).toContain(selector);
        }
        expect(styles).toMatch(/\.ui-document-tabs--titlebar\s*\{[^}]*box-shadow:\s*none/s);
        expect(styles).not.toMatch(/\.ui-document-tabs--titlebar\[data-empty="true"\]/);
        const themeSurfaces = fs.readFileSync(
            path.resolve('frontend/design-system/theme-surfaces.css'),
            'utf8',
        );
        expect(themeSurfaces).toMatch(/\.top-bar\s*\{[^}]*box-shadow:\s*inset 0 -1px 0 var\(--titlebar-divider-color\)/s);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-spinner\s*\{[\s\S]*animation:\s*none/);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-skeleton::after\s*\{[\s\S]*animation:\s*none/);
        expect(styles).not.toMatch(/\.font-size-control\s*\{[^}]*border:/s);
        expect(styles).not.toMatch(/\.text-width-control\s*\{[^}]*border:/s);
        expect(styles).not.toMatch(/\.settings-picker-btn\s*\{/);
        expect(styles).not.toMatch(/\.settings-action-btn\s*\{/);
        expect(styles).toMatch(/\.ui-date-picker-day--note-5\s*\{[^}]*var\(--success-color\)/s);
        expect(styles).toMatch(/\.ui-date-picker-day--due\s*\{[^}]*var\(--danger-color\)/s);
        expect(styles).toMatch(/\.ui-date-picker\s*\{[^}]*background:\s*var\(--calendar-surface\)/s);
        expect(styles).toMatch(/\.ui-checkbox\s*\{[^}]*appearance:\s*none[^}]*border:\s*1px solid var\(--border-color\)/s);
        expect(styles).toMatch(/\.ui-checkbox:checked\s*\{[^}]*background:\s*var\(--accent-color\)/s);
        expect(styles).toMatch(/\.ui-checkbox:focus-visible\s*\{[^}]*var\(--focus-ring\)/s);
        expect(styles).toMatch(/\.ui-checkbox:disabled\s*\{[^}]*cursor:\s*not-allowed/s);

        const tooltipBindings = new Map([
            ['frontend/js/calendarDayTooltip.js', "className = 'ui-tooltip cal-day-tooltip'"],
            ['frontend/js/editor.js', "className = 'ui-tooltip link-hover-preview'"],
            ['frontend/js/fileTree.js', "className = 'ui-tooltip file-tree-capability-tooltip'"],
        ]);
        for (const [file, binding] of tooltipBindings) {
            expect(fs.readFileSync(path.resolve(file), 'utf8')).toContain(binding);
        }
        const linkHoverStyles = fs.readFileSync(
            path.resolve('frontend/styles/features/link-hover.css'),
            'utf8',
        );
        expect(linkHoverStyles).not.toMatch(/\.link-hover-preview\s*\{[^}]*(?:background|border|box-shadow|font-size|max-width|padding|z-index)\s*:/s);

        const shellStyles = fs.readFileSync(path.resolve('frontend/styles/shell.css'), 'utf8');
        expect(shellStyles).toMatch(/\.calendar-grid \.cal-day\.selected\s*\{[^}]*background:\s*var\(--accent-color\)[^}]*color:\s*var\(--button-text\)/s);
        expect(shellStyles).toMatch(/\.calendar-grid \.cal-day\.selected:focus-visible\s*\{[^}]*var\(--focus-ring\)/s);
        expect(shellStyles).not.toMatch(/\.calendar-grid \.cal-day\.selected::after\s*\{/);
        expect(shellStyles).not.toMatch(/\.calendar-grid \.cal-day\.today\s*\{[^}]*text-decoration:\s*underline/s);

        const datePickerSource = fs.readFileSync(path.resolve('frontend/js/datePicker.js'), 'utf8');
        expect(datePickerSource).toContain('selected: isISODate(value) ? value : today');
        expect(datePickerSource).toContain('class="ui-date-picker-grid calendar-grid"');
        expect(datePickerSource).toContain('calendarMonthPresentation({');
        expect(fs.readFileSync(path.resolve('frontend/js/calendar.js'), 'utf8'))
            .toContain('calendarMonthPresentation({');

        const catalogue = fs.readFileSync(path.resolve('frontend/design-system/index.html'), 'utf8');
        expect(catalogue).toContain('<div class="settings-card');
        expect(catalogue).toContain('class="toggle-switch"');
        expect(catalogue).not.toContain('class="ui-card');
        expect(catalogue).not.toContain('class="ui-toggle');
        expect(catalogue).toMatch(/ui-date-picker-grid calendar-grid[\s\S]*cal-day selected has-note ui-date-picker-day--note-3[^>]*aria-current="date"/);
    });

    test('binds remaining approved-family controls to shared primitives', () => {
        const bindings = new Map([
            ['frontend/index.html', [
                'ui-icon-button md-cheatsheet-trigger',
                'ui-icon-button md-cheatsheet-close',
                'ui-button ui-button--accent md-cheatsheet-tab',
                'ui-button md-cheatsheet-tab',
            ]],
            ['frontend/js/home.js', ['ui-button home-card-action']],
            ['frontend/js/views/searchView.js', ['ui-button search-filter-chip']],
            ['frontend/js/frontmatterPlugin.js', [
                'ui-button ui-button--quiet cm-frontmatter-panel-action',
                'ui-button cm-frontmatter-panel-add',
                'ui-checkbox cm-frontmatter-panel-toggle',
            ]],
            ['frontend/js/dialogs.js', ['class="ui-checkbox"', 'ui-checkbox merge-checkbox']],
            ['frontend/js/kanban.js', [
                'ui-icon-button ui-icon-button--small kanban-column-btn',
                'ui-icon-button ui-icon-button--small ui-icon-button--danger kanban-card-delete',
            ]],
            ['frontend/js/tabManager.js', [
                'class="ui-button" data-kanban-density',
                'class="ui-button" data-kanban-layout',
            ]],
            ['frontend/js/rawTextPreview.js', [
                'ui-button ui-button--primary raw-text-preview-copy',
            ]],
            ['frontend/js/markdownImagePlugin.js', [
                'ui-button ui-button--accent cm-drawio-action-button',
                'ui-spinner',
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
        expect(themes).toHaveLength(18);
        expect(themes[0]).toEqual({ id: 'default', name: 'Figaro Dark' });
        expect(themes).toContainEqual({
            id: 'figaro-crt-phosphor',
            name: 'Figaro CRT Phosphor',
        });

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
            <div class="ui-picker theme-picker" data-catalog-settings-picker="theme">
                <button class="ui-picker-trigger"><span data-picker-value>Figaro Dark</span></button>
                <div class="ui-menu ui-picker-menu" hidden></div>
            </div>
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
        expect(result.themes).toHaveLength(18);
        expect(select.disabled).toBe(false);
        expect(select.options).toHaveLength(18);
        expect(select.value).toBe('default');
        expect(document.querySelectorAll('#catalog-index a')).toHaveLength(2);
        expect(document.querySelector('#theme-status').textContent).toBe('18 themes · Figaro Dark');
        expect(result.comboboxes).toHaveLength(2);
        expect(result.settingsPickers).toHaveLength(1);
        const appearanceTrigger = document.querySelector('[data-catalog-settings-picker="theme"] .ui-picker-trigger');
        appearanceTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(appearanceTrigger.getAttribute('aria-expanded')).toBe('true');
        expect(appearanceTrigger.getAttribute('aria-label')).toBe('Theme');
        expect(document.querySelectorAll('[data-catalog-settings-picker="theme"] [role="option"]'))
            .toHaveLength(3);

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
        expect(document.querySelector('#theme-status').textContent).toBe('18 themes · Figaro Light');

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
