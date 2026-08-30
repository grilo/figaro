import { expect, test } from '@playwright/test';

test('keeps Calendar, Kanban, and Graph as borderless connected sidebar workspaces', async ({ page }) => {
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
    const kanbanButton = page.locator('#sidebar-kanban');
    const graphButton = page.locator('#sidebar-graph');
    const settingsButton = page.locator('#topbar-settings');

    // Exercise the palette-only theme fallback that originally exposed both
    // the one-pixel rail and the faint six-pixel resize hit area.
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--sidebar-rail-surface', 'rgb(23, 231, 117)');
        document.documentElement.style.setProperty('--sidebar-resizer-color', 'rgb(229, 31, 143)');
    });
    await expect(page.locator('#sidebar-resizer')).toHaveCSS('background-color', 'rgb(229, 31, 143)');
    expect(await sidebar.evaluate(element => getComputedStyle(element, '::after').backgroundColor))
        .toBe('rgb(23, 231, 117)');

    await expect(page.locator('.top-bar-center #tab-bar')).toHaveClass(/ui-document-tabs--titlebar/);
    await expect(settingsButton.locator('xpath=..')).toHaveClass(/top-bar-right/);
    await expect(calendarButton).toBeVisible();
    await expect(kanbanButton).toBeVisible();
    await expect(graphButton).toBeVisible();
    for (const button of [calendarButton, kanbanButton, graphButton]) {
        await expect(button).not.toHaveClass(/ui-document-tab--active/);
        await expect(button).not.toHaveAttribute('aria-current', 'page');
        expect(await button.evaluate(element => {
            element.getAnimations().forEach(animation => animation.finish());
            const style = getComputedStyle(element);
            return {
                background: style.backgroundColor,
                border: style.borderLeftColor,
                roundedLeft: parseFloat(style.borderTopLeftRadius) > 0
                    && parseFloat(style.borderBottomLeftRadius) > 0,
                openRight: style.borderTopRightRadius === '0px'
                    && style.borderBottomRightRadius === '0px'
                    && style.borderRightWidth === '0px',
            };
        })).toEqual({
            background: 'rgba(0, 0, 0, 0)',
            border: 'rgba(0, 0, 0, 0)',
            roundedLeft: true,
            openRight: true,
        });
    }

    const placement = await page.evaluate(() => {
        const sidebar = document.getElementById('sidebar').getBoundingClientRect();
        const tools = document.querySelector('.sidebar-tools').getBoundingClientRect();
        const fileTree = document.getElementById('file-tree').getBoundingClientRect();
        const applicationStatus = document.querySelector('.status-left').getBoundingClientRect();
        const bufferStatus = document.querySelector('.status-right').getBoundingClientRect();
        return {
            toolsBelowTree: tools.top >= fileTree.bottom - 1,
            toolsAtBottom: Math.abs(sidebar.bottom - tools.bottom) <= 1,
            calendarStagedInWorkspace: document.getElementById('tab-panels').contains(document.getElementById('calendar-workspace-view')),
            calendarInLeftSidebar: document.getElementById('sidebar').contains(document.getElementById('calendar-workspace-view')),
            applicationStatusAligned: Math.abs(applicationStatus.right - sidebar.right) <= 1,
            bufferStatusAligned: Math.abs(bufferStatus.left - sidebar.right) <= 1,
        };
    });
    expect(placement).toEqual({
        toolsBelowTree: true,
        toolsAtBottom: true,
        calendarStagedInWorkspace: true,
        calendarInLeftSidebar: false,
        applicationStatusAligned: true,
        bufferStatusAligned: true,
    });

    const destinations = [
        {
            button: calendarButton,
            buttonId: 'sidebar-calendar',
            tabId: 'calendar-workspace',
            type: 'calendar-workspace',
            panelId: 'calendar-workspace-panel',
            surface: '.calendar-workspace-view',
        },
        {
            button: kanbanButton,
            buttonId: 'sidebar-kanban',
            tabId: 'kanban',
            type: 'kanban',
            panelId: 'kanban-workspace-panel',
            surface: '.kanban-view-wrapper',
        },
        {
            button: graphButton,
            buttonId: 'sidebar-graph',
            tabId: 'graph',
            type: 'graph',
            panelId: 'graph-workspace-panel',
            surface: '.graph-view',
        },
    ];
    let workspaceFrame = null;

    for (const destination of destinations) {
        const buttonBounds = await destination.button.boundingBox();
        await page.mouse.move(buttonBounds.x + (buttonBounds.width / 2), buttonBounds.y + (buttonBounds.height / 2));
        await page.mouse.down();
        expect(await destination.button.evaluate(button => {
            const style = getComputedStyle(button);
            return {
                active: button.matches(':active'),
                borderColors: [
                    style.borderTopColor,
                    style.borderRightColor,
                    style.borderBottomColor,
                    style.borderLeftColor,
                ],
                outlineStyle: style.outlineStyle,
                boxShadow: style.boxShadow,
            };
        })).toEqual({
            active: true,
            borderColors: Array(4).fill('rgba(0, 0, 0, 0)'),
            outlineStyle: 'none',
            boxShadow: 'none',
        });
        await page.mouse.up();
        await expect(destination.button).toHaveClass(/ui-document-tab--active/);
        expect(await destination.button.evaluate(button => {
            const style = getComputedStyle(button);
            return {
                borderColors: [
                    style.borderTopColor,
                    style.borderRightColor,
                    style.borderBottomColor,
                    style.borderLeftColor,
                ],
                transitionProperties: style.transitionProperty.split(',').map(value => value.trim()),
            };
        })).toEqual({
            borderColors: Array(4).fill('rgba(0, 0, 0, 0)'),
            transitionProperties: ['background', 'color'],
        });
        await expect(destination.button).toHaveAttribute('aria-current', 'page');
        await expect(page.locator(destination.surface)).toBeVisible();
        await expect(page.locator(`#tab-strip [data-tab-id="${destination.tabId}"]`)).toHaveCount(0);
        await expect(page.locator('#status-bar')).toBeVisible();
        await expect(page.locator('#status-bar')).toHaveCSS('height', '24px');
        await expect(page.locator('.status-left')).toHaveCSS('visibility', 'visible');
        await expect(page.locator('.status-right')).toHaveCSS(
            'visibility',
            destination.type === 'calendar-workspace' ? 'hidden' : 'visible',
        );
        const currentWorkspaceFrame = await page.locator('.main-container').evaluate(container => {
            const bounds = container.getBoundingClientRect();
            return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
        });
        if (workspaceFrame) {
            expect(Math.abs(currentWorkspaceFrame.top - workspaceFrame.top)).toBeLessThanOrEqual(1);
            expect(Math.abs(currentWorkspaceFrame.bottom - workspaceFrame.bottom)).toBeLessThanOrEqual(1);
            expect(Math.abs(currentWorkspaceFrame.height - workspaceFrame.height)).toBeLessThanOrEqual(1);
        } else {
            workspaceFrame = currentWorkspaceFrame;
        }

        const connected = await page.evaluate(({ buttonId, surface }) => {
            const sidebar = document.getElementById('sidebar');
            const sidebarBounds = sidebar.getBoundingClientRect();
            const button = document.getElementById(buttonId);
            button.getAnimations().forEach(animation => animation.finish());
            const buttonBounds = button.getBoundingClientRect();
            const buttonStyle = getComputedStyle(button);
            const upperJunction = getComputedStyle(button, '::before');
            const lowerJunction = getComputedStyle(button, '::after');
            const surfaceStyle = getComputedStyle(document.querySelector(surface));
            const toolsStyle = getComputedStyle(document.querySelector('.sidebar-tools'));
            const railStyle = getComputedStyle(sidebar, '::after');
            const resizerStyle = getComputedStyle(document.getElementById('sidebar-resizer'));
            return {
                meetsWorkspaceEdge: Math.abs(buttonBounds.right - sidebarBounds.right) <= 1,
                roundedLeft: parseFloat(buttonStyle.borderTopLeftRadius) > 0
                    && parseFloat(buttonStyle.borderBottomLeftRadius) > 0,
                openRight: buttonStyle.borderTopRightRadius === '0px'
                    && buttonStyle.borderBottomRightRadius === '0px',
                borderless: [
                    buttonStyle.borderTopWidth,
                    buttonStyle.borderRightWidth,
                    buttonStyle.borderBottomWidth,
                    buttonStyle.borderLeftWidth,
                ].every(width => width === '0px'),
                connectedSurface: buttonStyle.backgroundColor === surfaceStyle.backgroundColor,
                bridgesRail: buttonStyle.boxShadow !== 'none',
                roundedWorkspaceJunctions: [upperJunction, lowerJunction].every(style => (
                    style.content === '""'
                    && parseFloat(style.width) === parseFloat(buttonStyle.borderTopLeftRadius)
                    && parseFloat(style.height) === parseFloat(buttonStyle.borderTopLeftRadius)
                    && style.backgroundImage.includes('radial-gradient')
                    && style.pointerEvents === 'none'
                )) && parseFloat(upperJunction.top) < 0 && parseFloat(lowerJunction.bottom) < 0,
                paintsAboveThemeRail: Number(toolsStyle.zIndex) > Number(railStyle.zIndex),
                masksIdleThemeResizer: resizerStyle.backgroundColor === 'rgba(0, 0, 0, 0)',
            };
        }, { buttonId: destination.buttonId, surface: destination.surface });
        expect(connected).toEqual({
            meetsWorkspaceEdge: true,
            roundedLeft: true,
            openRight: true,
            borderless: true,
            connectedSurface: true,
            bridgesRail: true,
            roundedWorkspaceJunctions: true,
            paintsAboveThemeRail: true,
            masksIdleThemeResizer: true,
        });

        await destination.button.click();
        await page.waitForTimeout(40);
        await expect(page.locator(`#${destination.panelId}`)).not.toHaveClass(/figaro-panel-exit/);
        await expect.poll(() => page.evaluate(async type => {
            const { getState } = await import('/js/state.js');
            return {
                activeType: getState('openTabs').find(tab => tab.id === getState('activeTabId'))?.type,
                count: getState('openTabs').filter(tab => tab.type === type).length,
            };
        }, destination.type)).toEqual({ activeType: destination.type, count: 1 });
    }

    const resizer = page.locator('#sidebar-resizer');
    await page.keyboard.press('Tab');
    await expect(resizer).toBeFocused();
    await expect(resizer).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('Shift+Tab');
    await resizer.hover();
    await expect(resizer).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.mouse.move(500, 200);
    await resizer.evaluate(element => element.classList.add('is-dragging'));
    await expect(resizer).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await resizer.evaluate(element => element.classList.remove('is-dragging'));

    await expect(page.locator('#cal-month-year')).not.toHaveText('');
    await expect(page.locator('#calendar-grid .cal-day-header')).toHaveCount(7);
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('openTabs')
            .filter(tab => ['calendar-workspace', 'kanban', 'graph'].includes(tab.type))
            .map(tab => tab.type)
            .sort();
    })).toEqual(['calendar-workspace', 'graph', 'kanban']);

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
        const selectedBounds = document.getElementById('sidebar-graph').getBoundingClientRect();
        return {
            width: Math.round(sidebarBounds.width),
            aligned: Math.abs(sidebarBounds.right - leftBounds.right) <= 1,
            statusAligned: Math.abs(sidebarBounds.right - statusBounds.right) <= 1,
            statusWidth: Math.round(statusBounds.width),
            sideTabAligned: Math.abs(sidebarBounds.right - selectedBounds.right) <= 1,
        };
    })).toEqual({ width: 360, aligned: true, statusAligned: true, statusWidth: 360, sideTabAligned: true });

    // The connected edge follows the compact rail and the restored expanded
    // width without changing the selected workspace.
    await page.locator('#toggle-sidebar').click();
    await expect(sidebar).toHaveClass(/collapsed/);
    await expect.poll(() => page.evaluate(() => {
        const sidebarBounds = document.getElementById('sidebar').getBoundingClientRect();
        const selected = document.getElementById('sidebar-graph');
        selected.getAnimations().forEach(animation => animation.finish());
        const selectedBounds = selected.getBoundingClientRect();
        const style = getComputedStyle(selected);
        return {
            width: Math.round(sidebarBounds.width),
            sideTabAligned: Math.abs(sidebarBounds.right - selectedBounds.right) <= 1,
            openRight: style.borderTopRightRadius === '0px'
                && style.borderBottomRightRadius === '0px'
                && style.borderRightWidth === '0px',
        };
    })).toEqual({ width: 44, sideTabAligned: true, openRight: true });
    await expect(graphButton).toHaveClass(/ui-document-tab--active/);

    await page.locator('#toggle-sidebar').click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await expect.poll(() => page.evaluate(() => {
        const sidebarBounds = document.getElementById('sidebar').getBoundingClientRect();
        const selectedBounds = document.getElementById('sidebar-graph').getBoundingClientRect();
        return {
            width: Math.round(sidebarBounds.width),
            sideTabAligned: Math.abs(sidebarBounds.right - selectedBounds.right) <= 1,
        };
    })).toEqual({ width: 360, sideTabAligned: true });

    await settingsButton.click();
    await expect(graphButton).not.toHaveClass(/ui-document-tab--active/);
    await expect(graphButton).not.toHaveAttribute('aria-current', 'page');
    await expect(settingsButton).toHaveClass(/active/);

    // Settings retains its existing active-click close behavior and returns to
    // the still-open sidebar Graph workspace.
    await page.locator('.tab-panel[data-tab-id="settings"]').evaluate(panel => {
        window.__figaroSettingsExitAnimations = [];
        panel.addEventListener('animationstart', event => window.__figaroSettingsExitAnimations.push(event.animationName));
    });
    await settingsButton.click();
    await expect.poll(() => page.evaluate(() => window.__figaroSettingsExitAnimations)).toContain('figaro-panel-exit');
    await expect.poll(async () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return {
            active: getState('activeTabId'),
            graph: getState('openTabs').filter(tab => tab.id === 'graph').length,
            settings: getState('openTabs').filter(tab => tab.id === 'settings').length,
        };
    })).toEqual({ active: 'graph', graph: 1, settings: 0 });
    await expect(settingsButton).not.toHaveClass(/active/);
    await expect(graphButton).toHaveClass(/ui-document-tab--active/);
    await expect(graphButton).toHaveAttribute('aria-current', 'page');
});

test('floats Graph controls, pins node tracing, and opens only on Ctrl-click', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(() => {
        const app = window.__figaroDebugBackend;
        window.__figaroGraphOpenedPaths = [];
        app.GetVaultGraph = async () => ({
            nodes: [{
                path: 'Projects/Roadmap.md',
                name: 'Roadmap',
                group: 'Projects',
                daily: false,
                incoming: 0,
                outgoing: 0,
            }],
            edges: [],
        });
        app.GetFileTreeStyles = async () => ({
            version: 1,
            entries: {
                Projects: { color: '#3b82f6' },
                'Projects/Roadmap.md': { color: '#ef4444', icon: 'Star' },
            },
            recent_icons: [],
        });
        app.ReadFile = async path => {
            window.__figaroGraphOpenedPaths.push(path);
            return { content: '# Roadmap', path, mtime: 1 };
        };
    });

    await page.locator('#sidebar-graph').click();
    await expect(page.locator('#graph-status-count')).toHaveText('1 note · 0 links');
    await expect(page.locator('.status-right')).toHaveAttribute('data-mode', 'graph');
    await expect(page.locator('#graph-status-content')).toBeVisible();
    await expect(page.locator('.graph-status-instruction'))
        .toHaveText('Hover or click to trace links, ctrl+click node to open the file');
    await expect(page.locator('.status-buffer-left')).toBeHidden();
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);
    await expect(page.locator('.graph-toolbar')).toHaveCount(0);
    await expect(page.locator('.graph-settings-toggle')).toHaveCount(0);
    await expect(page.locator('.graph-settings')).toHaveCount(0);
    await expect(page.locator('.graph-show-daily')).toHaveCount(0);
    await expect(page.locator('.graph-show-arrows')).toHaveCount(0);
    await expect(page.locator('.graph-spacing')).toHaveCount(0);
    await expect(page.locator('.graph-link-pull')).toHaveCount(0);
    const graphCanvas = page.locator('.graph-canvas');
    await expect(graphCanvas).toHaveAttribute('aria-busy', 'false');
    const graphBounds = await graphCanvas.boundingBox();
    expect(graphBounds).not.toBeNull();
    const floatingControls = await page.evaluate(() => {
        const stage = document.querySelector('.graph-stage').getBoundingClientRect();
        const controls = document.querySelector('.graph-floating-controls').getBoundingClientRect();
        const zoom = document.querySelector('.graph-canvas-controls');
        const search = document.querySelector('.graph-filter').getBoundingClientRect();
        const orphans = document.querySelector('.graph-show-orphans');
        return {
            topInset: Math.round(controls.top - stage.top),
            leftInset: Math.round(controls.left - stage.left),
            searchWidth: Math.round(search.width),
            zoomBeforeSearch: zoom.nextElementSibling?.classList.contains('graph-filter'),
            orphansAfterSearch: orphans.previousElementSibling?.classList.contains('graph-filter'),
            zoomBorder: getComputedStyle(zoom).borderTopWidth,
        };
    });
    expect(floatingControls).toEqual({
        topInset: 10,
        leftInset: 10,
        searchWidth: 224,
        zoomBeforeSearch: true,
        orphansAfterSearch: true,
        zoomBorder: '0px',
    });
    await expect(page.locator('.graph-show-orphans')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.graph-node-icon[data-path="Projects/Roadmap.md"]')).toBeVisible();
    await expect(page.locator('.graph-node-icon[data-path="Projects/Roadmap.md"]'))
        .toHaveCSS('color', 'rgb(239, 68, 68)');
    const pressedOrphansBackground = await page.locator('.graph-show-orphans')
        .evaluate(element => getComputedStyle(element).backgroundColor);
    const idleSurface = await graphCanvas.evaluate(element => getComputedStyle(element).backgroundColor);
    await graphCanvas.hover({ position: { x: graphBounds.width / 2, y: graphBounds.height / 2 } });
    await expect.poll(() => graphCanvas.evaluate(element => getComputedStyle(element).backgroundColor))
        .toBe(idleSurface);
    await page.locator('.graph-show-orphans').click();
    await expect(page.locator('.graph-show-orphans')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.locator('.graph-show-orphans')
        .evaluate(element => getComputedStyle(element).backgroundColor))
        .not.toBe(pressedOrphansBackground);
    await expect(page.locator('#graph-status-count')).toHaveText('0 notes · 0 links');
    await page.locator('.graph-show-orphans').click();
    await expect(page.locator('#graph-status-count')).toHaveText('1 note · 0 links');
    await graphCanvas.click({
        position: { x: graphBounds.width / 2, y: graphBounds.height / 2 },
    });

    await expect(page.locator('#graph-status-selection')).toHaveText('Projects/Roadmap.md');
    await expect(graphCanvas).toHaveAttribute('aria-label', /Pinned trace for Roadmap/);
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);
    expect(await page.evaluate(() => window.__figaroGraphOpenedPaths)).toEqual([]);
    await expect.poll(async () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('graph');

    await graphCanvas.click({ position: { x: 24, y: graphBounds.height - 24 } });
    await expect(page.locator('#graph-status-selection')).toHaveText('No note selected');

    await graphCanvas.click({
        position: { x: graphBounds.width / 2, y: graphBounds.height / 2 },
        modifiers: ['Control'],
    });
    await expect.poll(() => page.evaluate(() => window.__figaroGraphOpenedPaths)).toEqual([
        'Projects/Roadmap.md',
    ]);
    await expect.poll(async () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('Projects/Roadmap.md');
    await expect(page.locator('.status-right')).toHaveAttribute('data-mode', 'buffer');
});

test('centers Calendar in an equal borderless split and blanks buffer status without collapsing it', async ({ page }) => {
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
    await expect(page.locator('#status-bar')).toBeVisible();
    await expect(page.locator('#status-bar')).toHaveCSS('height', '24px');
    await expect(page.locator('.status-left')).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.status-right')).toHaveCSS('visibility', 'hidden');

    await expect.poll(() => page.evaluate(() => {
        const panel = document.getElementById('calendar-workspace-view');
        const calendarPane = panel.querySelector('.calendar-main-pane');
        const toolbar = panel.querySelector('.calendar-toolbar');
        const grid = document.getElementById('calendar-grid');
        const fileTree = document.getElementById('file-tree');
        const results = document.getElementById('cal-linked-notes');
        const panelRect = panel.getBoundingClientRect();
        const calendarPaneRect = calendarPane.getBoundingClientRect();
        const toolbarRect = toolbar.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        const resultsRect = results.getBoundingClientRect();
        const resultsStyle = getComputedStyle(results);
        const calendarCenter = (toolbarRect.top + gridRect.bottom) / 2;
        return {
            fileTreeScrolls: fileTree.scrollHeight > fileTree.clientHeight,
            calendarResultsScroll: results.scrollHeight > results.clientHeight,
            gridFullyVisible: gridRect.top >= panelRect.top && gridRect.bottom <= panelRect.bottom + 1,
            equalPaneWidths: Math.abs(calendarPaneRect.width - resultsRect.width) <= 1,
            exactHalfwayJoin: Math.abs(calendarPaneRect.right - resultsRect.left) <= 1,
            calendarCenteredHorizontally: Math.abs(
                (gridRect.left + gridRect.right) / 2
                - (calendarPaneRect.left + calendarPaneRect.right) / 2,
            ) <= 1,
            calendarCenteredVertically: Math.abs(
                calendarCenter - (calendarPaneRect.top + calendarPaneRect.bottom) / 2,
            ) <= 1,
            notesSeparatorRemoved: resultsStyle.borderLeftWidth === '0px',
        };
    })).toEqual({
        fileTreeScrolls: true,
        calendarResultsScroll: true,
        gridFullyVisible: true,
        equalPaneWidths: true,
        exactHalfwayJoin: true,
        calendarCenteredHorizontally: true,
        calendarCenteredVertically: true,
        notesSeparatorRemoved: true,
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
        panelHeight: document.getElementById('calendar-workspace-view').getBoundingClientRect().height,
    }));
    await page.locator('#calendar-grid [data-date="2026-08-04"]').click();
    await expect(page.locator('#cal-linked-notes .cal-linked-note-item')).toHaveCount(1);
    await expect.poll(() => page.locator('#calendar-grid').evaluate((grid, initial) => {
        const current = {
            top: grid.getBoundingClientRect().top,
            panelHeight: document.getElementById('calendar-workspace-view').getBoundingClientRect().height,
        };
        return Math.abs(current.top - initial.top) <= 1
            && Math.abs(current.panelHeight - initial.panelHeight) <= 1;
    }, initialGeometry)).toBe(true);
});

test('scrolls Calendar Timeline days and opens styled note pills at their first date occurrence', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = window.__figaroDebugBackend;
        window.__timelineRanges = [];
        app.GetCalendarTimelineData = async (startDate, endDate) => {
            window.__timelineRanges.push({ startDate, endDate });
            return {
                start_date: startDate,
                end_date: endDate,
                days: [{
                    date: '2026-08-29',
                    notes: [
                        { path: 'Notes/Existing.md', name: 'Existing.md', line_num: 4, mtime: 2 },
                        { path: 'Notes/Styled.md', name: 'Styled.md', line_num: 2, mtime: 1 },
                    ],
                }],
            };
        };
        app.GetFileTreeStyles = async () => ({
            version: 1,
            entries: {
                'Notes/Styled.md': { color: '#ef4444', icon: 'Star' },
            },
            recent_icons: ['Star'],
        });
        app.ReadFile = async path => ({
            path,
            mtime: 1,
            content: path === 'Notes/Existing.md'
                ? '# Existing\n\nContext\n[Launch](2026-08-29.md)\n'
                : '# Styled\n[Review](2026-08-29.md)\n',
        });

        const { setState } = await import('/js/state.js');
        const { openTab } = await import('/js/tabManager.js');
        const { invalidateCalendarCache } = await import('/js/calendar.js');
        setState('currentCalDate', new Date(2026, 7, 29));
        setState('selectedCalDateStr', '2026-08-29');
        setState('calendarPresentation', 'month');
        invalidateCalendarCache();
        openTab('Notes/Existing.md', 'Existing.md', 'file', {
            path: 'Notes/Existing.md',
            activate: false,
        });
    });

    await page.locator('#sidebar-calendar').click();
    await page.locator('[data-calendar-presentation="timeline"]').click();
    await expect(page.locator('#calendar-timeline-view')).toBeVisible();
    await expect(page.locator('[data-calendar-presentation="timeline"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.calendar-timeline-day')).toHaveCount(42);
    await expect(page.locator('#calendar-timeline-view')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.calendar-timeline-note')).toHaveCount(2);
    await expect(page.locator('#status-bar')).toBeVisible();
    await expect(page.locator('#status-bar')).toHaveCSS('height', '24px');
    await expect(page.locator('.status-right')).toHaveCSS('visibility', 'hidden');

    const timelineGeometry = await page.evaluate(() => {
        const scroll = document.querySelector('.calendar-timeline-scroll');
        const pills = [...document.querySelectorAll('[data-date="2026-08-29"] .calendar-timeline-note')]
            .map(pill => pill.getBoundingClientRect());
        const styled = document.querySelector('.calendar-timeline-note[data-path="Notes/Styled.md"]');
        const saturday = document.querySelector('.calendar-timeline-day[data-date="2026-08-29"]');
        const sunday = document.querySelector('.calendar-timeline-day[data-date="2026-08-30"]');
        const monday = document.querySelector('.calendar-timeline-day[data-date="2026-08-31"]');
        const workspace = document.getElementById('calendar-workspace-view');
        return {
            horizontalOverflow: scroll.scrollWidth > scroll.clientWidth,
            notesStackVertically: pills.length === 2 && pills[0].bottom <= pills[1].top,
            styledColor: styled.style.getPropertyValue('--calendar-timeline-note-color'),
            styledBackground: getComputedStyle(styled).backgroundColor,
            customIcon: Boolean(styled.querySelector('.calendar-timeline-note-icon-svg')),
            saturdayIsWeekend: saturday.dataset.weekend === 'true',
            sundayIsWeekend: sunday.dataset.weekend === 'true',
            mondayIsWeekend: monday.dataset.weekend === 'true',
            blendsWithWorkspace: getComputedStyle(scroll).backgroundColor === getComputedStyle(workspace).backgroundColor,
            weekdayTransparent: getComputedStyle(monday).backgroundColor === 'rgba(0, 0, 0, 0)',
            weekendTinted: !['rgba(0, 0, 0, 0)', getComputedStyle(workspace).backgroundColor]
                .includes(getComputedStyle(saturday).backgroundColor),
        };
    });
    expect(timelineGeometry).toEqual({
        horizontalOverflow: true,
        notesStackVertically: true,
        styledColor: '#ef4444',
        styledBackground: expect.not.stringMatching(/rgba\(0, 0, 0, 0\)|transparent/),
        customIcon: true,
        saturdayIsWeekend: true,
        sundayIsWeekend: true,
        mondayIsWeekend: false,
        blendsWithWorkspace: true,
        weekdayTransparent: true,
        weekendTinted: true,
    });

    const wheelStart = await page.locator('.calendar-timeline-scroll').evaluate(scroll => ({
        left: scroll.scrollLeft,
        dayWidth: scroll.querySelector('.calendar-timeline-day').getBoundingClientRect().width,
    }));
    await page.locator('.calendar-timeline-scroll').dispatchEvent('wheel', {
        deltaX: 0,
        deltaY: 4,
        deltaMode: 0,
    });
    await expect.poll(() => page.locator('.calendar-timeline-scroll').evaluate(scroll => scroll.scrollLeft))
        .toBeGreaterThanOrEqual(wheelStart.left + (wheelStart.dayWidth * 3) - 2);
    await expect(page.locator('#calendar-timeline-view')).toHaveAttribute('aria-busy', 'false');

    const panDay = page.locator('.calendar-timeline-day[data-date="2026-08-31"]');
    const panBox = await panDay.boundingBox();
    const panStart = await page.locator('.calendar-timeline-scroll').evaluate(scroll => scroll.scrollLeft);
    const panX = panBox.x + (panBox.width / 2);
    const panY = panBox.y + Math.min(300, panBox.height - 20);
    await page.mouse.move(panX, panY);
    await page.mouse.down();
    await expect(page.locator('.calendar-timeline-scroll')).toHaveClass(/is-panning/);
    expect(await page.locator('.calendar-timeline-scroll').evaluate(scroll => ({
        cursor: getComputedStyle(scroll).cursor,
        userSelect: getComputedStyle(scroll).userSelect,
    }))).toEqual({ cursor: 'grabbing', userSelect: 'none' });
    await page.mouse.move(panX - 220, panY, { steps: 4 });
    await expect.poll(() => page.locator('.calendar-timeline-scroll').evaluate(scroll => scroll.scrollLeft))
        .toBeGreaterThanOrEqual(panStart + 218);
    await page.mouse.up();
    await expect(page.locator('.calendar-timeline-scroll')).not.toHaveClass(/is-panning/);
    expect(await page.locator('.calendar-timeline-scroll').evaluate(() => window.getSelection().toString())).toBe('');

    await page.locator('.calendar-timeline-today').click();
    await expect(page.locator('#calendar-timeline-view')).toHaveAttribute('aria-busy', 'false');
    const rangeCountBeforeEdge = await page.evaluate(() => window.__timelineRanges.length);
    const rangeStartBeforeEdge = await page.locator('.calendar-timeline-day').first().getAttribute('data-date');

    const edgeBefore = await page.locator('.calendar-timeline-scroll').evaluate(scroll => {
        const dayWidth = scroll.querySelector('.calendar-timeline-day').getBoundingClientRect().width;
        scroll.scrollTo({ left: (dayWidth * 14) - 2, behavior: 'instant' });
        const marker = [...scroll.querySelectorAll('.calendar-timeline-day')].find(day => (
            day.getBoundingClientRect().right > scroll.getBoundingClientRect().left
        ));
        const viewportLeft = scroll.getBoundingClientRect().left;
        const result = {
            date: marker.dataset.date,
            viewportOffset: marker.getBoundingClientRect().left - viewportLeft,
        };
        scroll.dispatchEvent(new Event('scroll'));
        return result;
    });
    await expect.poll(() => page.evaluate(() => window.__timelineRanges.length)).toBe(rangeCountBeforeEdge + 1);
    await expect(page.locator('#calendar-timeline-view')).toHaveAttribute('aria-busy', 'false');
    const edgeAfter = await page.locator('.calendar-timeline-scroll').evaluate((scroll, markerDate) => {
        const marker = scroll.querySelector(`[data-date="${markerDate}"]`);
        return {
            firstDate: scroll.querySelector('.calendar-timeline-day').dataset.date,
            lastDate: [...scroll.querySelectorAll('.calendar-timeline-day')].at(-1).dataset.date,
            markerOffset: marker.getBoundingClientRect().left - scroll.getBoundingClientRect().left,
            scrollLeft: scroll.scrollLeft,
            ranges: window.__timelineRanges,
        };
    }, edgeBefore.date);
    expect((Date.parse(`${rangeStartBeforeEdge}T00:00:00Z`) - Date.parse(`${edgeAfter.firstDate}T00:00:00Z`)) / 86400000).toBe(7);
    expect(edgeAfter.ranges.at(-1)).toEqual({ startDate: edgeAfter.firstDate, endDate: edgeAfter.lastDate });
    expect(Math.abs(edgeAfter.markerOffset - edgeBefore.viewportOffset)).toBeLessThanOrEqual(1);
    expect(edgeAfter.scrollLeft).toBeGreaterThan(0);

    await page.locator('.calendar-timeline-note[data-path="Notes/Existing.md"]').click();
    await expect.poll(async () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        const { getEditorView } = await import('/js/editor.js');
        const editor = getEditorView();
        return {
            active: getState('activeTabId'),
            count: getState('openTabs').filter(tab => tab.id === 'Notes/Existing.md').length,
            cursorLine: editor?.state?.doc?.lineAt(editor.state.selection.main.head).number,
        };
    })).toEqual({ active: 'Notes/Existing.md', count: 1, cursorLine: 4 });
    await expect(page.locator('#status-bar')).toBeVisible();
    await expect(page.locator('.calendar-timeline-day')).toHaveCount(0);

    await page.locator('#sidebar-calendar').click();
    await expect(page.locator('#calendar-timeline-view')).toBeVisible();
    await expect(page.locator('.calendar-timeline-day')).toHaveCount(42);
    await page.locator('.calendar-timeline-note[data-path="Notes/Styled.md"]').click();
    await expect.poll(async () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        const { getEditorView } = await import('/js/editor.js');
        const editor = getEditorView();
        return {
            active: getState('activeTabId'),
            count: getState('openTabs').filter(tab => tab.id === 'Notes/Styled.md').length,
            cursorLine: editor?.state?.doc?.lineAt(editor.state.selection.main.head).number,
        };
    })).toEqual({ active: 'Notes/Styled.md', count: 1, cursorLine: 2 });
});

test('keeps the common due-task and linked-note details visible in the Calendar workspace', async ({ page }) => {
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
        const workspace = document.getElementById('calendar-workspace-view').getBoundingClientRect();
        const visible = [...document.querySelectorAll('#cal-linked-notes h4, #cal-linked-notes button')]
            .every(element => {
                const rect = element.getBoundingClientRect();
                return rect.top >= results.top - 1
                    && rect.bottom <= results.bottom + 1;
            });
        return {
            detailsWithinWorkspace: results.top >= workspace.top - 1
                && results.bottom <= workspace.bottom + 1,
            commonDetailsFullyVisible: visible,
        };
    })).toEqual({
        detailsWithinWorkspace: true,
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
