import { expect, test } from '@playwright/test';

test('keeps workspace destinations in the sidebar and expands Calendar inline', async ({ page }) => {
    await page.goto('/');
	await page.waitForFunction(() => window._appReady === true);
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

test('keeps the Calendar grid visible when a large vault competes for sidebar height', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = window.__figaroDebugBackend;
        const days = Array.from({ length: 31 }, (_, index) => index + 1);
        app.GetFileTree = async () => Array.from({ length: 180 }, (_, index) => ({
            name: `Note-${String(index + 1).padStart(3, '0')}.md`,
            path: `Projects/Note-${String(index + 1).padStart(3, '0')}.md`,
            type: 'file',
            mtime: index + 1,
        }));
        app.GetCalendarMonthData = async () => ({
            year: 2026,
            month: 8,
            days_with_notes: days,
            days_with_links: days,
            days_with_due_tasks: days,
            calendar: [
                [0, 0, 0, 0, 0, 0, 1],
                [2, 3, 4, 5, 6, 7, 8],
                [9, 10, 11, 12, 13, 14, 15],
                [16, 17, 18, 19, 20, 21, 22],
                [23, 24, 25, 26, 27, 28, 29],
                [30, 31, 0, 0, 0, 0, 0],
            ],
        });
        app.GetTasksDueOnDate = async () => Array.from({ length: 18 }, (_, index) => ({
            file: `Projects/Plan-${index + 1}.md`,
            file_name: `Plan-${index + 1}.md`,
            line: index + 2,
            text: `Production task ${index + 1}`,
            due_date: '2026-08-06',
        }));
        app.GetLinkedNotesForDate = async () => Array.from({ length: 12 }, (_, index) => ({
            path: `Notes/Linked-${index + 1}.md`,
            name: `Linked-${index + 1}.md`,
            line_num: index + 1,
        }));

        const { setState } = await import('/js/state.js');
        const { invalidateCalendarCache } = await import('/js/calendar.js');
        const { refreshFileTree } = await import('/js/fileTree.js');
        setState('currentCalDate', new Date(2026, 7, 6));
        setState('selectedCalDateStr', '2026-08-06');
        invalidateCalendarCache();
        await refreshFileTree();
    });

    await page.locator('#sidebar-calendar').click();
    await expect(page.locator('#calendar-grid .cal-day-header')).toHaveCount(7);
    await expect(page.locator('#cal-linked-notes .cal-due-task-item')).toHaveCount(18);
    await expect(page.locator('#cal-linked-notes .cal-linked-note-item')).toHaveCount(12);

    await expect.poll(() => page.evaluate(() => {
        const panel = document.getElementById('sidebar-calendar-panel');
        const grid = document.getElementById('calendar-grid');
        const fileTree = document.getElementById('file-tree');
        const panelRect = panel.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        return {
            fileTreeScrolls: fileTree.scrollHeight > fileTree.clientHeight,
            calendarResultsScroll: panel.scrollHeight > panel.clientHeight,
            gridFullyVisible: gridRect.top >= panelRect.top && gridRect.bottom <= panelRect.bottom + 1,
        };
    })).toEqual({
        fileTreeScrolls: true,
        calendarResultsScroll: true,
        gridFullyVisible: true,
    });
});

test('uses compact calendar typography for an empty selected date', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = window.__figaroDebugBackend;
        app.GetCalendarMonthData = async () => ({
            year: 2026,
            month: 8,
            days_with_notes: [6],
            days_with_links: [],
            days_with_due_tasks: [],
            calendar: [
                [0, 0, 0, 0, 0, 0, 1],
                [2, 3, 4, 5, 6, 7, 8],
                [9, 10, 11, 12, 13, 14, 15],
                [16, 17, 18, 19, 20, 21, 22],
                [23, 24, 25, 26, 27, 28, 29],
                [30, 31, 0, 0, 0, 0, 0],
            ],
        });
        app.GetTasksDueOnDate = async () => [];
        app.GetLinkedNotesForDate = async () => [];

        const { setState } = await import('/js/state.js');
        const { invalidateCalendarCache } = await import('/js/calendar.js');
        setState('currentCalDate', new Date(2026, 7, 6));
        setState('selectedCalDateStr', '2026-08-06');
        invalidateCalendarCache();
    });

    await page.locator('#sidebar-calendar').click();
    const guidance = page.locator('#cal-linked-notes .cal-no-notes');
    await expect(guidance).toHaveText('No tasks or notes for this date');
    await expect.poll(() => guidance.evaluate(element => {
        const style = getComputedStyle(element);
        const dayStyle = getComputedStyle(document.querySelector('.cal-day'));
        const colorProbe = document.createElement('span');
        colorProbe.style.color = 'color-mix(in srgb, var(--text-muted) 75%, var(--text-color))';
        document.body.append(colorProbe);
        const mutedColor = getComputedStyle(colorProbe).color;
        colorProbe.remove();
        return {
            fontFamilyMatchesCalendar: style.fontFamily === dayStyle.fontFamily,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            usesMutedColor: style.color === mutedColor,
            paddingTop: style.paddingTop,
        };
    })).toEqual({
        fontFamilyMatchesCalendar: true,
        fontSize: '12px',
        lineHeight: '18px',
        usesMutedColor: true,
        paddingTop: '8px',
    });
});
