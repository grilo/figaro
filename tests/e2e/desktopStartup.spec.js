import { expect, test } from '@playwright/test';

test('boots through the desktop bridge with Welcome text, the vault tree, and Calendar available', async ({ page }) => {
    const browserMessages = [];
    page.on('console', message => browserMessages.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', error => browserMessages.push(`pageerror: ${error.message}`));
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'language', { value: 'C', configurable: true });
        const NativeSegmenter = Intl.Segmenter;
        if (NativeSegmenter) {
            Intl.Segmenter = function Segmenter(locale, options) {
                if (locale === undefined) throw new RangeError('invalid language tag: C');
                return new NativeSegmenter(locale, options);
            };
        }
        const calls = [];
        const responses = {
            GetFileTree: [{ name: 'Welcome.md', path: 'Welcome.md', type: 'file', mtime: 1 }],
            GetFileTreeStyles: { version: 1, entries: {}, recent_icons: [] },
            ReadFile: {
                content: '# Welcome to Figaro\n\nThis text came through the packaged desktop bridge.',
                path: 'Welcome.md',
                mtime: 1,
            },
            LoadSession: {},
            LinkStyleLoad: { style: 'markdown' },
            GetKanbanColumns: { columns: ['todo', 'wip', 'done'], colors: {} },
            GetKanbanBoard: { todo: [], wip: [], done: [] },
            GetCalendarMonthData: {
                year: 2026,
                month: 7,
                days_with_notes: [],
                days_with_links: [],
                calendar: [[0, 0, 0, 1, 2, 3, 4], [5, 6, 7, 8, 9, 10, 11], [12, 13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24, 25], [26, 27, 28, 29, 30, 31, 0]],
            },
            GetLinkedNotesForDate: [],
            SearchBacklinks: [],
            GetFileHistory: [],
            GetFileVersion: '',
            GetCommitCount: 0,
            GetThemes: { themes: [{ id: 'default', name: 'Figaro Dark' }] },
            GetThemeCSS: { css: '' },
            ThemeLoad: { theme: 'default', font: 'inter', codeFont: 'theme-mono' },
            VimLoad: { enabled: false },
            AutoSaveLoad: 300,
            GetOSUsername: 'Desktop User',
        };

        window.__desktopBridgeCalls = calls;
        window.go = {
            main: {
                App: new Proxy({}, {
                    get: (_target, method) => method === 'then' ? undefined : (...args) => {
                        calls.push({ method: String(method), args });
                        return Promise.resolve(Object.prototype.hasOwnProperty.call(responses, method)
                            ? responses[method]
                            : { success: true });
                    },
                }),
            },
        };
    });

    await page.goto('/');
    await page.evaluate(async () => {
        const app = await import('/js/app.js');
        await app.initApp();
    });
    await page.waitForFunction(() => window._appReady === true);

    const bridgeState = await page.evaluate(async () => ({
        installed: Boolean(window.__wailsCompat),
        calls: window.__desktopBridgeCalls,
        welcome: await window.pywebview.api.read_file('Welcome.md'),
    }));
    expect(bridgeState.installed, browserMessages.join('\n')).toBe(true);
    expect(bridgeState.welcome.content).toContain('This text came through the packaged desktop bridge.');

    await expect(page.locator('#status-text')).toHaveText('Ready');
    await expect(page.locator('.file-tree-item[data-path="Welcome.md"] .node-name')).toHaveText('Welcome.md');
    await expect(page.locator('.tab[data-tab-id="home"]')).toContainText('Welcome');
    await expect(page.locator('.home-view h1')).toHaveText('Your workspace');
    await expect(page.locator('.home-view')).toContainText('Unfinished tasks');
    await expect(page.locator('.home-view')).toContainText('Recent');

    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-content')).toContainText('Welcome to Figaro');
    await expect(page.locator('.cm-content')).toContainText('This text came through the packaged desktop bridge.');

    await page.locator('#sidebar-calendar').click();
    await expect(page.locator('#sidebar-calendar-panel')).toHaveClass(/open/);
    await expect(page.locator('#cal-month-year')).not.toHaveText('');
    await expect(page.locator('#calendar-grid .cal-day-header')).toHaveCount(7);
    await expect(page.locator('#calendar-grid .cal-day:not(.cal-empty)')).toHaveCount(31);

    const calledMethods = await page.evaluate(() => window.__desktopBridgeCalls.map(call => call.method));
    expect(calledMethods).toEqual(expect.arrayContaining([
        'GetFileTree',
        'ReadFile',
        'GetCalendarMonthData',
        'LinkStyleLoad',
    ]));
});
