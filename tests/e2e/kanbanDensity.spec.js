import { expect, test } from '@playwright/test';

test('shows a themed Kanban loading state and applies presentation preferences from Settings', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        let resolveBoard;
        window.__resolveKanbanBoard = value => resolveBoard(value);
        app.GetKanbanColumns = async () => ({ columns: ['todo', 'wip', 'done'], colors: {} });
        app.GetKanbanBoard = () => new Promise(resolve => { resolveBoard = resolve; });
        const { openTab } = await import('/js/tabManager.js');
        openTab('kanban', 'Kanban', 'kanban');
    });

    const loading = page.locator('.kanban-loading');
    await expect(loading).toBeVisible();
    await expect(loading.locator('.kanban-skeleton-column')).toHaveCount(3);
    const skeletonStyle = await loading.locator('.kanban-skeleton-column').first().evaluate(element => {
        const style = getComputedStyle(element);
        return { borderRadius: style.borderRadius, background: style.backgroundColor };
    });
    expect(skeletonStyle.borderRadius).not.toBe('0px');
    expect(skeletonStyle.background).not.toBe('rgba(0, 0, 0, 0)');

    const boardData = {
        todo: [{ file: 'Ideas.md', file_name: 'Ideas.md', line: 1, text: 'Ship density control', tag: 'todo' }],
        wip: [], done: [],
    };
    await page.evaluate(data => {
        window.__resolveKanbanBoard(data);
        (async () => {
            const app = (await import('/js/backend.js')).backend();
            app.GetKanbanBoard = async () => data;
        })();
    }, boardData);
    await expect(page.locator('.kanban-card-text')).toContainText('Ship density control');

    await page.locator('#topbar-settings').click();
    const compact = page.locator('.settings-panel-tab [data-kanban-density="compact"]');
    await compact.click();
    const stacked = page.locator('.settings-panel-tab [data-kanban-layout="stacked"]');
    await stacked.click();

    await page.locator('#sidebar-kanban').click();
    await expect(page.locator('.kanban-view-wrapper')).toHaveAttribute('data-density', 'compact');
    await expect(page.locator('.kanban-view-wrapper')).toHaveAttribute('data-layout', 'stacked');
    await expect(compact).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('kanbanDensity'))).toBe('compact');
    expect(await page.evaluate(() => localStorage.getItem('kanbanLayout'))).toBe('stacked');
    expect(await page.locator('.kanban-card').evaluate(element => getComputedStyle(element).paddingTop)).toBe('7px');
    expect(await page.locator('.kanban-board').evaluate(element => {
        const style = getComputedStyle(element);
        return { overflowX: style.overflowX, overflowY: style.overflowY };
    })).toEqual({ overflowX: 'hidden', overflowY: 'auto' });
});
