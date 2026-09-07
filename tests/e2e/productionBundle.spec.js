import { expect, test } from '@playwright/test';

test('boots the generated production bundle and loads the selected editor font', async ({ page }) => {
    // The actual browser worker must finish dependency initialization before
    // readiness; a downloaded bundle alone does not establish runtime support.
    await page.addInitScript(() => {
        window.__workerReadiness = [];
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                const state = { url: String(url), ready: false, errors: [] };
                window.__workerReadiness.push(state);
                this.addEventListener('message', event => {
                    if (event.data.ready) state.ready = true;
                    if (event.data.initializationError) state.errors.push(event.data.initializationError);
                });
                this.addEventListener('error', event => state.errors.push(event.message));
            }
        };
    });
    const applicationRequests = [];
    page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/app.bundle.js' || pathname.endsWith('.worker.js') || pathname.startsWith('/js/')) applicationRequests.push(pathname);
    });

    await page.goto('/?figaro-entry=production');
    await page.waitForFunction(() => window._appReady === true);
    expect(await page.evaluate(() => window.__workerReadiness)).toEqual(expect.arrayContaining(
        ['/writing.worker.js', '/spelling.worker.js', '/decisions.worker.js'].map(url => ({ url, ready: true, errors: [] })),
    ));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('script[type="module"][src="/app.bundle.js"]')).toHaveCount(1);
    expect(applicationRequests.filter(pathname => pathname === '/app.bundle.js')).toHaveLength(1);
    expect(applicationRequests.filter(pathname => pathname.startsWith('/js/'))).toEqual([]);
    expect(applicationRequests.filter(pathname => pathname.endsWith('.worker.js')).sort()).toEqual(['/decisions.worker.js', '/spelling.worker.js', '/writing.worker.js']);
    applicationRequests.length = 0;

    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('#editor-container > .cm-editor')).toBeVisible();
    await expect(page.locator('#editor-container .cm-content'))
        .toHaveAttribute('aria-label', 'Markdown editor — Welcome.md');

    await page.locator('#topbar-settings').click();
    await page.locator('#font-picker-btn').click();
    await page.locator('.font-picker-item[data-id="figtree"]').click();
    await expect(page.locator('#font-current-name')).toHaveText('Figtree');

    const font = await page.evaluate(async () => {
        await document.fonts.load('16px "Figtree"');
        const editor = document.querySelector('#editor-container .cm-content');
        return {
            available: document.fonts.check('16px "Figtree"'),
            appliedFamily: getComputedStyle(editor).fontFamily,
        };
    });
    expect(font.available).toBe(true);
    expect(font.appliedFamily).toContain('Figtree');
    expect(applicationRequests).toEqual([]);
});
