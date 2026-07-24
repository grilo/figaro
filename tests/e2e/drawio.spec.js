import { expect, test } from '@playwright/test';

const drawioOrigin = 'https://embed.diagrams.net';

test('saves an editable SVG through the real diagrams.net iframe', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const protocolTrace = [];
    page.on('console', message => {
        const text = message.text();
        if (text.includes('[draw.io]')) protocolTrace.push(text);
    });

    let diagramsNetReachable = false;
    try {
        const response = await page.request.get(`${drawioOrigin}/`, { timeout: 15000 });
        diagramsNetReachable = response.ok();
    } catch (_) {
        // This is an external-service integration check. Keep the local suite
        // useful on an offline machine, but make the skipped dependency clear.
    }
    test.skip(!diagramsNetReachable, 'embed.diagrams.net is unreachable from this test environment');

    try {
        await page.goto('/');
        await page.waitForFunction(() => window._appReady === true);
        await page.evaluate(async () => {
            const app = window.__figaroDebugBackend;
            window.__figaroDrawioDebug = true;
            window.__drawioSaveRecords = [];
            app.ReadDiagram = async path => ({
                path,
                mtime: 1,
                content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            });
            app.SaveFile = async (path, content) => {
                window.__drawioSaveRecords.push({ path, content });
                return { success: true, path, mtime: 2 };
            };

            const { renderDrawioTab } = await import('/js/drawio.js');
            const panel = document.createElement('section');
            panel.className = 'tab-panel active';
            panel.dataset.tabId = 'Diagrams/browser.drawio.svg';
            document.getElementById('tab-panels').appendChild(panel);
            await renderDrawioTab(panel, {
                id: 'Diagrams/browser.drawio.svg',
                path: 'Diagrams/browser.drawio.svg',
                title: 'browser.drawio.svg',
                mtime: 1,
            });
        });

        const iframe = page.locator('.drawio-frame');
        await expect(iframe).toBeVisible();
        const editor = page.frameLocator('.drawio-frame');
        await expect(editor.locator('.geMenubar')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('[data-drawio-loading]')).toBeHidden({ timeout: 30000 });

        // This is the editor's File → Save action, not a host-side synthetic
        // postMessage. In headless Chromium diagrams.net leaves a transparent
        // focus layer above the visible menu bar. Disable only that layer so
        // Playwright can deliver trusted pointer events to the real controls.
        await editor.locator('.geBackground').evaluate(element => {
            element.style.pointerEvents = 'none';
        });
        await editor.getByText('File', { exact: true }).click();
        const saveItem = editor.getByText('Save', { exact: true }).last();
        await expect(saveItem).toBeVisible();
        await saveItem.click();

        try {
            await expect.poll(() => page.evaluate(() => window.__drawioSaveRecords), { timeout: 45000 }).toEqual([
                expect.objectContaining({
                    path: 'Diagrams/browser.drawio.svg',
                    content: expect.stringMatching(/<svg[\s>]/i),
                }),
            ]);
        } catch (error) {
            const hostState = await page.evaluate(() => ({
                status: document.querySelector('[data-drawio-status]')?.textContent,
                saving: document.querySelector('.tab-panel[data-tab-id="Diagrams/browser.drawio.svg"]')?._drawioSession?.saving,
                trace: window.__figaroDrawioProtocolTrace || [],
            }));
            throw new Error(`${error.message}\nDraw.io host state: ${JSON.stringify(hostState)}`);
        }
        expect(protocolTrace.some(entry => /received.*"event":"save"/.test(entry))).toBe(true);
        expect(protocolTrace.some(entry => /saved SVG/.test(entry))).toBe(true);
        await expect(page.locator('[data-drawio-status]')).toHaveText('Saved');
    } finally {
        const trace = await page.evaluate(() => window.__figaroDrawioProtocolTrace || []);
        await testInfo.attach('drawio-protocol.log', {
            body: JSON.stringify(trace, null, 2),
            contentType: 'text/plain',
        });
    }
});
