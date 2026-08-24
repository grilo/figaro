import { expect, test } from '@playwright/test';

const nativeThemes = [
    {
        path: '/themes/default.css',
        name: 'Figaro Dark',
        flat: true,
        values: {
            background: '#1a1816',
            sidebar: '#12110f',
            editor: '#211e1a',
            text: '#f5eee4',
            accent: '#d8574a',
            hashtag: '#d1a269',
        },
    },
    {
        path: '/themes/figaro-light.css',
        name: 'Figaro Light',
        flat: true,
        values: {
            background: '#fcf8f1',
            sidebar: '#f1e7d9',
            text: '#2b241d',
            accent: '#b94a3e',
            hashtag: '#8c5b21',
        },
    },
    {
        path: '/themes/figaro-crt-phosphor.css',
        name: 'Figaro CRT Phosphor',
        crt: true,
        values: {
            background: '#04110b',
            sidebar: '#000503',
            text: '#c8ffd9',
            accent: '#39ff7a',
            hashtag: '#ffb84a',
        },
    },
];

test('brightens the connected Dark reading plane and keeps CRT ambient effects subtle', async ({ page }) => {
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
            await new Promise(resolve => setTimeout(resolve, 220));

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
            const inactiveTab = document.querySelector('.tab:not(.active)');
            const appElement = document.getElementById('app');
            const app = getComputedStyle(appElement);
            const screen = getComputedStyle(appElement, '::before');
            const topBarElement = document.querySelector('.top-bar');
            const topBar = getComputedStyle(topBarElement);
            const topBarDecoration = getComputedStyle(topBarElement, '::after');
            const sidebarElement = document.querySelector('.sidebar');
            const sidebar = getComputedStyle(sidebarElement);
            const sidebarEdge = getComputedStyle(sidebarElement, '::after');
            const sidebarBounds = sidebarElement.getBoundingClientRect();
            const sidebarTools = getComputedStyle(document.querySelector('.sidebar-tools'));
            const sidebarResizer = getComputedStyle(document.querySelector('#sidebar-resizer'));
            const fileTree = getComputedStyle(document.querySelector('#file-tree'));
            const mainContent = getComputedStyle(document.querySelector('#main-content'));
            const mainContentBounds = document.querySelector('#main-content').getBoundingClientRect();
            const editor = getComputedStyle(document.querySelector('.editor-panel'));
            const editorGutter = getComputedStyle(document.querySelector('#editor-container .cm-gutters'));
            const statusBar = getComputedStyle(document.querySelector('.status-bar'));
            const applicationStatus = getComputedStyle(document.querySelector('.status-left'));
            const bufferStatus = getComputedStyle(document.querySelector('.status-right'));
            const statusSeparator = getComputedStyle(document.querySelector('.status-separator'));
            const settingsCard = getComputedStyle(document.querySelector('.settings-card'));
            const selectedTreeNode = getComputedStyle(document.querySelector('.file-tree-item[data-path="Welcome.md"] > .file-tree-node'));
            const activeTabStyle = activeTab ? getComputedStyle(activeTab) : null;
            const activeTabBounds = activeTab?.getBoundingClientRect() || null;
            const inactiveTabStyle = inactiveTab ? getComputedStyle(inactiveTab) : null;

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
                topBarBackgroundColor: topBar.backgroundColor,
                topBarDivider: color('--titlebar-divider-color'),
                topBarDecoration: topBarDecoration.backgroundImage,
                fileTreeBackgroundColor: fileTree.backgroundColor,
                sidebarEdge: sidebarEdge.backgroundColor,
                sidebarEdgeRight: sidebarEdge.right,
                sidebarEdgeStack: sidebarEdge.zIndex,
                sidebarShadow: sidebar.boxShadow,
                sidebarToolsBorder: sidebarTools.borderTopColor,
                sidebarToolsBorderToken: color('--sidebar-tools-border-color'),
                sidebarResizer: sidebarResizer.backgroundColor,
                mainContentShadow: mainContent.boxShadow,
                shellBoundaryAligned: Math.abs(sidebarBounds.right - mainContentBounds.left) <= 0.5,
                activeTabBoundaryAligned: activeTabBounds
                    ? Math.abs(activeTabBounds.left - mainContentBounds.left) <= 0.5
                    : false,
                activeTabShadow: activeTabStyle?.boxShadow || '',
                activeTabBackground: activeTabStyle?.backgroundImage || '',
                activeTabBackgroundColor: activeTabStyle?.backgroundColor || '',
                activeTabBorder: activeTabStyle?.borderTopColor || '',
                inactiveTabBackgroundColor: inactiveTabStyle?.backgroundColor || '',
                editorBackground: editor.backgroundImage,
                editorBackgroundColor: editor.backgroundColor,
                editorSurface: color('--editor-surface'),
                editorLuminance: rgbLuminance(editor.backgroundColor),
                navigationLuminance: rgbLuminance(fileTree.backgroundColor),
                editorTextContrast: renderedContrast('#editor-container .cm-content', '.editor-panel'),
                editorGutterBackgroundColor: editorGutter.backgroundColor,
                activeTabTransform: activeTabStyle?.transform || '',
                statusBarBackground: statusBar.backgroundImage,
                statusBarBackgroundColor: statusBar.backgroundColor,
                applicationStatusBackgroundColor: applicationStatus.backgroundColor,
                bufferStatusBackgroundColor: bufferStatus.backgroundColor,
                statusBarBorder: statusBar.borderTopColor,
                statusSeparator: statusSeparator.color,
                statusSeparatorToken: color('--status-separator-color'),
                settingsCardBackground: settingsCard.backgroundImage,
                settingsCardShadow: settingsCard.boxShadow,
                selectedTreeShadow: selectedTreeNode.boxShadow,
                screenBackground: screen.backgroundImage,
                screenOpacity: screen.opacity,
                screenPointerEvents: screen.pointerEvents,
                screenAnimationName: screen.animationName,
                screenAnimationDuration: screen.animationDuration,
                screenTransform: app.transform,
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
        if (theme.values.editor) {
            expect(details.editorSurface).toBe(theme.values.editor);
        }
        expect(details.textContrast).toBeGreaterThanOrEqual(7);
        expect(details.linkContrast).toBeGreaterThanOrEqual(4.5);
        expect(details.focusRing).toContain('rgba(');
        expect(details.appBackground).toContain('radial-gradient');
        expect(details.activeTabShadow).toBe('none');
        expect(details.activeTabBackground).toBe(details.editorBackground);
        expect(details.activeTabBackgroundColor).toBe(details.editorBackgroundColor);
        expect(details.activeTabTransform).toBe('none');
        expect(details.sidebarEdgeRight).toBe('-1px');
        expect(details.sidebarEdgeStack).toBe('1');
        expect(details.shellBoundaryAligned).toBe(true);
        expect(details.activeTabBoundaryAligned).toBe(true);
        expect(details.settingsCardBackground).toContain('linear-gradient');
        expect(details.settingsCardShadow).toContain('rgb');
        expect(details.selectedTreeShadow).toContain('rgb');
        expect(details.screenPointerEvents).toBe('none');
        if (theme.flat) {
            expect(details.topBarBackground).toBe('none');
            expect(details.topBarBackgroundColor).toBe(details.fileTreeBackgroundColor);
            expect(details.topBarBackgroundColor).not.toBe(details.editorBackgroundColor);
            expect(details.topBarDivider).toBe('transparent');
            expect(details.topBarDecoration).toBe('none');
            expect(details.sidebarEdge).toBe('rgba(0, 0, 0, 0)');
            expect(details.sidebarShadow).toBe('none');
            expect(details.sidebarResizer).toBe('rgba(0, 0, 0, 0)');
            expect(details.mainContentShadow).toBe('none');
            expect(details.editorGutterBackgroundColor).toBe(details.editorBackgroundColor);
            expect(details.sidebarToolsBorder).toBe(details.sidebarToolsBorderToken);
            expect(details.sidebarToolsBorder).not.toBe('rgba(0, 0, 0, 0)');
            expect(details.activeTabBorder).toBe('rgba(0, 0, 0, 0)');
            expect(details.inactiveTabBackgroundColor).toBe('rgba(0, 0, 0, 0)');
            expect(details.statusBarBackground).toBe('none');
            expect(details.statusBarBackgroundColor).toBe(details.editorBackgroundColor);
            expect(details.applicationStatusBackgroundColor).toBe(details.fileTreeBackgroundColor);
            expect(details.bufferStatusBackgroundColor).toBe(details.editorBackgroundColor);
            expect(details.statusBarBorder).toBe('rgba(0, 0, 0, 0)');
            expect(details.statusSeparator).toBe(details.statusSeparatorToken);
            expect(details.statusSeparator).not.toBe('rgba(0, 0, 0, 0)');
            if (theme.name === 'Figaro Dark') {
                expect(details.editorLuminance - details.navigationLuminance)
                    .toBeGreaterThanOrEqual(0.007);
                expect(details.editorTextContrast).toBeGreaterThanOrEqual(7);
            }
        } else {
            expect(details.topBarBackground).toContain('linear-gradient');
            expect(details.statusBarBackground).toContain('linear-gradient');
        }
        if (theme.crt) {
            expect(details.applicationStatusBackgroundColor).toBe('rgb(0, 5, 3)');
            expect(details.sidebarShadow).not.toContain('inset');
            expect(details.sidebarShadow).not.toBe('none');
            expect(details.screenBackground).toContain('radial-gradient');
            expect(details.screenBackground).toContain('linear-gradient');
            expect(details.screenOpacity).toBe('1');
            expect(details.screenAnimationName).toBe('figaro-crt-scan');
            expect(details.screenAnimationDuration).toBe('300s');
            expect(details.screenTransform).not.toBe('none');
        } else {
            expect(details.screenOpacity).toBe('0');
            expect(details.screenAnimationName).toBe('none');
            expect(details.screenTransform).toBe('none');
        }
        expect(details.homeEyebrowContrast).toBeGreaterThanOrEqual(4.5);
        expect(details.homeKickerContrast).toBeGreaterThanOrEqual(4.5);
        expect(details.homeInstructionContrast).toBeGreaterThanOrEqual(4.5);
        expect(details.searchSummaryContrast).toBeGreaterThanOrEqual(4.5);
    }

    const conventionalThemeSeam = await page.evaluate(async () => {
        const response = await fetch('/themes/github.css');
        if (!response.ok) throw new Error('Could not load the GitHub Light theme');
        document.getElementById('theme-style').textContent = await response.text();
        await new Promise(resolve => setTimeout(resolve, 220));

        const sidebar = document.getElementById('sidebar');
        const main = document.getElementById('main-content');
        const activeTab = document.querySelector('#tab-strip .tab.active');
        const sidebarBounds = sidebar.getBoundingClientRect();
        const mainBounds = main.getBoundingClientRect();
        const tabBounds = activeTab.getBoundingClientRect();
        const edge = getComputedStyle(sidebar, '::after');
        return {
            edgeRight: edge.right,
            edgeStack: edge.zIndex,
            edgeBackground: edge.backgroundColor,
            shellBoundaryAligned: Math.abs(sidebarBounds.right - mainBounds.left) <= 0.5,
            activeTabBoundaryAligned: Math.abs(tabBounds.left - mainBounds.left) <= 0.5,
        };
    });
    expect(conventionalThemeSeam).toEqual({
        edgeRight: '-1px',
        edgeStack: '1',
        edgeBackground: 'rgb(208, 215, 222)',
        shellBoundaryAligned: true,
        activeTabBoundaryAligned: true,
    });

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

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotionCRT = await page.evaluate(async () => {
        const response = await fetch('/themes/figaro-crt-phosphor.css');
        if (!response.ok) throw new Error('Could not load the CRT Phosphor theme');
        document.getElementById('theme-style').textContent = await response.text();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const screen = getComputedStyle(document.getElementById('app'), '::before');
        return {
            animationName: screen.animationName,
            backgroundImage: screen.backgroundImage,
            opacity: screen.opacity,
        };
    });
    expect(reducedMotionCRT.animationName).toBe('none');
    expect(reducedMotionCRT.backgroundImage).toContain('radial-gradient');
    expect(reducedMotionCRT.opacity).toBe('1');
});
