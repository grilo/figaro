import { expect, test } from '@playwright/test';

test('D opens the themed metadata date picker, Escape preserves the card, and focus returns after selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        let dueDate = '';
        app.GetKanbanColumns = async () => ({ columns: ['todo', 'wip', 'done'], colors: {} });
        app.GetKanbanBoard = async () => ({
            todo: [{
                file: 'Roadmap.md', file_name: 'Roadmap.md', line: 3,
                text: 'Publish the roadmap', tag: 'todo', source: 'Publish the roadmap #todo',
                ...(dueDate ? { due_date: dueDate } : {}),
            }],
            wip: [], done: [],
        });
        app.SetTaskDueDate = async (_task, date) => {
            dueDate = date;
            return null;
        };
        const { openTab } = await import('/js/tabManager.js');
        openTab('kanban', 'Kanban', 'kanban');
    });

    const card = page.locator('.kanban-card');
    await expect(card).toContainText('Publish the roadmap');
    await card.focus();
    await card.press('d');
    await expect(page.getByRole('dialog', { name: 'Choose due date' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();
    await expect(card).toContainText('Publish the roadmap');
    await card.press('D');

    const picker = page.locator('.ui-date-picker');
    await expect(picker).toBeVisible();
    const geometry = await picker.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            background: getComputedStyle(element).backgroundColor,
        };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.width).toBeGreaterThan(250);
    expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)');

    await picker.getByRole('button', { name: 'Today', exact: true }).click();

    await expect(picker).toHaveCount(0);
    await expect(page.locator('.kanban-card-due')).toHaveText('Due today');
    await expect(page.locator('#sidebar-kanban')).toHaveClass(/kanban-due-today/);
    await expect(page.locator('#sidebar-kanban')).toHaveAttribute('aria-label', /1 task due today/);
    await expect(card).toBeFocused();
});
