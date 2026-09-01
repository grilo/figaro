import { expect, test } from '@playwright/test';

test('boots through the native Wails binding with the workspace overview, vault tree, and Calendar available', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-07-09T12:00:00Z'));
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

    const readsBeforeTreeOpen = await page.evaluate(() => window.__desktopBridgeCalls
        .filter(call => call.method === 'ReadFile' && call.args[0] === 'Welcome.md').length);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-content')).toContainText('Welcome to Figaro');
    await expect(page.locator('.cm-content')).toContainText('This text came through the native Wails binding.');
    await expect.poll(() => page.evaluate(() => window.__desktopBridgeCalls
        .filter(call => call.method === 'ReadFile' && call.args[0] === 'Welcome.md').length))
        .toBe(readsBeforeTreeOpen + 1);

    await page.locator('#sidebar-calendar').click();
    await expect(page.locator('#calendar-workspace-view')).toBeVisible();
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

test('restores the saved active buffer directly into persistent Pure mode', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('sidebarCollapsed', 'true');
        localStorage.setItem('pureTypewriterEnabled', 'false');
        localStorage.setItem('pureFocusScope', 'paragraph');
        localStorage.setItem('pureAdaptiveTypographyEnabled', 'true');
        const calls = [];
        const observations = { sidebarWidths: [], visibleEditorFrames: [] };
        window.__pureRestartCalls = calls;
        window.__pureRestartObservations = observations;

        const recordFrame = () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                const width = Math.round(sidebar.getBoundingClientRect().width * 10) / 10;
                if (observations.sidebarWidths.at(-1) !== width) observations.sidebarWidths.push(width);
            }
            const app = document.getElementById('app');
            const content = document.querySelector('.cm-content');
            const editor = document.querySelector('.cm-editor');
            if (content && app?.dataset.startupHydrating !== 'true') {
                observations.visibleEditorFrames.push({
                    pure: app.classList.contains('pure-editing-chrome'),
                    pureWriting: editor?.classList.contains('cm-pure-writing') || false,
                    typewriter: editor?.classList.contains('cm-pure-typewriter') || false,
                    focusDimmed: document.querySelectorAll('.cm-pure-focus-dimmed').length,
                    typographyTier: editor?.dataset.pureTypographyTier || '',
                    activeTab: document.querySelector('.tab.active')?.dataset.tabId || '',
                    text: content.textContent,
                });
            }
            if (!window._appReady || performance.now() < 1600) requestAnimationFrame(recordFrame);
        };
        requestAnimationFrame(recordFrame);

        window.runtime = { EventsOn: () => {} };
        const responses = {
            LoadSession: {
                openTabs: [{ id: 'remembered.md', type: 'file', title: 'Remembered', path: 'remembered.md' }],
                activeTabId: 'remembered.md',
                selectedFilePath: 'remembered.md',
                selectedTreePath: 'remembered.md',
                expandedDirs: [],
                pinnedTabs: [],
            },
            ReadFile: { content: '# Remembered buffer\n\nContinue writing here.', path: 'remembered.md', mtime: 1 },
            GetFileTree: [{ name: 'remembered.md', path: 'remembered.md', type: 'file', mtime: 1 }],
            GetFileTreeStyles: { version: 1, entries: {}, recent_icons: [] },
            GetVaultLoadStatus: { generation: 1, phase: 'ready', loaded: 1, total: 1 },
            GetLaunchExternalFiles: [],
            ThemeLoad: { theme: 'default', font: 'inter', codeFont: 'theme-mono' },
            GetThemes: { themes: [{ id: 'default', name: 'Figaro Dark' }] },
            GetThemeCSS: { css: '' },
            TabSizeLoad: { size: 4 },
            LinkStyleLoad: { style: 'markdown' },
            VimLoad: { enabled: false },
            VimVisualRowsLoad: { enabled: false },
            VimRevealBlocksLoad: { enabled: false },
            LineNumbersLoad: { enabled: false },
            MarkdownLintLoad: { enabled: true },
            SpellcheckLoad: { enabled: false, language: 'en-US' },
            EditorNavigationLoad: { stickyHeadings: true, blockGuides: true, documentOutline: true },
            AutoCommitLoad: true,
            AutoSaveLoad: 300,
            GetKanbanColumns: { columns: ['todo', 'wip', 'done'], colors: {} },
            GetKanbanBoard: { todo: [], wip: [], done: [] },
            GetHomeTasks: [],
            GetCalendarMonthData: { year: 2026, month: 7, days_with_notes: [], days_with_links: [], calendar: [] },
        };
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
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    await expect(page.locator('#app')).toHaveClass(/pure-editing-chrome/);
    await expect(page.locator('.tab[data-tab-id="remembered.md"]')).toHaveClass(/active/);
    await expect(page.locator('.cm-content')).toContainText('Continue writing here.');

    await page.waitForTimeout(250);
    const result = await page.evaluate(() => ({
        observations: window.__pureRestartObservations,
        saves: window.__pureRestartCalls.filter(call => call.method === 'SaveSession'),
    }));
    expect([...new Set(result.observations.sidebarWidths)]).toEqual([44]);
    expect(result.observations.visibleEditorFrames.length).toBeGreaterThan(0);
    expect(result.observations.visibleEditorFrames.every(frame => (
        frame.pure
        && frame.pureWriting
        && !frame.typewriter
        && frame.focusDimmed > 0
        && frame.typographyTier !== 'regular'
        && frame.activeTab === 'remembered.md'
        && frame.text.includes('Continue writing here.')
    ))).toBe(true);
    expect(result.saves.at(-1).args[0].activeTabId).toBe('remembered.md');
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

test('hydrates input and layout preferences before the first restored editor frame', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('sidebarWidth', '420');
        const source = [
            '# Project',
            '### Skipped heading level',
            'This sentnce has a misspeled wurd.   ',
            ...Array.from({ length: 90 }, (_, index) => `Paragraph ${index + 1}`),
            '## Decisions',
            ...Array.from({ length: 90 }, (_, index) => `Decision ${index + 1}`),
        ].join('\n');
        const calls = [];
        const resolvers = {};
        const observations = {
            statuses: [],
            sidebarWidths: [],
            contentFrames: [],
            stickyEverVisible: false,
            outlineEverVisible: false,
            lintEverVisible: false,
        };
        window.__hydrationCalls = calls;
        window.__startupObservations = observations;
        window.__releaseStartupHydration = () => {
            const values = {
                TabSizeLoad: { size: 4 },
                LinkStyleLoad: { style: 'markdown' },
                AutoCommitLoad: false,
                VimLoad: { enabled: true },
                VimVisualRowsLoad: { enabled: true },
                VimRevealBlocksLoad: { enabled: true },
                LineNumbersLoad: { enabled: true },
                MarkdownLintLoad: { enabled: false },
                SpellcheckLoad: { enabled: false, language: 'en-US' },
                EditorNavigationLoad: {
                    stickyHeadings: false,
                    blockGuides: false,
                    documentOutline: false,
                },
            };
            Object.entries(values).forEach(([method, value]) => resolvers[method]?.(value));
        };

        const recordFrame = () => {
            const status = document.getElementById('status-text')?.textContent || '';
            if (status && observations.statuses.at(-1) !== status) observations.statuses.push(status);
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                const width = Math.round(sidebar.getBoundingClientRect().width * 10) / 10;
                if (observations.sidebarWidths.at(-1) !== width) observations.sidebarWidths.push(width);
            }
            const sticky = document.getElementById('sticky-heading-stack');
            observations.stickyEverVisible ||= Boolean(sticky && !sticky.hidden && sticky.getBoundingClientRect().height > 0);
            const outline = document.getElementById('outline-toggle');
            observations.outlineEverVisible ||= Boolean(outline && !outline.hidden);
            observations.lintEverVisible ||= Boolean(document.querySelector('.cm-lintRange'));
            const content = document.querySelector('.cm-content');
            const editorVisible = document.getElementById('app')?.dataset.startupHydrating !== 'true';
            if (content && editorVisible) {
                observations.contentFrames.push({
                    left: Math.round(content.getBoundingClientRect().left * 10) / 10,
                    hasText: content.textContent.length > 0,
                    lineNumbers: Boolean(document.querySelector('.cm-lineNumbers')),
                    mode: document.getElementById('file-type')?.textContent || '',
                });
            }
            if (!window._appReady || performance.now() < 2000) requestAnimationFrame(recordFrame);
        };
        requestAnimationFrame(recordFrame);

        window.runtime = { EventsOn: () => {} };
        const held = method => new Promise(resolve => { resolvers[method] = resolve; });
        const responses = {
            ThemeLoad: () => Promise.resolve({ theme: 'default', font: 'inter', codeFont: 'theme-mono' }),
            GetThemes: () => Promise.resolve({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
            GetThemeCSS: () => Promise.resolve({ css: '' }),
            LoadSession: () => Promise.resolve({
                openTabs: [{ id: 'active.md', type: 'file', title: 'Active', path: 'active.md' }],
                activeTabId: 'active.md',
                selectedFilePath: 'active.md',
                selectedTreePath: 'active.md',
                expandedDirs: [],
                pinnedTabs: [],
                cursorStates: { 'active.md': { anchor: source.length - 1, head: source.length - 1 } },
            }),
            ReadFile: () => Promise.resolve({ content: source, path: 'active.md', mtime: 1 }),
            GetLaunchExternalFiles: () => Promise.resolve([]),
            StartVaultLoad: () => Promise.resolve(true),
            GetVaultLoadStatus: () => Promise.resolve({ generation: 1, phase: 'ready', loaded: 1, total: 1 }),
            GetFileTree: () => Promise.resolve([{ name: 'active.md', path: 'active.md', type: 'file', mtime: 1 }]),
            GetFileTreeStyles: () => Promise.resolve({ version: 1, entries: {}, recent_icons: [] }),
            GetKanbanColumns: () => Promise.resolve({ columns: ['todo', 'wip', 'done'], colors: {} }),
            GetKanbanBoard: () => Promise.resolve({ todo: [], wip: [], done: [] }),
            GetHomeTasks: () => Promise.resolve([]),
            GetCalendarMonthData: () => Promise.resolve({ year: 2026, month: 7, days_with_notes: [], days_with_links: [], days_with_due_tasks: [], calendar: [] }),
            TabSizeLoad: () => held('TabSizeLoad'),
            LinkStyleLoad: () => held('LinkStyleLoad'),
            AutoCommitLoad: () => held('AutoCommitLoad'),
            VimLoad: () => held('VimLoad'),
            VimVisualRowsLoad: () => held('VimVisualRowsLoad'),
            VimRevealBlocksLoad: () => held('VimRevealBlocksLoad'),
            LineNumbersLoad: () => held('LineNumbersLoad'),
            MarkdownLintLoad: () => held('MarkdownLintLoad'),
            SpellcheckLoad: () => held('SpellcheckLoad'),
            EditorNavigationLoad: () => held('EditorNavigationLoad'),
            AutoSaveLoad: () => Promise.resolve(300),
        };
        window.go = {
            desktop: {
                App: new Proxy({}, {
                    get: (_target, method) => method === 'then' ? undefined : (...args) => {
                        calls.push({ method: String(method), args });
                        const response = responses[method];
                        return response ? response(...args) : Promise.resolve({ success: true });
                    },
                }),
            },
        };
    });

    await page.goto('/');
    const hydrationMethods = [
        'TabSizeLoad',
        'LinkStyleLoad',
        'AutoCommitLoad',
        'VimLoad',
        'VimVisualRowsLoad',
        'VimRevealBlocksLoad',
        'LineNumbersLoad',
        'MarkdownLintLoad',
        'SpellcheckLoad',
        'EditorNavigationLoad',
    ];
    await expect.poll(() => page.evaluate(() => window.__hydrationCalls.map(call => call.method)))
        .toEqual(expect.arrayContaining(hydrationMethods));
    const callsBeforeRelease = await page.evaluate(() => window.__hydrationCalls.map(call => call.method));
    expect(callsBeforeRelease).not.toContain('ReadFile');
    expect(callsBeforeRelease).not.toContain('StartVaultLoad');
    await expect(page.locator('.cm-content')).toHaveCount(0);
    await expect(page.locator('#status-text')).toHaveText('Restoring workspace...');
    await expect(page.locator('#sidebar')).toHaveCSS('width', '420px');

    await page.evaluate(() => window.__releaseStartupHydration());
    await page.waitForFunction(async () => (await import('/js/editor.js')).getEditorContent().startsWith('# Project'));
    await expect(page.locator('#file-type')).toHaveText('NORMAL');
    await expect(page.locator('.cm-lineNumbers')).toBeVisible();

    const sourceBeforeCommand = await page.evaluate(async () => (await import('/js/editor.js')).getEditorContent());
    await page.locator('.cm-content').click();
    await page.keyboard.press('j');
    const sourceAfterCommand = await page.evaluate(async () => (await import('/js/editor.js')).getEditorContent());
    expect(sourceAfterCommand).toBe(sourceBeforeCommand);

    await page.waitForFunction(() => window._appReady === true);
    await page.waitForTimeout(800);
    const result = await page.evaluate(() => ({
        observations: window.__startupObservations,
        calls: window.__hydrationCalls.map(call => call.method),
    }));
    expect(result.observations.statuses[0]).toBe('Starting Figaro…');
    expect([...new Set(result.observations.sidebarWidths)]).toEqual([420]);
    expect(result.observations.contentFrames.length).toBeGreaterThan(0);
    expect(result.observations.contentFrames.every(frame => frame.lineNumbers)).toBe(true);
    expect(result.observations.contentFrames.every(frame => frame.mode === 'NORMAL')).toBe(true);
    const contentLefts = [...new Set(result.observations.contentFrames
        .filter(frame => frame.hasText)
        .map(frame => frame.left))];
    expect(contentLefts).toEqual([contentLefts[0]]);
    expect(result.observations.stickyEverVisible).toBe(false);
    expect(result.observations.outlineEverVisible).toBe(false);
    expect(result.observations.lintEverVisible).toBe(false);
    expect(result.calls.indexOf('EditorNavigationLoad')).toBeLessThan(result.calls.indexOf('ReadFile'));
    expect(result.calls.indexOf('ReadFile')).toBeLessThan(result.calls.indexOf('StartVaultLoad'));
});
