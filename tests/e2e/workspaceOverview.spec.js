import { expect, test } from '@playwright/test';

test('closing the final tab keeps the centered workspace overview without creating Welcome', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const { setState } = await import('/js/state.js');
        const { openTab } = await import('/js/tabManager.js');
        setState('openTabs', []);
        setState('activeTabId', null);
        document.querySelectorAll('.tab-panel[data-tab-id]').forEach(panel => panel.remove());
        openTab('scratch.md', 'Scratch', 'file', { path: 'scratch.md', isNew: true });
    });

    await expect(page.locator('.tab[data-tab-id="scratch.md"]')).toBeVisible();
    await page.locator('.tab[data-tab-id="scratch.md"] .tab-close').click();

    await expect(page.locator('#tab-strip .tab')).toHaveCount(0);
    await expect(page.locator('.tab[data-tab-id="home"]')).toHaveCount(0);
    await expect(page.locator('.workspace-home-panel.active .home-view h1')).toHaveText('Your workspace');

    const workspace = await page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        const panel = document.querySelector('.workspace-home-panel.active');
        const shell = panel.querySelector('.home-shell').getBoundingClientRect();
        const workspace = document.getElementById('main-content').getBoundingClientRect();
        return {
            tabs: getState('openTabs'),
            activeTabId: getState('activeTabId'),
            centered: Math.abs((shell.left + shell.right) / 2 - (workspace.left + workspace.right) / 2) < 2,
        };
    });
    expect(workspace).toEqual({ tabs: [], activeTabId: null, centered: true });
});
