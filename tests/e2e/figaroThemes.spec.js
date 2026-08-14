import { expect, test } from '@playwright/test';

const nativeThemes = [
    {
        path: '/themes/default.css',
        name: 'Figaro Dark',
        values: {
            background: '#1a1816',
            sidebar: '#12110f',
            text: '#f5eee4',
            accent: '#d8574a',
            hashtag: '#d1a269',
        },
    },
    {
        path: '/themes/figaro-light.css',
        name: 'Figaro Light',
        values: {
            background: '#fcf8f1',
            sidebar: '#f1e7d9',
            text: '#2b241d',
            accent: '#b94a3e',
            hashtag: '#8c5b21',
        },
    },
];

test('keeps the Figaro native themes calm and every search-result theme legible', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 17, 15)');
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node')).toHaveClass(/selected/);
    await page.locator('#topbar-settings').click();
    await expect(page.locator('.settings-card')).toHaveCount(7);
    await expect(page.locator('.settings-card').filter({ hasText: 'Vault care' })).toContainText('Vault health');
    const wideSettingsLayout = await page.evaluate(() => {
        const columns = [...document.querySelectorAll('.settings-grid > .settings-column')];
        const cards = [...document.querySelectorAll('.settings-card')];
        const box = element => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
        };
        return {
            columnCount: columns.length,
            columnBoxes: columns.map(box),
            titles: columns.map(column => [...column.querySelectorAll('.settings-card-title')]
                .map(title => title.textContent.trim())),
            appearance: box(cards[0]),
            editor: box(cards[1]),
            kanban: box(cards[2]),
            automation: box(cards[3]),
        };
    });
    expect(wideSettingsLayout.columnCount).toBe(2);
    expect(wideSettingsLayout.titles).toEqual([
        ['Appearance', 'Editor'],
        ['Kanban', 'Automation', 'PDF Export', 'Vault care', 'About'],
    ]);
    expect(wideSettingsLayout.columnBoxes[0].x).toBeLessThan(wideSettingsLayout.columnBoxes[1].x);
    expect(wideSettingsLayout.appearance.height).toBeLessThan(wideSettingsLayout.editor.height);
    expect(wideSettingsLayout.kanban.y).toBeCloseTo(wideSettingsLayout.appearance.y, 0);
    expect(wideSettingsLayout.automation.y).toBeGreaterThan(wideSettingsLayout.kanban.bottom);
    expect(wideSettingsLayout.automation.y - wideSettingsLayout.kanban.bottom).toBeLessThanOrEqual(16);

    await page.setViewportSize({ width: 900, height: 900 });
    const narrowSettingsLayout = await page.evaluate(() => {
        const columns = [...document.querySelectorAll('.settings-grid > .settings-column')];
        return columns.map(column => {
            const rect = column.getBoundingClientRect();
            return { x: rect.x, y: rect.y, bottom: rect.bottom, width: rect.width };
        });
    });
    expect(narrowSettingsLayout[1].x).toBeCloseTo(narrowSettingsLayout[0].x, 0);
    expect(narrowSettingsLayout[1].width).toBeCloseTo(narrowSettingsLayout[0].width, 0);
    expect(narrowSettingsLayout[1].y).toBeGreaterThan(narrowSettingsLayout[0].bottom);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        tabs.showWorkspaceHome();
    });
    await expect(page.locator('.home-eyebrow')).toBeVisible();
    await page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        tabs.switchTab('settings');
    });
    await page.evaluate(async () => {
        const { renderSearchResults } = await import('/js/views/searchView.js');
        renderSearchResults({
            results: [{
                name: 'Meeting.md',
                path: 'Clients/Acme/Quarterly Planning/Meeting.md',
                matches: [{ line: 12, text: 'Review the quarterly project plan' }],
                matchCount: 3,
            }],
            query: 'project',
            filters: { titleOnly: false, recentOnly: false, caseSensitive: false },
            selectedIndex: 0,
            onFilter() {},
            onOpen() {},
        });
    });
    await page.evaluate(async () => {
        const tabs = await import('/js/tabManager.js');
        tabs.switchTab('Welcome.md');
    });
    await expect(page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node'))
        .toHaveClass(/selected/);

    for (const theme of nativeThemes) {
        const details = await page.evaluate(async ({ path }) => {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`Could not load ${path}`);
            let style = document.getElementById('theme-style');
            if (!style) {
                style = document.createElement('style');
                style.id = 'theme-style';
                document.head.appendChild(style);
            }
            style.textContent = await response.text();
            await new Promise(resolve => requestAnimationFrame(resolve));

            const computed = getComputedStyle(document.documentElement);
            const color = name => computed.getPropertyValue(name).trim().toLowerCase();
            const luminance = hex => {
                const channels = hex.slice(1).match(/.{2}/g).map(value => parseInt(value, 16) / 255)
                    .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
                return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const contrast = (first, second) => {
                const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
                return (lighter + 0.05) / (darker + 0.05);
            };
            const renderedColor = value => {
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const context = canvas.getContext('2d');
                context.fillStyle = value;
                context.fillRect(0, 0, 1, 1);
                return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
            };
            const rgbLuminance = value => {
                const channels = renderedColor(value).map(channel => channel / 255)
                    .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
                return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const renderedContrast = (textSelector, backgroundSelector) => {
                const foreground = getComputedStyle(document.querySelector(textSelector)).color;
                const background = getComputedStyle(document.querySelector(backgroundSelector)).backgroundColor;
                const [lighter, darker] = [rgbLuminance(foreground), rgbLuminance(background)].sort((a, b) => b - a);
                return (lighter + 0.05) / (darker + 0.05);
            };
            const activeTab = document.querySelector('.tab.active');
            const app = getComputedStyle(document.getElementById('app'));
            const topBar = getComputedStyle(document.querySelector('.top-bar'));
            const statusBar = getComputedStyle(document.querySelector('.status-bar'));
            const settingsCard = getComputedStyle(document.querySelector('.settings-card'));
            const selectedTreeNode = getComputedStyle(document.querySelector('.file-tree-item[data-path="Welcome.md"] > .file-tree-node'));

            return {
                background: color('--bg-color'),
                sidebar: color('--sidebar-bg'),
                text: color('--text-color'),
                accent: color('--accent-color'),
                hashtag: color('--hashtag-color'),
                focusRing: color('--focus-ring'),
                textContrast: contrast(color('--text-color'), color('--bg-color')),
                linkContrast: contrast(color('--link-color'), color('--bg-color')),
                appBackground: app.backgroundImage,
                topBarBackground: topBar.backgroundImage,
                activeTabShadow: activeTab ? getComputedStyle(activeTab).boxShadow : '',
                activeTabTransform: activeTab ? getComputedStyle(activeTab).transform : '',
                statusBarBackground: statusBar.backgroundImage,
                settingsCardBackground: settingsCard.backgroundImage,
                settingsCardShadow: settingsCard.boxShadow,
                selectedTreeShadow: selectedTreeNode.boxShadow,
                homeEyebrowContrast: renderedContrast('.home-eyebrow', '.home-view'),
                homeKickerContrast: renderedContrast('.home-card-kicker', '.home-card'),
                homeInstructionContrast: renderedContrast('.home-empty', '.home-card'),
                searchSummaryContrast: renderedContrast('.search-result-summary', '.search-dropdown'),
            };
        }, theme);

        expect(details.background).toBe(theme.values.background);
        expect(details.sidebar).toBe(theme.values.sidebar);
        expect(details.text).toBe(theme.values.text);
        expect(details.accent).toBe(theme.values.accent);
        expect(details.hashtag).toBe(theme.values.hashtag);
        expect(details.textContrast).toBeGreaterThanOrEqual(7);
        expect(details.linkContrast).toBeGreaterThanOrEqual(4.5);
        expect(details.focusRing).toContain('rgba(');
        expect(details.appBackground).toContain('radial-gradient');
        expect(details.topBarBackground).toContain('linear-gradient');
        expect(details.activeTabShadow).toContain('rgb');
        expect(details.activeTabTransform).toBe('none');
        expect(details.statusBarBackground).toContain('linear-gradient');
        expect(details.settingsCardBackground).toContain('linear-gradient');
        expect(details.settingsCardShadow).toContain('rgb');
        expect(details.selectedTreeShadow).toContain('rgb');
        expect(details.homeEyebrowContrast).toBeGreaterThanOrEqual(4.5);
        expect(details.homeKickerContrast).toBeGreaterThanOrEqual(4.5);
        expect(details.homeInstructionContrast).toBeGreaterThanOrEqual(4.5);
        expect(details.searchSummaryContrast).toBeGreaterThanOrEqual(4.5);
    }

    const searchThemeDetails = await page.evaluate(async () => {
        const manifestResponse = await fetch('/themes/manifest.json');
        if (!manifestResponse.ok) throw new Error('Could not load the theme manifest');
        const themes = await manifestResponse.json();
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        const renderedColor = value => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = value => renderedColor(value)
            .map(channel => channel / 255)
            .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
            .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
        const contrast = (first, second) => {
            const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
            return (lighter + 0.05) / (darker + 0.05);
        };
        const renderedContrast = (textSelector, backgroundSelector) => {
            const foreground = getComputedStyle(document.querySelector(textSelector)).color;
            const background = getComputedStyle(document.querySelector(backgroundSelector)).backgroundColor;
            return contrast(foreground, background);
        };
        const results = [];

        for (const theme of themes) {
            const response = await fetch(`/themes/${theme.id}.css`);
            if (!response.ok) throw new Error(`Could not load theme ${theme.id}`);
            document.getElementById('theme-style').textContent = await response.text();
            await new Promise(resolve => requestAnimationFrame(resolve));

            const rowColor = getComputedStyle(document.querySelector('.search-result-row')).color;
            results.push({
                id: theme.id,
                rowColor,
                pathColor: getComputedStyle(document.querySelector('.search-result-path')).color,
                excerptColor: getComputedStyle(document.querySelector('.search-result-excerpt')).color,
                metaColor: getComputedStyle(document.querySelector('.search-result-meta')).color,
                pathContrast: renderedContrast('.search-result-path', '.search-result-row'),
                excerptContrast: renderedContrast('.search-result-excerpt', '.search-result-row'),
                metaContrast: renderedContrast('.search-result-meta', '.search-result-row'),
                highlightContrast: renderedContrast('.search-result-excerpt mark', '.search-result-excerpt mark'),
            });
        }
        return results;
    });

    expect(searchThemeDetails.length).toBeGreaterThan(0);
    for (const details of searchThemeDetails) {
        expect(details.pathColor, `${details.id} search path`).toBe(details.rowColor);
        expect(details.excerptColor, `${details.id} search excerpt`).toBe(details.rowColor);
        expect(details.metaColor, `${details.id} search metadata`).toBe(details.rowColor);
        expect(details.pathContrast, `${details.id} search path contrast`).toBeGreaterThanOrEqual(4.5);
        expect(details.excerptContrast, `${details.id} search excerpt contrast`).toBeGreaterThanOrEqual(4.5);
        expect(details.metaContrast, `${details.id} search metadata contrast`).toBeGreaterThanOrEqual(4.5);
        expect(details.highlightContrast, `${details.id} highlighted match contrast`).toBeGreaterThanOrEqual(4.5);
    }
});
