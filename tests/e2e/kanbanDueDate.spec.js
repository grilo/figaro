import { expect, test } from '@playwright/test';

// Browser-only boundary: the card's painted control geometry, themed date
// picker placement, pointer delivery, and focus restoration after an overlay.
test('Kanban cards place task actions and clickable schedule pills at the requested edges', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-31T12:00:00') });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = window.__figaroDebugBackend;
        const task = {
            file: 'Roadmap.md', file_name: 'Roadmap.md', line: 3,
            text: 'Publish the roadmap', tag: 'todo', source: 'Publish the roadmap #todo',
        };
        let schedule = null;
        app.GetKanbanColumns = async () => ({ columns: ['todo', 'wip', 'done'], colors: {} });
        app.GetKanbanBoard = async () => ({ todo: [task], wip: [], done: [] });
        app.GetTaskSchedules = async () => schedule ? [structuredClone(schedule)] : [];
        app.SetTaskSchedule = async (identity, start, end, id) => {
            schedule = start || end
                ? { id: id || 'roadmap-schedule', task: { ...task, ...identity }, start, end }
                : null;
        };
        const { openTab } = await import('/js/tabManager.js');
        openTab('kanban', 'Kanban', 'kanban');
    });

    const card = page.locator('.kanban-card');
    const title = card.locator('.kanban-card-text');
    const trigger = card.locator('.kanban-card-menu-trigger');
    const start = card.locator('[data-date-field="start"]');
    const due = card.locator('[data-date-field="end"]');
    await expect(title).toHaveText('Publish the roadmap');
    await expect(card).not.toContainText('Roadmap.md');
    await expect(start).toContainText('Not started');
    await expect(due).toContainText('No due date');

    const cardGeometry = await card.evaluate(element => {
        const box = selector => {
            const rect = element.querySelector(selector).getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        };
        const cardRect = element.getBoundingClientRect();
        return {
            card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
            title: box('.kanban-card-text'),
            trigger: box('.kanban-card-menu-trigger'),
            start: box('[data-date-field="start"]'),
            due: box('[data-date-field="end"]'),
            startDecoration: getComputedStyle(element.querySelector('[data-date-field="start"]')).textDecorationLine,
            dueDecoration: getComputedStyle(element.querySelector('[data-date-field="end"]')).textDecorationLine,
        };
    });
    expect(cardGeometry.trigger.left).toBeGreaterThan(cardGeometry.title.left);
    expect(cardGeometry.trigger.top).toBeLessThan(cardGeometry.title.bottom);
    expect(cardGeometry.card.right - cardGeometry.trigger.right).toBeLessThanOrEqual(13);
    expect(cardGeometry.start.left).toBeLessThan(cardGeometry.due.left);
    expect(cardGeometry.start.top).toBeGreaterThanOrEqual(cardGeometry.title.bottom);
    expect(cardGeometry.due.top).toBe(cardGeometry.start.top);
    expect(cardGeometry.card.right - cardGeometry.due.right).toBeLessThanOrEqual(13);
    expect(cardGeometry.startDecoration).toBe('none');
    expect(cardGeometry.dueDecoration).toBe('none');

    await start.click();
    await expect(page.getByRole('dialog', { name: 'Choose start date' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();
    await start.click();
    await page.getByRole('dialog', { name: 'Choose start date' })
        .getByRole('button', { name: 'Today', exact: true }).click();
    await expect(start).toContainText('Start Aug 31');

    await due.click();
    const picker = page.getByRole('dialog', { name: 'Choose due date' });
    await expect(picker).toBeVisible();
    const pickerGeometry = await picker.evaluate(element => {
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
    expect(pickerGeometry.left).toBeGreaterThanOrEqual(0);
    expect(pickerGeometry.top).toBeGreaterThanOrEqual(0);
    expect(pickerGeometry.right).toBeLessThanOrEqual(pickerGeometry.viewportWidth);
    expect(pickerGeometry.bottom).toBeLessThanOrEqual(pickerGeometry.viewportHeight);
    expect(pickerGeometry.width).toBeGreaterThan(250);
    expect(pickerGeometry.background).not.toBe('rgba(0, 0, 0, 0)');
    await picker.getByRole('button', { name: 'Today', exact: true }).click();

    await expect(due).toHaveText('Due today');
    await expect(page.locator('#sidebar-kanban')).toHaveClass(/kanban-due-today/);
    await expect(page.locator('#sidebar-kanban')).toHaveAttribute('aria-label', /1 task due today/);
    await expect(card).toBeFocused();

    await trigger.click();
    const menu = page.getByRole('menu', { name: /Actions for Publish the roadmap/ });
    await expect(menu.getByRole('menuitem')).toHaveText([
        'Clear start and due dates',
        'Remove from board',
    ]);
    await menu.getByRole('menuitem', { name: 'Clear start and due dates' }).click();
    await expect(start).toContainText('Not started');
    await expect(due).toContainText('No due date');
});
