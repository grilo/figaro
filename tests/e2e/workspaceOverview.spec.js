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
        const barRect = bar.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const activeStyle = getComputedStyle(active);
        const inactive = strip.querySelector('.tab:not(.active)');
        return {
            activeId: getState('activeTabId'),
            activeInsideStrip: activeRect.left >= stripRect.left - 1
                && activeRect.right <= stripRect.right + 1,
            barHeight: barRect.height,
            tabFillsBar: Math.abs(activeRect.height - barRect.height) <= 1,
            tabGap: getComputedStyle(strip).gap,
            activeRadius: activeStyle.borderRadius,
            activeShadow: activeStyle.boxShadow,
            inactiveCloseOpacity: inactive
                ? getComputedStyle(inactive.querySelector('.tab-close')).opacity
                : '',
            scrollLeft: strip.scrollLeft,
            allTabsHidden: document.getElementById('all-tabs-btn').hidden,
            startFade: getComputedStyle(bar, '::before').opacity,
            endFade: getComputedStyle(bar, '::after').opacity,
        };
    });

    await expect.poll(tabGeometry).toMatchObject({
        activeId: 'overflow-8.md',
        activeInsideStrip: true,
        barHeight: 43,
        tabFillsBar: true,
        tabGap: '0px',
        activeRadius: '0px',
        inactiveCloseOpacity: '0.62',
        allTabsHidden: false,
        startFade: '1',
        endFade: '0',
    });
    expect((await tabGeometry()).activeShadow).toContain('inset');
    expect((await tabGeometry()).scrollLeft).toBeGreaterThan(0);

    // Browser focus is the risk here: each activation rerenders the tab DOM,
    // so repeated arrows must land on the newly mounted active tab.
    await page.locator('.tab[data-tab-id="overflow-8.md"]').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return {
            activeId: getState('activeTabId'),
            focusedId: document.activeElement?.dataset?.tabId || null,
            focusedRole: document.activeElement?.getAttribute?.('role') || null,
        };
    })).toEqual({ activeId: 'overflow-6.md', focusedId: 'overflow-6.md', focusedRole: 'tab' });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return {
            activeId: getState('activeTabId'),
            focusedId: document.activeElement?.dataset?.tabId || null,
        };
    })).toEqual({ activeId: 'overflow-8.md', focusedId: 'overflow-8.md' });

    // Use the browser's real wheel input so the non-passive rail handler and
    // end-to-start wrapping are both exercised outside jsdom.
    const tabStripBox = await page.locator('#tab-strip').boundingBox();
    await page.mouse.move(tabStripBox.x + tabStripBox.width / 2, tabStripBox.y + tabStripBox.height / 2);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('overflow-1.md');
    await page.mouse.wheel(0, -100);
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('overflow-8.md');

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

test('keeps the status bar on one fixed-height row at narrow widths', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 640 });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    // Computed geometry and visibility at a real narrow viewport cannot be
    // established by the unit DOM environment.
    const geometry = await page.locator('#status-bar').evaluate(element => {
        const bar = element.getBoundingClientRect();
        const visibleChildren = [...element.querySelectorAll('.status-left > *, .status-right > *')]
            .filter(child => getComputedStyle(child).display !== 'none')
            .map(child => child.getBoundingClientRect());
        return {
            height: bar.height,
            overflowY: getComputedStyle(element).overflowY,
            childrenInside: visibleChildren.every(rect => rect.top >= bar.top - 1 && rect.bottom <= bar.bottom + 1),
        };
    });

    expect(geometry).toEqual({ height: 24, overflowY: 'hidden', childrenInside: true });
});

test('reorders document tabs with a real pointer drag', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const { setState } = await import('/js/state.js');
        const { openTab } = await import('/js/tabManager.js');
        setState('openTabs', []);
        setState('activeTabId', null);
        for (let index = 1; index <= 3; index += 1) {
            const path = `drag-${index}.md`;
            openTab(path, `Drag note ${index}`, 'file', { path, isNew: true });
        }
    });

    const source = page.locator('.tab[data-tab-id="drag-1.md"]');
    const target = page.locator('.tab[data-tab-id="drag-3.md"]');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width * 0.8, targetBox.y + targetBox.height / 2, { steps: 8 });
    await expect(target).toHaveClass(/drop-after/);
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() || '')).toBe('');
    await expect.poll(() => source.evaluate(element => ({
        userSelect: getComputedStyle(element).userSelect,
        webkitUserSelect: getComputedStyle(element).webkitUserSelect,
    }))).toEqual({ userSelect: 'none', webkitUserSelect: 'none' });

    const fileTree = page.locator('#file-tree');
    const fileTreeBox = await fileTree.boundingBox();
    await page.mouse.move(fileTreeBox.x + fileTreeBox.width / 2, fileTreeBox.y + 24, { steps: 8 });
    await expect(page.locator('html')).toHaveClass(/tab-drag-selection-guard/);
    await expect.poll(() => fileTree.evaluate(element => ({
        userSelect: getComputedStyle(element).userSelect,
        webkitUserSelect: getComputedStyle(element).webkitUserSelect,
    }))).toEqual({ userSelect: 'none', webkitUserSelect: 'none' });
    expect(await fileTree.evaluate(element => {
        const event = new Event('selectstart', { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return event.defaultPrevented;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() || '')).toBe('');

    await page.mouse.move(targetBox.x + targetBox.width * 0.8, targetBox.y + targetBox.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('html')).not.toHaveClass(/tab-drag-selection-guard/);

    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('openTabs').map(tab => tab.id);
    })).toEqual(['drag-2.md', 'drag-3.md', 'drag-1.md']);
});

test('keeps differentiating filename endings and parent paths visible on long tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const { openTab } = await import('/js/tabManager.js');
        openTab(
            'Clients/Acme/Quarterly planning and forecasting — Europe.md',
            'Quarterly planning and forecasting — Europe.md',
            'file',
            { path: 'Clients/Acme/Quarterly planning and forecasting — Europe.md', isNew: true },
        );
        openTab(
            'Clients/Beacon/Quarterly planning and forecasting — Americas.md',
            'Quarterly planning and forecasting — Americas.md',
            'file',
            { path: 'Clients/Beacon/Quarterly planning and forecasting — Americas.md', isNew: true },
        );
    });

    const europe = page.locator('.tab[data-tab-id="Clients/Acme/Quarterly planning and forecasting — Europe.md"]');
    const americas = page.locator('.tab[data-tab-id="Clients/Beacon/Quarterly planning and forecasting — Americas.md"]');
    await expect(europe.locator('.tab-title-leading')).toHaveText(/Quarterly/);
    await expect(europe.locator('.tab-title-trailing')).toHaveText(/Europe\.md$/);
    await expect(europe.locator('.tab-location-path')).toHaveText('Clients/Acme');
    await expect(americas.locator('.tab-title-trailing')).toHaveText(/Americas\.md$/);
    await expect(americas.locator('.tab-location-path')).toHaveText('Clients/Beacon');
    await expect(europe).toHaveAttribute('aria-label', /Clients\/Acme\/Quarterly/);
    expect(await europe.locator('.tab-location').evaluate(element => element.getBoundingClientRect().width))
        .toBeGreaterThan(20);
});
