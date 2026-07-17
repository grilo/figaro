import { expect, test } from '@playwright/test';

test('keeps workspace destinations in the sidebar and expands Calendar inline', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appInitialized === true);
    await page.evaluate(async () => {
        const { setState } = await import('/js/state.js');
        setState('openTabs', []);
        setState('activeTabId', null);
    });

    const sidebar = page.locator('#sidebar');
    const tools = page.locator('.sidebar-tools');
    const calendarButton = page.locator('#sidebar-calendar');
    const calendarPanel = page.locator('#sidebar-calendar-panel');
    const kanbanButton = page.locator('#sidebar-kanban');
    const settingsButton = page.locator('#topbar-settings');

    await expect(page.locator('.top-bar-center')).toBeEmpty();
    await expect(settingsButton.locator('xpath=..')).toHaveClass(/top-bar-right/);
    await expect(calendarButton).toBeVisible();
    await expect(kanbanButton).toBeVisible();

    const placement = await page.evaluate(() => {
        const sidebar = document.getElementById('sidebar').getBoundingClientRect();
        const tools = document.querySelector('.sidebar-tools').getBoundingClientRect();
        const fileTree = document.getElementById('file-tree').getBoundingClientRect();
        return {
            toolsBelowTree: tools.top >= fileTree.bottom - 1,
            toolsAtBottom: Math.abs(sidebar.bottom - tools.bottom) <= 1,
            calendarInLeftSidebar: document.getElementById('sidebar').contains(document.getElementById('sidebar-calendar-panel')),
            calendarInRightSidebar: document.getElementById('right-sidebar').contains(document.getElementById('sidebar-calendar-panel')),
        };
    });
    expect(placement).toEqual({
        toolsBelowTree: true,
        toolsAtBottom: true,
        calendarInLeftSidebar: true,
        calendarInRightSidebar: false,
    });

    await calendarButton.click();
    await expect(calendarPanel).toHaveClass(/open/);
    await expect(calendarPanel).toHaveAttribute('aria-hidden', 'false');
    await expect(calendarButton).toHaveAttribute('aria-expanded', 'true');
    await expect(calendarPanel).toBeVisible();
    await expect(page.locator('#cal-month-year')).not.toHaveText('');
    await expect(page.locator('#calendar-grid .cal-day-header')).toHaveCount(7);
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);

    // Collapsing closes the panel but leaves a usable destination rail.
    await page.locator('#toggle-sidebar').click();
    await expect(sidebar).toHaveClass(/collapsed/);
    await expect(calendarPanel).not.toHaveClass(/open/);
    await expect(calendarButton).toBeVisible();
    await expect.poll(async () => sidebar.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(44);

    // Calendar selected from the rail expands the sidebar and opens inline.
    await calendarButton.click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await expect(calendarPanel).toHaveClass(/open/);
    await expect.poll(async () => sidebar.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBeGreaterThanOrEqual(225);

    // Inactive destinations reuse one tab; clicking the active destination
    // closes its corresponding view.
    await kanbanButton.click();
    await settingsButton.click();
    await kanbanButton.click();
    const tabs = await page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return {
            active: getState('activeTabId'),
            kanban: getState('openTabs').filter(tab => tab.id === 'kanban').length,
            settings: getState('openTabs').filter(tab => tab.id === 'settings').length,
        };
    });
    expect(tabs).toEqual({ active: 'kanban', kanban: 1, settings: 1 });
    await expect(kanbanButton).toHaveClass(/active/);
    await expect(settingsButton).not.toHaveClass(/active/);

    await page.locator('.tab-panel[data-tab-id="kanban"]').evaluate(panel => {
        window.__figaroKanbanExitAnimations = [];
        panel.addEventListener('animationstart', event => window.__figaroKanbanExitAnimations.push(event.animationName));
    });
    await kanbanButton.click();
    await expect.poll(() => page.evaluate(() => window.__figaroKanbanExitAnimations)).toContain('figaro-panel-exit');
    await expect.poll(async () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('openTabs').filter(tab => tab.id === 'kanban').length;
    })).toBe(0);
    await expect(kanbanButton).not.toHaveClass(/active/);
    await expect(settingsButton).toHaveClass(/active/);

    // Closing Kanban activates the remaining Settings tab; its next click
    // closes that active view as well.
    await page.locator('.tab-panel[data-tab-id="settings"]').evaluate(panel => {
        window.__figaroSettingsExitAnimations = [];
        panel.addEventListener('animationstart', event => window.__figaroSettingsExitAnimations.push(event.animationName));
    });
    await settingsButton.click();
    await expect.poll(() => page.evaluate(() => window.__figaroSettingsExitAnimations)).toContain('figaro-panel-exit');
    await expect.poll(async () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('openTabs').filter(tab => tab.id === 'settings').length;
    })).toBe(0);
    await expect(settingsButton).not.toHaveClass(/active/);
});
