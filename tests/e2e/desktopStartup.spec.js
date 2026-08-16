import { expect, test } from '@playwright/test';

test('boots through the native Wails binding with the workspace overview, vault tree, and Calendar available', async ({ page }) => {
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
        const handlers = {};
        const responses = {
            GetFileTree: [{ name: 'Welcome.md', path: 'Welcome.md', type: 'file', mtime: 1 }],
            GetVaultLoadStatus: { generation: 1, phase: 'ready', loaded: 1, total: 1 },
            GetFileTreeStyles: { version: 1, entries: {}, recent_icons: [] },
            ReadFile: {
                content: '# Welcome to Figaro\n\nThis text came through the native Wails binding.',
                path: 'Welcome.md',
                mtime: 1,
            },
            GetLaunchExternalFiles: [],
            ReadLaunchExternalFile: {
                content: '# Forwarded into existing window\n\nThis file stayed outside the vault.',
                path: 'C:\\Notes\\forwarded.md',
                mtime: 2,
            },
            LoadSession: {},
            LinkStyleLoad: { style: 'markdown' },
            GetKanbanColumns: { columns: ['todo', 'wip', 'done'], colors: {} },
            GetKanbanBoard: { todo: [], wip: [], done: [] },
            GetHomeTasks: [],
            GetCalendarMonthData: {
                year: 2026,
                month: 7,
                days_with_notes: [],
                days_with_links: [],
                calendar: [[0, 0, 0, 1, 2, 3, 4], [5, 6, 7, 8, 9, 10, 11], [12, 13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24, 25], [26, 27, 28, 29, 30, 31, 0]],
            },
            GetLinkedNotesForDate: [],
            SearchBacklinks: [],
            SearchUnlinkedMentions: [],
            LinkUnlinkedMention: { success: true },
            GetFileHistory: [],
            GetFileVersion: '',
            GetCommitCount: 0,
            GetThemes: { themes: [{ id: 'default', name: 'Figaro Dark' }] },
            GetThemeCSS: { css: '' },
            ThemeLoad: { theme: 'default', font: 'inter', codeFont: 'theme-mono' },
            VimLoad: { enabled: false },
            TabSizeLoad: { size: 4 },
            AutoSaveLoad: 300,
            GetOSUsername: 'Desktop User',
        };

        window.__desktopBridgeCalls = calls;
        window.runtime = {
            EventsOn: (name, handler) => { handlers[name] = handler; },
        };
        window.__emitForwardedExternalFiles = files => handlers['launch:external-files']?.(files);
        window.go = {
            desktop: {
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
    await page.waitForFunction(() => window._appReady === true);
    await expect.poll(() => page.evaluate(() => window._appBootStarted)).toBe(true);

    const nativeState = await page.evaluate(async () => ({
        installed: Boolean(window.go?.desktop?.App),
        calls: window.__desktopBridgeCalls,
        welcome: await window.go.desktop.App.ReadFile('Welcome.md'),
    }));
    expect(nativeState.installed, browserMessages.join('\n')).toBe(true);
    expect(nativeState.welcome.content).toContain('This text came through the native Wails binding.');

    await expect(page.locator('#status-text')).toHaveText('Ready');
    await expect(page.locator('.file-tree-item[data-path="Welcome.md"] .node-name')).toHaveText('Welcome.md');
    await expect(page.locator('.tab[data-tab-id="home"]')).toHaveCount(0);
    await expect(page.locator('.workspace-home-panel.active .home-view h1')).toHaveText('Today');
    await expect(page.locator('.workspace-home-panel.active .home-view')).toContainText('Open tasks');
    await expect(page.locator('.workspace-home-panel.active .home-view')).toContainText('Recent notes');
    await expect(page.locator('.workspace-home-panel.active [data-home-action="today"]')).toBeVisible();

    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-content')).toContainText('Welcome to Figaro');
    await expect(page.locator('.cm-content')).toContainText('This text came through the native Wails binding.');

    await page.locator('#sidebar-calendar').click();
    await expect(page.locator('#sidebar-calendar-panel')).toHaveClass(/open/);
    await expect(page.locator('#cal-month-year')).not.toHaveText('');
    await expect(page.locator('#calendar-grid .cal-day-header')).toHaveCount(7);
    await expect(page.locator('#calendar-grid .cal-day:not(.cal-empty)')).toHaveCount(31);

    const refreshedOpenCalendar = await page.evaluate(async () => {
        const calendar = await import('/js/calendar.js');
        calendar.invalidateCalendarCache();
        return calendar.refreshCalendarIfVisible();
    });
    expect(refreshedOpenCalendar).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__desktopBridgeCalls
        .filter(call => call.method === 'GetCalendarMonthData').length)).toBeGreaterThanOrEqual(2);

    const calledMethods = await page.evaluate(() => window.__desktopBridgeCalls.map(call => call.method));
    expect(calledMethods).toEqual(expect.arrayContaining([
        'GetFileTree',
        'ReadFile',
        'GetHomeTasks',
        'GetCalendarMonthData',
        'LinkStyleLoad',
    ]));

    const chrome = await page.evaluate(() => ({
        drag: getComputedStyle(document.querySelector('.top-bar')).getPropertyValue('--wails-draggable').trim(),
        noDrag: getComputedStyle(document.querySelector('#win-minimize')).getPropertyValue('--wails-draggable').trim(),
    }));
    expect(chrome).toEqual({ drag: 'drag', noDrag: 'no-drag' });

    await page.locator('#win-minimize').click();
    await page.evaluate(() => {
        document.querySelector('.top-bar').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(280);
    const chromeMethods = await page.evaluate(() => window.__desktopBridgeCalls.map(call => call.method));
    expect(chromeMethods).toEqual(expect.arrayContaining([
        'WindowMinimize',
        'WindowMaximize',
        'WindowCaptureState',
    ]));

    await page.evaluate(() => window.__emitForwardedExternalFiles([{
        id: 'external-forwarded-1',
        name: 'forwarded.md',
        path: 'C:\\Notes\\forwarded.md',
        mtime: 2,
    }]));
    await expect(page.getByRole('dialog')).toContainText('Import this note into the vault?');
    await page.getByRole('button', { name: 'Keep outside vault' }).click();
    await expect(page.locator('.tab[data-tab-id="external:external-forwarded-1"]')).toHaveClass(/active/);
    await expect(page.locator('.cm-content')).toContainText('Forwarded into existing window');
    await expect.poll(() => page.evaluate(() => window.__desktopBridgeCalls
        .filter(call => call.method === 'ReadLaunchExternalFile')
        .some(call => call.args[0] === 'external-forwarded-1'))).toBe(true);
});

test('restores the themed active buffer before background vault indexing and tree loading finish', async ({ page }) => {
    await page.addInitScript(() => {
        const handlers = {};
        const calls = [];
        let resolveTree;
        let resolveTheme;
        let resolveActiveFile;
        localStorage.setItem('figaro:startup-appearance-v1', JSON.stringify({
            theme: 'github',
            fontEditor: "'Inter', sans-serif",
            fontUI: "'Inter', sans-serif",
            fontCode: "'SFMono-Regular', monospace",
        }));
        window.runtime = {
            EventsOn: (name, handler) => { handlers[name] = handler; },
        };
        window.__startupCalls = calls;
        window.__emitVaultLoadProgress = payload => handlers['vault:load-progress']?.(payload);
        window.__resolveStartupTree = () => resolveTree?.([]);
        window.__resolveActiveFile = () => resolveActiveFile?.({
            content: '# Restored immediately\n\nThe active buffer is usable.',
            path: 'active.md',
            mtime: 1,
        });
        window.__resolveStartupTheme = () => resolveTheme?.({
            theme: 'startup-test',
            font: 'inter',
            codeFont: 'theme-mono',
        });

        const responses = {
            StartVaultLoad: () => Promise.resolve(true),
            GetVaultLoadStatus: () => Promise.resolve({
                generation: 1,
                phase: 'loading',
                loaded: 100,
                total: 2072,
            }),
            GetFileTree: () => new Promise(resolve => { resolveTree = resolve; }),
            GetFileTreeStyles: () => Promise.resolve({ version: 1, entries: {}, recent_icons: [] }),
            LoadSession: () => Promise.resolve({
                openTabs: [
                    { id: 'active.md', type: 'file', title: 'Active', path: 'active.md' },
                    { id: 'inactive.md', type: 'file', title: 'Inactive', path: 'inactive.md' },
                ],
                activeTabId: 'active.md',
                selectedFilePath: 'active.md',
                selectedTreePath: 'active.md',
                expandedDirs: [],
                pinnedTabs: [],
            }),
            ReadFile: path => path === 'active.md'
                ? new Promise(resolve => { resolveActiveFile = resolve; })
                : Promise.resolve({ content: '# Inactive', path, mtime: 1 }),
            LinkStyleLoad: () => Promise.resolve({ style: 'markdown' }),
            GetKanbanColumns: () => Promise.resolve({ columns: ['todo', 'wip', 'done'], colors: {} }),
            GetKanbanBoard: () => Promise.resolve({ todo: [], wip: [], done: [] }),
            GetHomeTasks: () => Promise.resolve([]),
            GetCalendarMonthData: () => Promise.resolve({ year: 2026, month: 7, days_with_notes: [], days_with_links: [], days_with_due_tasks: [], calendar: [] }),
            GetThemes: () => Promise.resolve({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
            GetThemeCSS: () => Promise.resolve({
                css: ':root { --accent-color: rgb(12, 145, 210); --editor-bg: rgb(31, 35, 42); }',
            }),
            ThemeLoad: () => new Promise(resolve => { resolveTheme = resolve; }),
            TabSizeLoad: () => Promise.resolve({ size: 4 }),
            AutoSaveLoad: () => Promise.resolve(300),
        };
        window.go = {
            desktop: {
                App: new Proxy({}, {
                    get: (_target, method) => method === 'then' ? undefined : (...args) => {
                        calls.push(String(method));
                        const response = responses[method];
                        return response ? response(...args) : Promise.resolve({ success: true });
                    },
                }),
            },
        };
    });

    await page.goto('/');
    await expect(page.locator('#vault-loading-panel')).toBeHidden();
    await expect(page.locator('#app')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect.poll(() => page.evaluate(() => window.__startupCalls.includes('ThemeLoad'))).toBe(true);
    expect(await page.evaluate(() => window.__startupCalls.includes('StartVaultLoad'))).toBe(false);

    await page.evaluate(() => window.__resolveStartupTheme());
    await expect.poll(() => page.evaluate(() => window.__startupCalls.includes('ReadFile'))).toBe(true);
    expect(await page.evaluate(() => window.__startupCalls.includes('StartVaultLoad'))).toBe(false);

    await page.evaluate(() => window.__resolveActiveFile());
    await expect(page.locator('.cm-content')).toContainText('Restored immediately');
    await expect(page.locator('#vault-loading-panel')).toBeVisible();
    await expect(page.locator('#vault-loading-title')).toHaveText('Loading vault');
    await expect(page.locator('#vault-loading-count')).toHaveText('100 / 2072 notes');
    await expect(page.locator('#vault-loading-progress')).toHaveAttribute('aria-valuenow', '5');
    await expect(page.locator('#vault-loading-progress-value')).toHaveCSS('background-color', 'rgb(12, 145, 210)');
    await expect(page.locator('#vault-loading-panel')).toHaveCSS('display', 'flex');
    expect(await page.locator('#vault-loading-panel').evaluate(element => element.closest('footer')?.id)).toBe('status-bar');

    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Early edit.');
    await expect(page.locator('.cm-content')).toContainText('Early edit.');
    expect(await page.evaluate(() => window._appReady)).toBe(false);

    const startupCalls = await page.evaluate(() => window.__startupCalls);
    expect(startupCalls.indexOf('ThemeLoad')).toBeLessThan(startupCalls.indexOf('GetThemeCSS'));
    expect(startupCalls.indexOf('GetThemeCSS')).toBeLessThan(startupCalls.indexOf('ReadFile'));
    expect(startupCalls.indexOf('ReadFile')).toBeLessThan(startupCalls.indexOf('StartVaultLoad'));
    expect(startupCalls.indexOf('StartVaultLoad')).toBeLessThan(startupCalls.indexOf('GetVaultLoadStatus'));
    expect(startupCalls.indexOf('GetVaultLoadStatus')).toBeLessThan(startupCalls.indexOf('GetFileTree'));
    expect(startupCalls.filter(call => call === 'ReadFile')).toEqual(['ReadFile']);

    const progressGeometry = await page.locator('#vault-loading-progress').evaluate(track => {
        const fill = track.querySelector('.ui-progress-value');
        const trackRect = track.getBoundingClientRect();
        const fillRect = fill.getBoundingClientRect();
        return {
            trackHeight: trackRect.height,
            fillTopOffset: fillRect.top - trackRect.top,
            fillBottomOffset: trackRect.bottom - fillRect.bottom,
            fillPosition: getComputedStyle(fill).position,
        };
    });
    expect(progressGeometry).toEqual({
        trackHeight: 4,
        fillTopOffset: 0,
        fillBottomOffset: 0,
        fillPosition: 'static',
    });

    await page.evaluate(() => window.__emitVaultLoadProgress({
        generation: 1,
        phase: 'loading',
        loaded: 1036,
        total: 2072,
    }));
    await expect(page.locator('#vault-loading-count')).toHaveText('1036 / 2072 notes');
    await expect(page.locator('#vault-loading-progress')).toHaveAttribute('aria-valuenow', '50');

    await page.evaluate(() => window.__resolveStartupTree());
    expect(await page.evaluate(() => window._appReady)).toBe(false);
    await page.evaluate(() => window.__emitVaultLoadProgress({
        generation: 1,
        phase: 'ready',
        loaded: 2072,
        total: 2072,
    }));
    await page.waitForFunction(() => window._appReady === true);
    await expect(page.locator('#vault-loading-panel')).toBeHidden();
    await expect(page.locator('.cm-content')).toContainText('Early edit.');
});
