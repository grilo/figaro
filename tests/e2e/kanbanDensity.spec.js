import { expect, test } from '@playwright/test';

function segmentedPaint(locator) {
    return locator.evaluate(element => {
        const track = getComputedStyle(element);
        const highlight = getComputedStyle(element, '::before');
        const selected = getComputedStyle(element.querySelector('[aria-pressed="true"]'));
        return {
            trackBackground: track.backgroundColor,
            trackBorder: track.borderTopColor,
            trackShadow: track.boxShadow,
            trackRadius: track.borderRadius,
            highlightBackground: highlight.backgroundColor,
            highlightBorder: highlight.borderTopColor,
            highlightRadius: highlight.borderRadius,
            highlightShadow: highlight.boxShadow,
            selectedBackground: selected.backgroundColor,
            selectedBorder: selected.borderTopColor,
            selectedColor: selected.color,
        };
    });
}

async function segmentedPaintDifferenceCount(choices) {
    const [reference, board, calendar] = await Promise.all(
        Object.values(choices).map(segmentedPaint),
    );
    const serializedReference = JSON.stringify(reference);
    return [board, calendar].filter(candidate => (
        JSON.stringify(candidate) !== serializedReference
    )).length;
}

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
    await expect(loading.locator('.ui-skeleton')).toHaveCount(11);
    const skeletonStyle = await loading.locator('.ui-skeleton').first().evaluate(element => {
        const style = getComputedStyle(element);
        const shimmer = getComputedStyle(element, '::after');
        return {
            borderRadius: style.borderRadius,
            borderWidth: style.borderTopWidth,
            background: style.backgroundColor,
            animationName: shimmer.animationName,
        };
    });
    expect(skeletonStyle.borderRadius).not.toBe('0px');
    expect(skeletonStyle.borderWidth).toBe('0px');
    expect(skeletonStyle.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(skeletonStyle.animationName).toBe('ui-skeleton-shimmer');

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

    const boardPresentation = await page.locator('.kanban-view-wrapper').evaluate(wrapper => {
        const read = (selector, pseudo = null) => {
            const style = getComputedStyle(wrapper.querySelector(selector), pseudo);
            return {
                borderWidth: style.borderTopWidth,
                borderColor: style.borderTopColor,
                background: style.backgroundColor,
                color: style.color,
                borderRadius: style.borderRadius,
                boxShadow: style.boxShadow,
            };
        };
        return {
            switcher: read('.kanban-view-header .ui-segmented-control'),
            selectionPill: read('.kanban-view-header .ui-segmented-control', '::before'),
            selectedSwitch: read('.kanban-view-header .ui-segmented-control [aria-pressed="true"]'),
            column: read('.kanban-column'),
            card: read('.kanban-card'),
            activeSurface: getComputedStyle(document.documentElement).getPropertyValue('--active-bg').trim(),
            accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim(),
        };
    });
    expect(boardPresentation.switcher.borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(boardPresentation.switcher.background).toBe('rgb(27, 25, 22)');
    expect(boardPresentation.switcher.borderRadius).toBe('999px');
    expect(boardPresentation.selectionPill.background).toBe('rgb(59, 41, 36)');
    expect(boardPresentation.selectionPill.borderRadius).toBe('999px');
    expect(boardPresentation.selectedSwitch.background).toBe('rgba(0, 0, 0, 0)');
    expect(boardPresentation.selectedSwitch.borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(boardPresentation.selectedSwitch.color).toBe('rgb(216, 87, 74)');
    expect(boardPresentation.activeSurface).toBe('#3b2924');
    expect(boardPresentation.accent).toBe('#d8574a');
    expect(boardPresentation.column.borderWidth).toBe('0px');
    expect(boardPresentation.column.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(boardPresentation.card.borderWidth).toBe('0px');
    expect(boardPresentation.card.background).not.toBe('rgba(0, 0, 0, 0)');

    const card = page.locator('.kanban-card').first();
    const restingShadow = await card.evaluate(element => getComputedStyle(element).boxShadow);
    await card.hover();
    await expect.poll(() => card.evaluate(element => getComputedStyle(element).boxShadow))
        .not.toBe(restingShadow);
    await card.focus();
    expect(await card.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
    const actionTrigger = card.locator('.kanban-card-menu-trigger');
    expect(await actionTrigger.evaluate(element => getComputedStyle(element).color))
        .toBe(await page.locator('html').evaluate(element => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--accent-color)';
            element.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
        }));
    await actionTrigger.click();
    const actionMenu = page.getByRole('menu', { name: /Actions for Ship density control/ });
    await expect(actionMenu.getByRole('menuitem')).toHaveText(['Clear start and due dates', 'Remove from board']);
    const [actionTriggerBox, actionMenuBox] = await Promise.all([actionTrigger.boundingBox(), actionMenu.boundingBox()]);
    expect(actionMenuBox.y).toBeGreaterThan(actionTriggerBox.y + actionTriggerBox.height);
    expect(actionMenuBox.x).toBeLessThan(actionTriggerBox.x + actionTriggerBox.width);
    expect(actionMenuBox.x + actionMenuBox.width).toBeGreaterThan(actionTriggerBox.x);
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();

    const viewChoice = page.locator('.kanban-view-header [aria-label="Kanban view"]');
    const slide = await viewChoice.evaluate(async element => {
        const highlightTransform = () => getComputedStyle(element, '::before').transform;
        const before = highlightTransform();
        const gantt = element.querySelector('[data-kanban-view="gantt"]');
        gantt.click();
        const samples = [];
        const started = performance.now();
        while (performance.now() - started < 240) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            samples.push(highlightTransform());
        }
        const after = samples.at(-1);
        const style = getComputedStyle(element, '::before');
        const matrix = new DOMMatrixReadOnly(style.transform);
        return {
            before,
            after,
            hasIntermediateFrame: samples.some(value => value !== before && value !== after),
            transitionProperty: style.transitionProperty,
            transitionDuration: style.transitionDuration,
            highlightLeft: Number.parseFloat(style.left) + matrix.m41,
            highlightWidth: Number.parseFloat(style.width),
            selectedLeft: gantt.offsetLeft,
            selectedWidth: gantt.getBoundingClientRect().width,
        };
    });
    expect(slide.after).not.toBe(slide.before);
    expect(slide.hasIntermediateFrame).toBe(true);
    expect(slide.transitionProperty).toContain('transform');
    expect(slide.transitionDuration).not.toBe('0s');
    expect(Math.abs(slide.highlightLeft - slide.selectedLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(slide.highlightWidth - slide.selectedWidth)).toBeLessThanOrEqual(1);
    await viewChoice.locator('[data-kanban-view="board"]').click();

    await page.locator('#topbar-settings').click();
    await expect(page.locator('.settings-panel-tab .ui-picker--quiet')).toHaveCount(7);
    await expect(page.locator('.settings-panel-tab .ui-stepper--quiet')).toHaveCount(3);
    await expect(page.locator('.settings-panel-tab .ui-segmented-control--quiet')).toHaveCount(2);
    const segmentedChoices = {
        settings: page.locator('.settings-panel-tab [aria-label="Kanban card density"]'),
        board: page.locator('.kanban-view-wrapper [aria-label="Kanban view"]'),
        calendar: page.locator('.calendar-presentation-choices'),
    };
    await expect.poll(() => segmentedPaintDifferenceCount(segmentedChoices)).toBe(0);
    const settingsSurfaces = await page.locator('.settings-panel-tab').evaluate(panel => ({
        cardBorder: getComputedStyle(panel.querySelector('.settings-card')).borderTopWidth,
        titleBorder: getComputedStyle(panel.querySelector('.settings-card-title')).borderBottomWidth,
    }));
    expect(settingsSurfaces).toEqual({ cardBorder: '0px', titleBorder: '0px' });
    const comboboxes = page.locator('.settings-panel-tab [role="combobox"]');
    for (let index = 0; index < await comboboxes.count(); index += 1) {
        const trigger = comboboxes.nth(index);
        if (await trigger.isDisabled()) continue;
        await trigger.click();
        const menu = page.locator(`#${await trigger.getAttribute('aria-controls')}`);
        const [triggerBox, menuBox] = await Promise.all([trigger.boundingBox(), menu.boundingBox()]);
        expect(
            await menu.evaluate(element => element.parentElement === document.body),
            `${await trigger.getAttribute('aria-label')} menu should use the shared overlay layer`,
        ).toBe(true);
        expect(menuBox.x).toBeLessThan(triggerBox.x + triggerBox.width);
        expect(menuBox.x + menuBox.width).toBeGreaterThan(triggerBox.x);
        expect(menuBox.y >= triggerBox.y + triggerBox.height || menuBox.y + menuBox.height <= triggerBox.y).toBe(true);
        expect(menuBox.x).toBeGreaterThanOrEqual(8);
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth - 8));
        await page.keyboard.press('Escape');
    }

    const theme = page.getByRole('combobox', { name: 'Theme' });
    await theme.click();
    await page.getByRole('option', { name: 'Figaro Light', exact: true }).click();
    await expect(theme).toContainText('Figaro Light');
    await expect.poll(() => page.locator('.settings-panel-tab').evaluate(panel => ({
        picker: getComputedStyle(panel.querySelector('.ui-picker-trigger')).backgroundColor,
        stepper: getComputedStyle(panel.querySelector('.ui-stepper')).backgroundColor,
        controlToken: getComputedStyle(document.documentElement).getPropertyValue('--settings-control-surface').trim(),
    }))).toEqual({
        picker: 'rgb(241, 231, 217)',
        stepper: 'rgb(241, 231, 217)',
        controlToken: '#f1e7d9',
    });
    await expect.poll(() => segmentedPaintDifferenceCount(segmentedChoices)).toBe(0);
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
