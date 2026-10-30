import { expect, test } from '@playwright/test';

// One representative workflow for what jsdom cannot show: the real vendored
// Excalidraw bundle mounting React and canvases in Figaro's page, its fonts
// loading from Figaro, Figaro's theme reaching Excalidraw's chrome, and a
// Ctrl+S save producing an SVG whose embedded scene reopens.
test('draws, saves and reopens an Excalidraw drawing without leaving the app', async ({ page }) => {
    const path = 'Sketches/browser.excalidraw.svg';
    const externalRequests = [];
    page.on('request', request => {
        const url = new URL(request.url());
        if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol.startsWith('http')) {
            externalRequests.push(request.url());
        }
    });

    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async drawingPath => {
        const app = window.__figaroDebugBackend;
        window.__excalidrawSaves = [];
        app.ReadDiagram = async requested => ({ path: requested, mtime: 1, content: '' });
        app.SaveFileToDisk = async (requested, content) => {
            window.__excalidrawSaves.push({ path: requested, content });
            return { success: true, path: requested, mtime: 2 };
        };
        const { openTab } = await import('/js/tabManager.js');
        openTab(drawingPath, 'browser.excalidraw.svg', 'excalidraw', { path: drawingPath, mtime: 1 });
    }, path);

    const rectangleTool = page.locator('.excalidraw [data-testid="toolbar-rectangle"]');
    await expect(rectangleTool).toBeVisible({ timeout: 20000 });

    const island = page.locator('.excalidraw .App-toolbar').first();
    const colors = await island.evaluate(element => ({
        island: getComputedStyle(element).backgroundColor,
        panel: getComputedStyle(document.documentElement).getPropertyValue('--panel-bg').trim(),
    }));
    const probe = await page.evaluate(color => {
        const element = document.createElement('div');
        element.style.backgroundColor = color;
        document.body.appendChild(element);
        const resolved = getComputedStyle(element).backgroundColor;
        element.remove();
        return resolved;
    }, colors.panel);
    expect(colors.island).toBe(probe);
    // The canvas paints nothing behind the drawing, so the theme background shows through.
    const canvasCorner = await page.locator('.excalidraw canvas.static')
        .evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(2, 2, 1, 1).data));
    expect(canvasCorner[3]).toBe(0);

    // More tools offers only what works offline: no web embeds or Mermaid conversion.
    await page.locator('.excalidraw .App-toolbar__extra-tools-trigger').click();
    const moreTools = page.locator('.excalidraw .dropdown-menu-container');
    await expect(moreTools.getByText('Laser pointer')).toBeVisible();
    await expect(moreTools.getByText('Web Embed')).toBeHidden();
    await expect(moreTools.getByText('Mermaid to Excalidraw')).toBeHidden();
    await expect(moreTools.getByText('Generate', { exact: true })).toBeHidden();
    await page.keyboard.press('Escape');

    await page.locator('.excalidraw label:has([data-testid="toolbar-rectangle"])').click();
    const canvas = page.locator('.excalidraw canvas.interactive');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(`.tab[data-tab-id="${path}"]`)).toHaveClass(/dirty/);

    await page.keyboard.press('Control+s');
    await expect.poll(() => page.evaluate(() => window.__excalidrawSaves.length), { timeout: 15000 }).toBe(1);
    await expect(page.locator(`.tab[data-tab-id="${path}"]`)).not.toHaveClass(/dirty/);

    const saved = await page.evaluate(async () => {
        const { path: savedPath, content } = window.__excalidrawSaves[0];
        const scene = await window.FigaroExcalidraw.loadSceneFromSVG(content);
        return {
            savedPath,
            types: scene.elements.filter(element => !element.isDeleted).map(element => element.type),
        };
    });
    expect(saved).toEqual({ savedPath: path, types: ['rectangle'] });
    expect(externalRequests).toEqual([]);
});
