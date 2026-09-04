import { expect, test } from '@playwright/test';
import {
    expectContinuousKanbanScrollPaint,
    expectContinuousKanbanWarmOpen,
} from './support/kanbanPaint.js';

function task(index) {
    const detail = index % 2 === 0
        ? ' with enough descriptive text to wrap across several lines in the board card surface'
        : '';
    return {
        file: `Tasks/task-${index}.md`,
        file_name: `task-${index}.md`,
        line: index + 1,
        text: `Task ${index}${detail}`,
        source: `Task ${index}${detail} #todo`,
        tag: 'todo',
    };
}

async function openDenseKanban(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(cards => {
        const app = window.__figaroDebugBackend;
        app.GetKanbanColumns = async () => ({ columns: ['todo', 'wip', 'done'], colors: {} });
        app.GetKanbanBoard = async () => ({ todo: cards, wip: [], done: [] });
        app.GetTaskSchedules = async () => [];
    }, Array.from({ length: 360 }, (_, index) => task(index)));
    await page.locator('#sidebar-kanban').click();
    await expect(page.locator('.kanban-column-cards[data-column="todo"] .kanban-card')).toHaveCount(96);
}

test('keeps every intermediate Kanban scroll paint populated and spatially stable', async ({ page }) => {
    await openDenseKanban(page);
    await expectContinuousKanbanScrollPaint(
        page,
        '.kanban-column-cards[data-column="todo"]',
    );
});

test('reuses the populated Kanban surface on every frame of a warm reopen', async ({ page }) => {
    await openDenseKanban(page);
    await page.locator('#sidebar-calendar').click();
    await expect(page.locator('.calendar-workspace-view')).toBeVisible();
    await expectContinuousKanbanWarmOpen(page, () => page.locator('#sidebar-kanban').click());
});
