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

test('keeps the Figaro native themes calm, legible, and visually related', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 17, 15)');
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node')).toHaveClass(/selected/);
    await page.locator('#topbar-settings').click();
    await expect(page.locator('.settings-card')).toHaveCount(6);
    await expect(page.locator('.settings-card').filter({ hasText: 'Vault care' })).toContainText('Vault health');

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
        expect(details.activeTabTransform).not.toBe('none');
        expect(details.statusBarBackground).toContain('linear-gradient');
        expect(details.settingsCardBackground).toContain('linear-gradient');
        expect(details.settingsCardShadow).toContain('rgb');
        expect(details.selectedTreeShadow).toContain('rgb');
    }
});
