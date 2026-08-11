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

test('tabs across cards and uses arrow keys to reorder or change columns', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(() => {
        const app = window.__figaroDebugBackend;
        window.__kanbanKeyboardCalls = { order: [], moves: [] };
        window.__kanbanKeyboardBoard = {
            todo: [
                { file: 'first.md', file_name: 'first.md', line: 1, text: 'First task', tag: 'todo' },
                { file: 'second.md', file_name: 'second.md', line: 2, text: 'Second task', tag: 'todo' },
            ],
            wip: [{ file: 'third.md', file_name: 'third.md', line: 3, text: 'Third task', tag: 'wip' }],
            done: [],
        };
        app.GetKanbanColumns = async () => ({ columns: ['todo', 'wip', 'done'], colors: {} });
        app.GetKanbanBoard = async () => structuredClone(window.__kanbanKeyboardBoard);
        app.SetKanbanCardOrder = async (column, refs) => {
            window.__kanbanKeyboardCalls.order.push({ column, refs });
            const cards = window.__kanbanKeyboardBoard[column];
            window.__kanbanKeyboardBoard[column] = refs.map(ref => cards.find(card => (
                card.file === ref.file && card.line === ref.line
            ))).filter(Boolean);
            return { success: true };
        };
        app.UpdateTaskTag = async (file, line, oldTag, newTag) => {
            window.__kanbanKeyboardCalls.moves.push({ file, line, oldTag, newTag });
            const source = window.__kanbanKeyboardBoard[oldTag];
            const index = source.findIndex(card => card.file === file && card.line === line);
            const [card] = source.splice(index, 1);
            card.tag = newTag;
            window.__kanbanKeyboardBoard[newTag].push(card);
            return { success: true };
        };
    });
    await page.locator('#sidebar-kanban').click();
    const cards = page.locator('.kanban-card');
    await expect(cards).toHaveCount(3);

    await cards.nth(0).focus();
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => document.activeElement?.dataset.text)).toBe('Second task');
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => document.activeElement?.dataset.text)).toBe('Third task');

    await page.locator('.kanban-card[data-text="Second task"]').focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.locator('.kanban-column[data-column="todo"] .kanban-card')
        .evaluateAll(elements => elements.map(element => element.dataset.text)))
        .toEqual(['Second task', 'First task']);
    await expect.poll(() => page.evaluate(() => document.activeElement?.dataset.text)).toBe('Second task');

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => ({
        text: document.activeElement?.dataset.text,
        column: document.activeElement?.dataset.tag,
    }))).toEqual({ text: 'Second task', column: 'wip' });
    expect(await page.evaluate(() => window.__kanbanKeyboardCalls)).toEqual({
        order: [{
            column: 'todo',
            refs: [
                { file: 'second.md', line: 2, text: 'Second task' },
                { file: 'first.md', line: 1, text: 'First task' },
            ],
        }],
        moves: [{ file: 'second.md', line: 2, oldTag: 'todo', newTag: 'wip' }],
    });
});
