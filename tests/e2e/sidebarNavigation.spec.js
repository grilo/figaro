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

    await expect(page.locator('.top-bar-center #tab-bar')).toHaveClass(/ui-document-tabs--titlebar/);
    await expect(settingsButton.locator('xpath=..')).toHaveClass(/top-bar-right/);
    await expect(calendarButton).toBeVisible();
    await expect(kanbanButton).toBeVisible();

    const placement = await page.evaluate(() => {
        const sidebar = document.getElementById('sidebar').getBoundingClientRect();
        const tools = document.querySelector('.sidebar-tools').getBoundingClientRect();
        const fileTree = document.getElementById('file-tree').getBoundingClientRect();
        const applicationStatus = document.querySelector('.status-left').getBoundingClientRect();
        const bufferStatus = document.querySelector('.status-right').getBoundingClientRect();
        return {
            toolsBelowTree: tools.top >= fileTree.bottom - 1,
            toolsAtBottom: Math.abs(sidebar.bottom - tools.bottom) <= 1,
            calendarInLeftSidebar: document.getElementById('sidebar').contains(document.getElementById('sidebar-calendar-panel')),
            calendarInRightSidebar: document.getElementById('right-sidebar').contains(document.getElementById('sidebar-calendar-panel')),
            applicationStatusAligned: Math.abs(applicationStatus.right - sidebar.right) <= 1,
            bufferStatusAligned: Math.abs(bufferStatus.left - sidebar.right) <= 1,
        };
    });
    expect(placement).toEqual({
        toolsBelowTree: true,
        toolsAtBottom: true,
        calendarInLeftSidebar: true,
        calendarInRightSidebar: false,
        applicationStatusAligned: true,
        bufferStatusAligned: true,
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
    await expect.poll(() => page.evaluate(() => {
        const sidebarBounds = document.getElementById('sidebar').getBoundingClientRect();
        const leftBounds = document.querySelector('.top-bar-left').getBoundingClientRect();
        const statusBounds = document.querySelector('.status-left').getBoundingClientRect();
        return {
            aligned: Math.abs(sidebarBounds.right - leftBounds.right) <= 1,
            statusAligned: Math.abs(sidebarBounds.right - statusBounds.right) <= 1,
            statusWidth: Math.round(statusBounds.width),
            homeHidden: getComputedStyle(document.getElementById('topbar-home')).display === 'none',
        };
    })).toEqual({ aligned: true, statusAligned: true, statusWidth: 44, homeHidden: true });

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

    const titlebarGeometry = await page.evaluate(() => {
        const sidebarBounds = document.getElementById('sidebar').getBoundingClientRect();
        const topBarBounds = document.querySelector('.top-bar').getBoundingClientRect();
        const leftBounds = document.querySelector('.top-bar-left').getBoundingClientRect();
        const statusBounds = document.querySelector('.status-left').getBoundingClientRect();
        const tabBarBounds = document.getElementById('tab-bar').getBoundingClientRect();
        const activeTab = document.querySelector('#tab-strip [role="tab"][aria-selected="true"]');
        const activeBounds = activeTab.getBoundingClientRect();
        const activeStyle = getComputedStyle(activeTab);
        return {
            sidebarAligned: Math.abs(sidebarBounds.right - leftBounds.right) <= 1,
            statusAligned: Math.abs(sidebarBounds.right - statusBounds.right) <= 1,
            railMeetsWorkspace: Math.abs(sidebarBounds.top - topBarBounds.bottom) <= 1,
            tabsMeetWorkspace: Math.abs(tabBarBounds.bottom - sidebarBounds.top) <= 1,
            activeMeetsWorkspace: Math.abs(activeBounds.bottom - sidebarBounds.top) <= 1,
            roundedTop: parseFloat(activeStyle.borderTopLeftRadius) > 0
                && parseFloat(activeStyle.borderTopRightRadius) > 0,
            connectedBottom: activeStyle.borderBottomLeftRadius === '0px'
                && activeStyle.borderBottomRightRadius === '0px'
                && activeStyle.borderBottomWidth === '0px',
            titlebarDrag: getComputedStyle(document.querySelector('.top-bar'))
                .getPropertyValue('--wails-draggable').trim(),
            tabDrag: activeStyle.getPropertyValue('--wails-draggable').trim(),
        };
    });
    expect(titlebarGeometry).toEqual({
        sidebarAligned: true,
        statusAligned: true,
        railMeetsWorkspace: true,
        tabsMeetWorkspace: true,
        activeMeetsWorkspace: true,
        roundedTop: true,
        connectedBottom: true,
        titlebarDrag: 'drag',
        tabDrag: 'no-drag',
    });

    const resizeHandle = await page.locator('#sidebar-resizer').boundingBox();
    expect(resizeHandle).not.toBeNull();
    await page.mouse.move(resizeHandle.x + resizeHandle.width / 2, resizeHandle.y + 20);
    await page.mouse.down();
    await page.mouse.move(360, resizeHandle.y + 20);
    await page.mouse.up();
    await expect.poll(async () => page.evaluate(() => {
        const sidebarBounds = document.getElementById('sidebar').getBoundingClientRect();
        const leftBounds = document.querySelector('.top-bar-left').getBoundingClientRect();
        const statusBounds = document.querySelector('.status-left').getBoundingClientRect();
        return {
            width: Math.round(sidebarBounds.width),
            aligned: Math.abs(sidebarBounds.right - leftBounds.right) <= 1,
            statusAligned: Math.abs(sidebarBounds.right - statusBounds.right) <= 1,
            statusWidth: Math.round(statusBounds.width),
        };
    })).toEqual({ width: 360, aligned: true, statusAligned: true, statusWidth: 360 });

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
        const activityDays = days.filter(day => day !== 21);
        app.GetFileTree = async () => Array.from({ length: 180 }, (_, index) => ({
            name: `Note-${String(index + 1).padStart(3, '0')}.md`,
            path: `Projects/Note-${String(index + 1).padStart(3, '0')}.md`,
            type: 'file',
            mtime: index + 1,
        }));
        app.GetCalendarMonthData = async () => ({
            year: 2026,
            month: 8,
            days_with_notes: activityDays,
            days_with_links: activityDays,
            days_with_due_tasks: activityDays,
            day_summaries: days.map(day => ({
                day,
                note_count: day === 21 ? 0 : Math.min(day, 10),
                due_titles: day === 21
                    ? []
                    : day === 6
                        ? ['Production task 1', 'Production task 2']
                        : [`Production task ${day}`],
            })),
            calendar: [
                [0, 0, 0, 0, 0, 0, 1],
                [2, 3, 4, 5, 6, 7, 8],
                [9, 10, 11, 12, 13, 14, 15],
                [16, 17, 18, 19, 20, 21, 22],
                [23, 24, 25, 26, 27, 28, 29],
                [30, 31, 0, 0, 0, 0, 0],
            ],
        });
        app.GetTasksDueOnDate = async date => date === '2026-08-06' ? Array.from({ length: 18 }, (_, index) => ({
            file: `Projects/Plan-${index + 1}.md`,
            file_name: `Plan-${index + 1}.md`,
            line: index + 2,
            text: `Production task ${index + 1}`,
            due_date: '2026-08-06',
        })) : [];
        app.GetLinkedNotesForDate = async date => {
            if (date === '2026-08-06') {
                return Array.from({ length: 12 }, (_, index) => ({
                    path: `Notes/Linked-${index + 1}.md`,
                    name: `Linked-${index + 1}.md`,
                    line_num: index + 1,
                }));
            }
            if (date === '2026-08-04') {
                return [{ path: 'Notes/Linked-compact.md', name: 'Linked-compact.md', line_num: 1 }];
            }
            return [];
        };

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
        const results = document.getElementById('cal-linked-notes');
        const panelRect = panel.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        return {
            fileTreeScrolls: fileTree.scrollHeight > fileTree.clientHeight,
            calendarResultsScroll: results.scrollHeight > results.clientHeight,
            gridFullyVisible: gridRect.top >= panelRect.top && gridRect.bottom <= panelRect.bottom + 1,
        };
    })).toEqual({
        fileTreeScrolls: true,
        calendarResultsScroll: true,
        gridFullyVisible: true,
    });

    const dueDay = page.locator('#calendar-grid [data-date="2026-08-06"]');
    await dueDay.hover();
    const tooltip = page.locator('#calendar-day-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Production task 1');
    await expect(tooltip).toContainText('Production task 2');
    await expect.poll(async () => {
        const box = await tooltip.boundingBox();
        const viewport = page.viewportSize();
        return box && viewport
            ? box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height
            : false;
    }).toBe(true);

    const initialGeometry = await page.locator('#calendar-grid').evaluate(grid => ({
        top: grid.getBoundingClientRect().top,
        panelHeight: document.getElementById('sidebar-calendar-panel').getBoundingClientRect().height,
    }));
    await page.locator('#calendar-grid [data-date="2026-08-04"]').click();
    await expect(page.locator('#cal-linked-notes .cal-linked-note-item')).toHaveCount(1);
    await expect.poll(() => page.locator('#calendar-grid').evaluate((grid, initial) => {
        const current = {
            top: grid.getBoundingClientRect().top,
            panelHeight: document.getElementById('sidebar-calendar-panel').getBoundingClientRect().height,
        };
        return Math.abs(current.top - initial.top) <= 1
            && Math.abs(current.panelHeight - initial.panelHeight) <= 1;
    }, initialGeometry)).toBe(true);
});

test('keeps the common due-task and linked-note details visible above the sidebar tools', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = window.__figaroDebugBackend;
        app.GetCalendarMonthData = async () => ({
            year: 2026,
            month: 8,
            days_with_notes: [24],
            days_with_links: [24],
            days_with_due_tasks: [24],
            day_summaries: [{ day: 24, note_count: 1, due_titles: ['Polish the release guide'] }],
            calendar: [
                [0, 0, 0, 0, 0, 0, 1],
                [2, 3, 4, 5, 6, 7, 8],
                [9, 10, 11, 12, 13, 14, 15],
                [16, 17, 18, 19, 20, 21, 22],
                [23, 24, 25, 26, 27, 28, 29],
                [30, 31, 0, 0, 0, 0, 0],
            ],
        });
        app.GetTasksDueOnDate = async date => date === '2026-08-24' ? [{
            file: 'Projects/Product roadmap.md',
            file_name: 'Product roadmap.md',
            line: 14,
            text: 'Polish the release guide',
            due_date: '2026-08-24',
        }] : [];
        app.GetLinkedNotesForDate = async date => date === '2026-08-24' ? [{
            path: 'Inbox/2026-08-24.md',
            name: '2026-08-24.md',
            line_num: 1,
        }] : [];

        const { setState } = await import('/js/state.js');
        const { invalidateCalendarCache } = await import('/js/calendar.js');
        setState('currentCalDate', new Date(2026, 7, 24));
        setState('selectedCalDateStr', '2026-08-24');
        invalidateCalendarCache();
    });

    await page.locator('#sidebar-calendar').click();
    await expect(page.locator('#cal-linked-notes .cal-due-task-item')).toHaveCount(1);
    await expect(page.locator('#cal-linked-notes .cal-linked-note-item')).toHaveCount(1);
    await expect(page.locator('#cal-linked-notes h4')).toHaveText(['Due tasks', 'Linked notes']);

    await expect.poll(() => page.evaluate(() => {
        const results = document.getElementById('cal-linked-notes').getBoundingClientRect();
        const tools = document.querySelector('.sidebar-tools').getBoundingClientRect();
        const visible = [...document.querySelectorAll('#cal-linked-notes h4, #cal-linked-notes button')]
            .every(element => {
                const rect = element.getBoundingClientRect();
                return rect.top >= results.top - 1
                    && rect.bottom <= results.bottom + 1
                    && rect.bottom <= tools.top + 1;
            });
        return {
            detailsAboveTools: results.bottom <= tools.top + 1,
            commonDetailsFullyVisible: visible,
        };
    })).toEqual({
        detailsAboveTools: true,
        commonDetailsFullyVisible: true,
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
            day_summaries: [{ day: 6, note_count: 1, due_titles: [] }],
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
        setState('selectedCalDateStr', '2026-08-21');
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
