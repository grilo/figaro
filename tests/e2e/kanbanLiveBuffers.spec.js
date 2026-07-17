import { expect, test } from '@playwright/test';

test('renders unsaved hashtags immediately and keeps long Kanban cards compact', async ({ page }) => {
    await page.goto('/');
	await page.waitForFunction(() => window._appReady === true);

    const fullText = `Live ${'x'.repeat(140)}`;
    await page.evaluate(async ({ text }) => {
        const state = await import('/js/state.js');
        const kanban = await import('/js/kanban.js');
        const app = (await import('/js/backend.js')).backend();
        const tab = {
            id: 'live-note',
            title: 'Live note',
            type: 'file',
            path: 'live.md',
            dirty: true,
            _content: `${text} #urgent`,
        };
        state.setState('openTabs', [tab]);
        state.setState('activeTabId', tab.id);
        window.__kanbanLiveSaveCalls = [];
        app.SaveFile = async (...args) => {
            window.__kanbanLiveSaveCalls.push(args);
            return { success: true, mtime: 2 };
        };
        app.GetKanbanColumns = async () => ({ columns: ['todo', 'wip', 'done'], colors: {} });
        app.GetKanbanBoard = async () => ({ todo: [], wip: [], done: [] });

        const panels = document.getElementById('tab-panels');
        panels.classList.add('active');
        panels.classList.remove('hidden');
        panels.innerHTML = '<div id="kanban-board-main" class="tab-panel active"></div>';
        await kanban.renderKanbanBoard('kanban-board-main');
        kanban.initKanban();
    }, { text: fullText });

    const urgent = page.locator('.kanban-column[data-column="urgent"]');
    await expect(urgent).toBeVisible();
    const cardText = urgent.locator('.kanban-card-text');
    await expect(cardText).toHaveAttribute('title', fullText);
    expect(Array.from(await cardText.textContent())).toHaveLength(120);
    await expect(cardText).toContainText(/…$/);

    await page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        const tab = getState('openTabs')[0];
        tab._content = 'Brand-new unsaved card #review';
        document.dispatchEvent(new CustomEvent('file-content-changed', {
            detail: { path: tab.path, content: tab._content },
        }));
    });

    await expect(page.locator('.kanban-column[data-column="review"] .kanban-card-text'))
        .toHaveText('Brand-new unsaved card');
    await expect(page.locator('.kanban-column[data-column="urgent"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__kanbanLiveSaveCalls)).toEqual([]);
});
