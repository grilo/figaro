import { expect, test } from '@playwright/test';

test('keeps title-bar divider ownership stable while the active tab connects and after the final tab closes', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const { setState } = await import('/js/state.js');
        const { openTab } = await import('/js/tabManager.js');
        setState('openTabs', []);
        setState('activeTabId', null);
        document.querySelectorAll('.tab-panel[data-tab-id]').forEach(panel => panel.remove());
        openTab('scratch.md', 'Scratch', 'file', { path: 'scratch.md', isNew: true });
    });

    await expect(page.locator('.tab[data-tab-id="scratch.md"]')).toBeVisible();
    const connectedDivider = await page.evaluate(() => {
        const topBar = document.querySelector('.top-bar');
        const rail = document.getElementById('tab-bar');
        const active = document.querySelector('#tab-strip .tab.active');
        const topBarBounds = topBar.getBoundingClientRect();
        const activeBounds = active.getBoundingClientRect();
        const activeStyle = getComputedStyle(active);
        return {
            titlebarShadow: getComputedStyle(topBar).boxShadow,
            railShadow: getComputedStyle(rail).boxShadow,
            activeBottomAligned: Math.abs(activeBounds.bottom - topBarBounds.bottom) <= 1,
            activeBackground: activeStyle.backgroundColor,
            activeStack: activeStyle.zIndex,
            activeBottomBorder: activeStyle.borderBottomWidth,
        };
    });
    expect(connectedDivider.titlebarShadow).not.toBe('none');
    expect(connectedDivider.railShadow).toBe('none');
    expect(connectedDivider.activeBottomAligned).toBe(true);
    expect(connectedDivider.activeBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(connectedDivider.activeStack).toBe('3');
    expect(connectedDivider.activeBottomBorder).toBe('0px');
    await page.locator('.tab[data-tab-id="scratch.md"] .tab-close').click();

    await expect(page.locator('#tab-strip .tab')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
        titlebarShadow: getComputedStyle(document.querySelector('.top-bar')).boxShadow,
        railShadow: getComputedStyle(document.getElementById('tab-bar')).boxShadow,
    }))).toEqual({
        titlebarShadow: connectedDivider.titlebarShadow,
        railShadow: 'none',
    });
    await expect(page.locator('.tab[data-tab-id="home"]')).toHaveCount(0);
    await expect(page.locator('.workspace-home-panel.active .home-view h1')).toHaveText('Today');

    const workspace = await page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        const panel = document.querySelector('.workspace-home-panel.active');
        const shell = panel.querySelector('.home-shell').getBoundingClientRect();
        const workspace = document.getElementById('main-content').getBoundingClientRect();
        return {
            tabs: getState('openTabs'),
            activeTabId: getState('activeTabId'),
            centered: Math.abs((shell.left + shell.right) / 2 - (workspace.left + workspace.right) / 2) < 2,
        };
    });
    expect(workspace).toEqual({ tabs: [], activeTabId: null, centered: true });
});

test('keeps the Today launchpad responsive and creates a missing daily note from its primary action', async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 680 });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(() => {
        window.__todayDirectories = [];
        window.__todayCreates = [];
        window.__figaroDebugBackend.CreateDirectory = path => {
            window.__todayDirectories.push(path);
            return Promise.resolve({ success: true, path });
        };
        window.__figaroDebugBackend.CreateFile = (path, content) => {
            window.__todayCreates.push({ path, content });
            return Promise.resolve({ success: true, path, mtime: 42 });
        };
    });

    const home = page.locator('.workspace-home-panel.active .home-view');
    await expect(home.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(home.getByRole('button', { name: 'Create today’s note' })).toBeVisible();
    await expect(home.locator('.home-card')).toHaveCount(4);

    const geometry = await home.evaluate(element => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        actionWidth: element.querySelector('.home-today-action').getBoundingClientRect().width,
        shellWidth: element.querySelector('.home-shell').getBoundingClientRect().width,
        cardLefts: [...element.querySelectorAll('.home-card')].map(card => Math.round(card.getBoundingClientRect().left)),
    }));
    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.actionWidth).toBeGreaterThan(120);
    expect(geometry.shellWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(new Set(geometry.cardLefts).size).toBe(1);

    await home.getByRole('button', { name: 'Create today’s note' }).click();
    await expect(page.locator('.tab[data-tab-id="Inbox/2026-07-09.md"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__todayDirectories)).toEqual(['Inbox']);
    await expect.poll(() => page.evaluate(() => window.__todayCreates)).toEqual([
        { path: 'Inbox/2026-07-09.md', content: '# 2026-07-09\n\n' },
    ]);
});

test('keeps the active tab inside the real overflow viewport and exposes themed edge fades only while needed', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const { setState } = await import('/js/state.js');
        const { openTab } = await import('/js/tabManager.js');
        setState('openTabs', []);
        setState('activeTabId', null);
        for (let index = 1; index <= 8; index += 1) {
            const path = `overflow-${index}.md`;
            openTab(path, `Overflow note ${index}`, 'file', { path, isNew: true });
        }
    });

    const tabGeometry = () => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        const strip = document.getElementById('tab-strip');
        const bar = document.getElementById('tab-bar');
        const active = strip.querySelector('.tab.active');
        const stripRect = strip.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const activeStyle = getComputedStyle(active);
        const inactive = strip.querySelector('.tab:not(.active)');
        const roundedActiveLeadingOffset = Math.round(activeRect.left - stripRect.left);
        return {
            activeId: getState('activeTabId'),
            activeInsideStrip: activeRect.left >= stripRect.left - 1
                && activeRect.right <= stripRect.right + 1,
            barHeight: barRect.height,
            tabHeight: activeRect.height,
            tabBottomAligned: Math.abs(activeRect.bottom - barRect.bottom) <= 1,
            tabGap: getComputedStyle(strip).gap,
            activeRadius: activeStyle.borderRadius,
            activeShadow: activeStyle.boxShadow,
            activeLeadingOffset: roundedActiveLeadingOffset === 0 ? 0 : roundedActiveLeadingOffset,
            inactiveCloseOpacity: inactive
                ? getComputedStyle(inactive.querySelector('.tab-close')).opacity
                : '',
            scrollLeft: strip.scrollLeft,
            allTabsHidden: document.getElementById('all-tabs-btn').hidden,
            startFade: getComputedStyle(bar, '::before').opacity,
            startFadeWidth: getComputedStyle(bar, '::before').width,
            endFade: getComputedStyle(bar, '::after').opacity,
        };
    });

    await expect.poll(tabGeometry).toMatchObject({
        activeId: 'overflow-8.md',
        activeInsideStrip: true,
        barHeight: 44,
        tabHeight: 38,
        tabBottomAligned: true,
        tabGap: '3px',
        activeRadius: '8px 8px 0px 0px',
        inactiveCloseOpacity: '0.62',
        allTabsHidden: false,
        startFade: '1',
        endFade: '0',
    });
    expect((await tabGeometry()).activeShadow).toBe('none');
    expect((await tabGeometry()).scrollLeft).toBeGreaterThan(0);

    // Browser focus is the risk here: each activation rerenders the tab DOM,
    // so repeated arrows must land on the newly mounted active tab.
    await page.locator('.tab[data-tab-id="overflow-8.md"]').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return {
            activeId: getState('activeTabId'),
            focusedId: document.activeElement?.dataset?.tabId || null,
            focusedRole: document.activeElement?.getAttribute?.('role') || null,
        };
    })).toEqual({ activeId: 'overflow-6.md', focusedId: 'overflow-6.md', focusedRole: 'tab' });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return {
            activeId: getState('activeTabId'),
            focusedId: document.activeElement?.dataset?.tabId || null,
        };
    })).toEqual({ activeId: 'overflow-8.md', focusedId: 'overflow-8.md' });

    // Use the browser's real wheel input so the non-passive rail handler and
    // its bounded first/last behavior are both exercised outside jsdom.
    const tabStripBox = await page.locator('#tab-strip').boundingBox();
    await page.mouse.move(tabStripBox.x + tabStripBox.width / 2, tabStripBox.y + tabStripBox.height / 2);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('overflow-8.md');
    await page.mouse.wheel(0, -100);
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('overflow-7.md');
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('overflow-8.md');

    // Ctrl+PageUp/PageDown uses the same bounded order from anywhere in the
    // application and reveals the selected buffer inside the rail.
    await page.keyboard.press('Control+PageUp');
    await expect.poll(tabGeometry).toMatchObject({
        activeId: 'overflow-7.md',
        activeInsideStrip: true,
        activeLeadingOffset: 0,
        startFade: '1',
        startFadeWidth: '18px',
    });
    await page.keyboard.press('Control+PageDown');
    await page.keyboard.press('Control+PageDown');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('overflow-8.md');

    await page.locator('#all-tabs-btn').click();
    await expect(page.locator('#all-tabs-dropdown')).toBeVisible();
    await expect(page.locator('#all-tabs-dropdown [role="menuitem"]')).toHaveCount(8);
    await page.locator('.all-tabs-item[data-tab-id="overflow-1.md"]').click();

    await expect.poll(tabGeometry).toMatchObject({
        activeId: 'overflow-1.md',
        activeInsideStrip: true,
        activeLeadingOffset: 0,
        scrollLeft: 0,
        allTabsHidden: false,
        startFade: '0',
        startFadeWidth: '18px',
        endFade: '1',
    });

    await page.keyboard.press('Control+PageUp');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('activeTabId');
    })).toBe('overflow-1.md');

    await page.evaluate(async () => {
        const { getState, setState } = await import('/js/state.js');
        const { renderTabBar } = await import('/js/tabManager.js');
        const active = getState('openTabs').find(tab => tab.id === 'overflow-1.md');
        setState('openTabs', [active]);
        setState('activeTabId', active.id);
        renderTabBar();
    });
    await expect(page.locator('#all-tabs-btn')).toBeHidden();
    await expect.poll(tabGeometry).toMatchObject({
        activeInsideStrip: true,
        activeLeadingOffset: 0,
        scrollLeft: 0,
        allTabsHidden: true,
        startFade: '0',
        endFade: '0',
    });
});

test('keeps the status bar fixed while ordinary writing recedes and bottom-edge hover restores it', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 640 });
    await page.addInitScript(() => {
        localStorage.setItem('pureEditingChromeEnabled', 'false');
    });
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    // Computed geometry and visibility at a real narrow viewport cannot be
    // established by the unit DOM environment.
    const geometry = await page.locator('#status-bar').evaluate(element => {
        const bar = element.getBoundingClientRect();
        const sidebar = document.getElementById('sidebar').getBoundingClientRect();
        const application = element.querySelector('.status-left').getBoundingClientRect();
        const buffer = element.querySelector('.status-right').getBoundingClientRect();
        const bufferLeft = element.querySelector('.status-buffer-left');
        const bufferRight = element.querySelector('.status-buffer-right');
        const bufferLeftBounds = bufferLeft.getBoundingClientRect();
        const bufferRightBounds = bufferRight.getBoundingClientRect();
        const visibleChildren = [...element.querySelectorAll(
            '.status-left > *, .status-buffer-left > *, .status-buffer-right > *',
        )]
            .filter(child => getComputedStyle(child).display !== 'none')
            .map(child => child.getBoundingClientRect());
        const identifiedChildren = group => [...group.children]
            .filter(child => child.id)
            .map(child => child.id);
        return {
            height: bar.height,
            overflowY: getComputedStyle(element).overflowY,
            childrenInside: visibleChildren.every(rect => rect.top >= bar.top - 1 && rect.bottom <= bar.bottom + 1),
            applicationAligned: Math.abs(application.right - sidebar.right) <= 1,
            bufferAligned: Math.abs(buffer.left - sidebar.right) <= 1,
            leftGroupAligned: bufferLeftBounds.left >= buffer.left
                && bufferLeftBounds.left - buffer.left <= 13,
            rightGroupAligned: Math.abs(bufferRightBounds.right - buffer.right) <= 3,
            groupsSeparated: bufferLeftBounds.right <= bufferRightBounds.left,
            applicationLabel: element.querySelector('.status-left').getAttribute('aria-label'),
            bufferLabel: element.querySelector('.status-right').getAttribute('aria-label'),
            leftGroupLabel: bufferLeft.getAttribute('aria-label'),
            rightGroupLabel: bufferRight.getAttribute('aria-label'),
            leftOrder: identifiedChildren(bufferLeft),
            rightOrder: identifiedChildren(bufferRight),
        };
    });

    expect(geometry).toEqual({
        height: 24,
        overflowY: 'hidden',
        childrenInside: true,
        applicationAligned: true,
        bufferAligned: true,
        leftGroupAligned: true,
        rightGroupAligned: true,
        groupsSeparated: true,
        applicationLabel: 'Application status',
        bufferLabel: 'Active buffer status',
        leftGroupLabel: 'History, relationships, and editor state',
        rightGroupLabel: 'Document metrics',
        leftOrder: [
            'history-count',
            'git-status-separator',
            'git-status',
            'backlinks-status',
            'file-type',
            'editor-scale-separator',
            'editor-scale-status',
            'file-encoding',
        ],
        rightOrder: ['cursor-position', 'word-count', 'char-count', 'reading-time', 'resize-grip'],
    });

    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await page.locator('#editor-container .cm-content').focus();
    await page.evaluate(async () => {
        const { statusBar } = await import('/js/statusBar.js');
        statusBar.clear();
    });
    await expect(page.locator('#status-bar')).toHaveAttribute('data-writing-rest', 'true');
    const readQuietStatus = () => page.locator('#status-bar').evaluate(element => ({
        applicationOpacity: getComputedStyle(element.querySelector('.status-left')).opacity,
        applicationTextOpacity: getComputedStyle(element.querySelector('#status-text')).opacity,
        applicationBackground: getComputedStyle(element.querySelector('.status-left')).backgroundColor,
        sidebarBackground: getComputedStyle(document.querySelector('#sidebar')).backgroundColor,
        leftOpacity: getComputedStyle(element.querySelector('.status-buffer-left')).opacity,
        rightOpacity: getComputedStyle(element.querySelector('.status-buffer-right')).opacity,
        wordText: element.querySelector('#word-count').textContent,
        quietWords: getComputedStyle(element.querySelector('.status-right'), '::after').content,
        quietOpacity: getComputedStyle(element.querySelector('.status-right'), '::after').opacity,
        height: element.getBoundingClientRect().height,
    }));
    await expect.poll(readQuietStatus)
        .toMatchObject({
            applicationOpacity: '1',
            applicationTextOpacity: '0',
            leftOpacity: '0',
            rightOpacity: '0',
            quietOpacity: '0',
            height: 24,
        });
    const quietStatus = await readQuietStatus();
    expect(quietStatus.quietWords).toBe(JSON.stringify(quietStatus.wordText));
    expect(quietStatus.applicationBackground).toBe(quietStatus.sidebarBackground);

    await page.locator('#status-bar').hover();
    await expect.poll(() => page.locator('#status-bar').evaluate(element => ({
        applicationTextOpacity: getComputedStyle(element.querySelector('#status-text')).opacity,
        fullOpacity: getComputedStyle(element.querySelector('.status-buffer-right')).opacity,
        quietOpacity: getComputedStyle(element.querySelector('.status-right'), '::after').opacity,
    }))).toEqual({ applicationTextOpacity: '1', fullOpacity: '1', quietOpacity: '0' });

    await page.evaluate(async () => {
        const { statusBar } = await import('/js/statusBar.js');
        statusBar.setWithAction('Deleted “Draft.md” ·', 'Undo', () => {});
    });
    await expect(page.locator('#status-bar')).toHaveAttribute('data-writing-rest', 'false');
    await page.locator('#toggle-sidebar').click();
    const compactStatusGeometry = () => page.locator('#status-bar').evaluate(element => {
        const application = element.querySelector('.status-left');
        const applicationBounds = application.getBoundingClientRect();
        const bufferBounds = element.querySelector('.status-right').getBoundingClientRect();
        const actionBounds = document.getElementById('status-action').getBoundingClientRect();
        const text = document.getElementById('status-text');
        return {
            width: Math.round(applicationBounds.width),
            bufferAligned: Math.abs(bufferBounds.left - applicationBounds.right) <= 1,
            actionInside: actionBounds.left >= applicationBounds.left - 1
                && actionBounds.right <= applicationBounds.right + 1,
            actionVisible: getComputedStyle(document.getElementById('status-action')).display !== 'none',
            fullLiveText: text.textContent,
            liveTextPosition: getComputedStyle(text).position,
            tooltip: application.dataset.uiTooltip || application.title,
            active: application.dataset.applicationActive,
        };
    });
    await expect.poll(compactStatusGeometry).toEqual({
        width: 44,
        bufferAligned: true,
        actionInside: true,
        actionVisible: true,
        fullLiveText: 'Deleted “Draft.md” ·',
        liveTextPosition: 'absolute',
        tooltip: 'Deleted “Draft.md” ·',
        active: 'true',
    });
});

test('reorders document tabs with a real pointer drag', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const { setState } = await import('/js/state.js');
        const { openTab } = await import('/js/tabManager.js');
        setState('openTabs', []);
        setState('activeTabId', null);
        for (let index = 1; index <= 3; index += 1) {
            const path = `drag-${index}.md`;
            openTab(path, `Drag note ${index}`, 'file', { path, isNew: true });
        }
    });

    const source = page.locator('.tab[data-tab-id="drag-1.md"]');
    const target = page.locator('.tab[data-tab-id="drag-3.md"]');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width * 0.8, targetBox.y + targetBox.height / 2, { steps: 8 });
    await expect(target).toHaveClass(/drop-after/);
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() || '')).toBe('');
    await expect.poll(() => source.evaluate(element => ({
        userSelect: getComputedStyle(element).userSelect,
        webkitUserSelect: getComputedStyle(element).webkitUserSelect,
    }))).toEqual({ userSelect: 'none', webkitUserSelect: 'none' });

    const fileTree = page.locator('#file-tree');
    const fileTreeBox = await fileTree.boundingBox();
    await page.mouse.move(fileTreeBox.x + fileTreeBox.width / 2, fileTreeBox.y + 24, { steps: 8 });
    await expect(page.locator('html')).toHaveClass(/tab-drag-selection-guard/);
    await expect.poll(() => fileTree.evaluate(element => ({
        userSelect: getComputedStyle(element).userSelect,
        webkitUserSelect: getComputedStyle(element).webkitUserSelect,
    }))).toEqual({ userSelect: 'none', webkitUserSelect: 'none' });
    expect(await fileTree.evaluate(element => {
        const event = new Event('selectstart', { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return event.defaultPrevented;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() || '')).toBe('');

    await page.mouse.move(targetBox.x + targetBox.width * 0.8, targetBox.y + targetBox.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('html')).not.toHaveClass(/tab-drag-selection-guard/);

    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/js/state.js');
        return getState('openTabs').map(tab => tab.id);
    })).toEqual(['drag-2.md', 'drag-3.md', 'drag-1.md']);
});

test('keeps differentiating filename endings and parent paths visible on long tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const { openTab } = await import('/js/tabManager.js');
        openTab(
            'Clients/Acme/Quarterly planning and forecasting — Europe.md',
            'Quarterly planning and forecasting — Europe.md',
            'file',
            { path: 'Clients/Acme/Quarterly planning and forecasting — Europe.md', isNew: true },
        );
        openTab(
            'Clients/Beacon/Quarterly planning and forecasting — Americas.md',
            'Quarterly planning and forecasting — Americas.md',
            'file',
            { path: 'Clients/Beacon/Quarterly planning and forecasting — Americas.md', isNew: true },
        );
    });

    const europe = page.locator('.tab[data-tab-id="Clients/Acme/Quarterly planning and forecasting — Europe.md"]');
    const americas = page.locator('.tab[data-tab-id="Clients/Beacon/Quarterly planning and forecasting — Americas.md"]');
    await expect(europe.locator('.tab-title-leading')).toHaveText(/Quarterly/);
    await expect(europe.locator('.tab-title-trailing')).toHaveText(/Europe\.md$/);
    await expect(europe.locator('.tab-location-path')).toHaveText('Clients/Acme');
    await expect(americas.locator('.tab-title-trailing')).toHaveText(/Americas\.md$/);
    await expect(americas.locator('.tab-location-path')).toHaveText('Clients/Beacon');
    await expect(europe).toHaveAttribute('aria-label', /Clients\/Acme\/Quarterly/);
    expect(await europe.locator('.tab-location').evaluate(element => element.getBoundingClientRect().width))
        .toBeGreaterThan(20);

    await page.setViewportSize({ width: 720, height: 600 });
    await page.evaluate(async () => {
        const { openTab } = await import('/js/tabManager.js');
        for (let index = 1; index <= 8; index += 1) {
            const path = `Workspace/Folder-${index}/A very long planning document ${index}.md`;
            openTab(path, `A very long planning document ${index}.md`, 'file', {
                path,
                isNew: true,
            });
        }
    });
    const narrowActive = page.locator('.tab.active');
    const narrowGeometry = await narrowActive.evaluate(element => ({
        titleWidth: element.querySelector('.tab-title').getBoundingClientRect().width,
        locationWidth: element.querySelector('.tab-location').getBoundingClientRect().width,
        titleText: element.querySelector('.tab-title').textContent.trim(),
        locationText: element.querySelector('.tab-location').textContent.replace(/\s+/g, ' ').trim(),
    }));
    expect(narrowGeometry.titleText).toContain('planning document 8.md');
    expect(narrowGeometry.locationText).toContain('Folder-8');
    expect(narrowGeometry.titleWidth).toBeGreaterThanOrEqual(53);
    expect(narrowGeometry.titleWidth).toBeGreaterThan(narrowGeometry.locationWidth);
});
