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
    await expect(page.locator('.workspace-home-panel.active .home-view h1')).toHaveText('Today');

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

test('keeps the Today launchpad responsive and creates a missing daily note from its primary action', async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 680 });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(() => {
        window.__todayDirectories = [];
        window.__todayCreates = [];
        window.__figaroDebugBackend.CreateDirectory = path => {
            window.__todayDirectories.push(path);
            return Promise.resolve({ success: true, path });
        };
        window.__figaroDebugBackend.CreateFile = (path, content) => {
            window.__todayCreates.push({ path, content });
            return Promise.resolve({ success: true, path, mtime: 42 });
        };
    });

    const home = page.locator('.workspace-home-panel.active .home-view');
    await expect(home.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(home.getByRole('button', { name: 'Create today’s note' })).toBeVisible();
    await expect(home.locator('.home-card')).toHaveCount(4);

    const geometry = await home.evaluate(element => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        actionWidth: element.querySelector('.home-today-action').getBoundingClientRect().width,
        shellWidth: element.querySelector('.home-shell').getBoundingClientRect().width,
        cardLefts: [...element.querySelectorAll('.home-card')].map(card => Math.round(card.getBoundingClientRect().left)),
    }));
    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.actionWidth).toBeGreaterThan(120);
    expect(geometry.shellWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(new Set(geometry.cardLefts).size).toBe(1);

    await home.getByRole('button', { name: 'Create today’s note' }).click();
    await expect(page.locator('.tab[data-tab-id="Inbox/2026-07-09.md"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__todayDirectories)).toEqual(['Inbox']);
    await expect.poll(() => page.evaluate(() => window.__todayCreates)).toEqual([
        { path: 'Inbox/2026-07-09.md', content: '# 2026-07-09\n\n' },
    ]);
});

test('keeps the active tab inside the real overflow viewport and exposes themed edge fades only while needed', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const { setState } = await import('/js/state.js');
        const { openTab } = await import('/js/tabManager.js');
        setState('openTabs', []);
        setState('activeTabId', null);
        for (let index = 1; index <= 8; index += 1) {
            const path = `overflow-${index}.md`;
            openTab(path, `Overflow note ${index}`, 'file', { path, isNew: true });
        }
    });

    const tabGeometry = () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        const strip = document.getElementById('tab-strip');
        const bar = document.getElementById('tab-bar');
        const active = strip.querySelector('.tab.active');
        const stripRect = strip.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        return {
            activeId: getState('activeTabId'),
            activeInsideStrip: activeRect.left >= stripRect.left - 1
                && activeRect.right <= stripRect.right + 1,
            scrollLeft: strip.scrollLeft,
            allTabsHidden: document.getElementById('all-tabs-btn').hidden,
            startFade: getComputedStyle(bar, '::before').opacity,
            endFade: getComputedStyle(bar, '::after').opacity,
        };
    });

    await expect.poll(tabGeometry).toMatchObject({
        activeId: 'overflow-8.md',
        activeInsideStrip: true,
        allTabsHidden: false,
        startFade: '1',
        endFade: '0',
    });
    expect((await tabGeometry()).scrollLeft).toBeGreaterThan(0);

    await page.locator('#all-tabs-btn').click();
    await expect(page.locator('#all-tabs-dropdown')).toBeVisible();
    await expect(page.locator('#all-tabs-dropdown [role="menuitem"]')).toHaveCount(8);
    await page.locator('.all-tabs-item[data-tab-id="overflow-1.md"]').click();

    await expect.poll(tabGeometry).toMatchObject({
        activeId: 'overflow-1.md',
        activeInsideStrip: true,
        scrollLeft: 0,
        allTabsHidden: false,
        startFade: '0',
        endFade: '1',
    });

    await page.evaluate(async () => {
        const { getState, setState } = await import('/js/state.js');
        const { renderTabBar } = await import('/js/tabManager.js');
        const active = getState('openTabs').find(tab => tab.id === 'overflow-1.md');
        setState('openTabs', [active]);
        setState('activeTabId', active.id);
        renderTabBar();
    });
    await expect(page.locator('#all-tabs-btn')).toBeHidden();
    await expect.poll(tabGeometry).toMatchObject({
        activeInsideStrip: true,
        scrollLeft: 0,
        allTabsHidden: true,
        startFade: '0',
        endFade: '0',
    });
});
