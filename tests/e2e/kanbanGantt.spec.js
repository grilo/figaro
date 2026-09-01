import { expect, test } from '@playwright/test';
import { expectContinuousTimelinePaint } from './support/timelinePaint.js';

// Browser-only boundary: sticky names, pointer-captured bar geometry, actual
// themed controls, popup focus/click delivery, and the fixed application footer. Identity and I/O cases
// are deliberately covered by model/adapter tests, not repeated here.
test('Gantt drags and resizes painted bars while sharing the unchanged application status row', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-31T12:00:00') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(() => {
        const app = window.__figaroDebugBackend;
        const card = { file: 'Tasks.md', file_name: 'Tasks.md', line: 1, text: 'Build Gantt view', source: 'Build Gantt view #wip', tag: 'wip' };
        const done = { ...card, line: 2, text: 'Research', source: 'Research #done', tag: 'done', completed: true };
        const unscheduled = { ...card, line: 3, text: 'Write release notes', source: 'Write release notes #todo', tag: 'todo' };
        const entries = [{ id: 'one', task: card, start: '2026-08-31', end: '2026-09-03' }, { id: 'two', task: done, start: '2026-08-27', end: '2026-08-29' }];
        app.GetKanbanBoard = async () => ({ todo: [unscheduled], wip: [card], done: [done] });
        app.GetKanbanColumns = async () => ({ columns: ['todo', 'wip', 'done'], colors: { todo: '#5588cc', wip: '#d8574a', done: '#3da674' } });
        app.GetTaskSchedules = async () => structuredClone(entries);
        app.SetTaskSchedule = async (task, start, end) => { Object.assign(entries.find(entry => entry.task.line === task.line), { start, end }); };
    });
    await page.locator('#sidebar-kanban').click();
    await expect(page.locator('.kanban-card')).toHaveCount(3);
    // Even reduced-motion entry paint can occupy its initial translated frame.
    // Establish the settled inset before using Kanban as the comparison anchor.
    await expect.poll(() => page.getByRole('group', { name: 'Kanban view' }).evaluate(element => (
        element.getBoundingClientRect().top - document.getElementById('tab-panels').getBoundingClientRect().top
    ))).toBe(14);
    const switchPosition = await page.getByRole('group', { name: 'Kanban view' }).boundingBox();
    await page.locator('#sidebar-calendar').click();
    const calendarPosition = await page.getByRole('group', { name: 'Calendar presentation' }).boundingBox();
    expect(switchPosition.x).toBe(calendarPosition.x);
    await expect.poll(async () => (await page.getByRole('group', { name: 'Calendar presentation' }).boundingBox()).y).toBe(switchPosition.y);
    await page.locator('#sidebar-graph').click();
    const graphPosition = await page.locator('.graph-floating-controls').boundingBox();
    expect(graphPosition.x).toBe(calendarPosition.x);
    await expect.poll(async () => (await page.locator('.graph-floating-controls').boundingBox()).y).toBe(switchPosition.y);
    await page.locator('#sidebar-kanban').click();
    const footer = await page.locator('#status-bar').boundingBox();
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    const bar = page.locator('.kanban-gantt-bar').filter({ hasText: 'Build Gantt view' });
    await expect(bar).toBeVisible();
    await expect(page.locator('#gantt-status-content')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectContinuousTimelinePaint(page, '.kanban-gantt-scroll', '.kanban-gantt-day');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.kanban-gantt-toolbar').getByRole('button', { name: 'Today', exact: true }).click();
    const before = await bar.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 88, before.y + before.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await bar.boundingBox()).x - before.x)).toBe(88);
    const moved = await bar.boundingBox();
    await page.mouse.move(moved.x + moved.width - 4, moved.y + moved.height / 2);
    await page.mouse.down();
    await page.mouse.move(moved.x + moved.width + 40, moved.y + moved.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await bar.boundingBox()).width - moved.width)).toBe(44);
    await bar.click();
    const inspector = page.getByRole('dialog', { name: 'Edit task schedule' });
    await expect(inspector).toBeVisible();
    await inspector.getByRole('button', { name: /^Start date:/ }).click();
    await expect(page.getByRole('dialog', { name: 'Choose start date' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(inspector.getByRole('button', { name: /^Start date:/ })).toBeFocused();
    await expect(inspector.getByRole('button', { name: /^(Save|Cancel)$/ })).toHaveCount(0);
    await inspector.getByRole('button', { name: /^Start date:/ }).click();
    await page.getByRole('dialog', { name: 'Choose start date' }).getByRole('button', { name: 'Today', exact: true }).click();
    await expect(inspector.getByRole('button', { name: /^Start date:/ })).toBeFocused();
    await expect(inspector.getByRole('button', { name: /^Start date:/ })).toContainText('31');
    await page.keyboard.press('Escape');
    await expect(inspector).toHaveCount(0);
    // Outside dismissal must preserve the native click/focus target, including
    // while a body-portalled calendar is open. Inner calendar clicks above must
    // still select dates rather than being mistaken for outside clicks.
    await bar.click();
    await inspector.getByRole('button', { name: /^End date:/ }).click();
    const endPicker = page.getByRole('dialog', { name: 'Choose end date' });
    await expect(endPicker).toBeVisible();
    const today = page.locator('.kanban-gantt-toolbar').getByRole('button', { name: 'Today', exact: true });
    await today.click();
    await expect(inspector).toHaveCount(0);
    await expect(endPicker).toHaveCount(0);
    await expect(today).toBeFocused();
    await bar.click();
    const otherTask = page.locator('.kanban-gantt-name').getByRole('button', { name: /Write release notes/ });
    await otherTask.click();
    await expect(inspector.locator('strong')).toHaveText('Write release notes');
    await page.keyboard.press('Escape');
    await expect(inspector).toHaveCount(0);
    await expect(otherTask).toBeFocused();
    const name = page.locator('.kanban-gantt-row .kanban-gantt-name').first();
    const left = (await name.boundingBox()).x;
    await page.locator('.kanban-gantt-scroll').evaluate(element => { element.scrollLeft = 200; });
    expect((await name.boundingBox()).x).toBe(left);
    expect(await name.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    expect(await page.locator('#status-bar').boundingBox()).toEqual(footer);
    await expect(page.locator('.kanban-view-wrapper footer')).toHaveCount(0);
    expect(await bar.evaluate(el => getComputedStyle(el).borderRadius)).toBe('8px');
    await page.locator('.kanban-gantt-toolbar').getByRole('button', { name: 'Today', exact: true }).click();
    await page.screenshot({ path: '/tmp/figaro-gantt-implemented.png' });
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(page.locator('#gantt-status-content')).toBeHidden();
    await expect(page.locator('.kanban-card')).toHaveCount(3);
});

test('an empty Gantt keeps its explanation visible after horizontal scrolling', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(() => {
        const app = window.__figaroDebugBackend;
        app.GetKanbanBoard = async () => ({ todo: [], wip: [], done: [] });
        app.GetKanbanColumns = async () => ({
            columns: ['todo', 'wip', 'done'],
            colors: { todo: '#5588cc', wip: '#d8574a', done: '#3da674' },
        });
        app.GetTaskSchedules = async () => [];
    });
    await page.locator('#sidebar-kanban').click();
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();

    const empty = page.locator('.kanban-gantt-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('No tasks yet');
    await expect(page.locator('.kanban-gantt-help')).toBeHidden();
    await page.locator('.kanban-gantt-scroll').evaluate(element => { element.scrollLeft = 1200; });
    const geometry = await page.evaluate(() => {
        const message = document.querySelector('.kanban-gantt-empty').getBoundingClientRect();
        const gantt = document.querySelector('.kanban-gantt').getBoundingClientRect();
        return {
            messageCenter: message.left + message.width / 2,
            ganttCenter: gantt.left + gantt.width / 2,
            visible: message.right > gantt.left && message.left < gantt.right,
        };
    });
    expect(geometry.visible).toBe(true);
    expect(Math.abs(geometry.messageCenter - geometry.ganttCenter)).toBeLessThanOrEqual(2);
});
