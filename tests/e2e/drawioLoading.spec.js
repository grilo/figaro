import { expect, test } from '@playwright/test';

test('shows a themed non-white Draw.io loader while a diagram is opening', async ({ page }) => {
    await page.route('https://embed.diagrams.net/**', route => route.abort());
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        document.documentElement.style.setProperty('--bg-color', '#15110e');
        const app = window.__figaroDebugBackend;
        app.ReadDiagram = () => new Promise(resolve => {
            window.__resolveDrawioRead = resolve;
        });

        const { renderDrawioTab } = await import('/js/drawio.js');
        const panel = document.createElement('section');
        panel.className = 'tab-panel active';
        panel.dataset.tabId = 'Diagrams/loading.drawio.svg';
        document.getElementById('tab-panels').appendChild(panel);
        window.__drawioLoadingPanel = panel;
        renderDrawioTab(panel, {
            id: 'Diagrams/loading.drawio.svg',
            path: 'Diagrams/loading.drawio.svg',
            title: 'loading.drawio.svg',
            mtime: 1,
        });
    });

    const loader = page.locator('.drawio-loading-card');
    await expect(loader).toBeVisible();
    await expect(loader.getByText('Opening diagram…')).toBeVisible();
    await expect(loader.getByRole('progressbar', { name: 'Loading diagram' })).toHaveAttribute('aria-valuetext', 'Opening diagram…');

    const appearance = await page.locator('.drawio-loading').evaluate(element => {
        const stage = element.closest('.drawio-view');
        const card = element.querySelector('.drawio-loading-card');
        const spinner = element.querySelector('.drawio-loading-spinner');
        return {
            stageBackground: getComputedStyle(stage).backgroundColor,
            cardBackground: getComputedStyle(card).backgroundColor,
            spinnerAccent: getComputedStyle(spinner).borderTopColor,
            focusable: element.querySelectorAll('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])').length,
        };
    });

    expect(appearance.stageBackground).toBe('rgb(21, 17, 14)');
    expect(appearance.cardBackground).not.toBe('rgb(255, 255, 255)');
    expect(appearance.spinnerAccent).not.toBe('rgb(255, 255, 255)');
    expect(appearance.focusable).toBe(0);

    await page.evaluate(() => window.__resolveDrawioRead({
        path: 'Diagrams/loading.drawio.svg',
        mtime: 1,
        content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    }));

    const iframeLoader = page.locator('[data-drawio-loading]');
    await expect(page.locator('.drawio-editor-stage')).toBeVisible();
    await expect(iframeLoader).toBeVisible();
    await expect(page.locator('.drawio-editor-stage')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.drawio-frame')).toHaveCSS('background-color', 'rgb(21, 17, 14)');

    await page.evaluate(async () => {
        const { disposeDrawioTab } = await import('/js/drawio.js');
        disposeDrawioTab(window.__drawioLoadingPanel);
        window.__drawioLoadingPanel.remove();
        delete window.__drawioLoadingPanel;
        delete window.__resolveDrawioRead;
    });
});
