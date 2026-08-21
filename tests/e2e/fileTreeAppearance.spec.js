import { expect, test } from '@playwright/test';

test('applies and cancels a searchable file-tree icon and color workflow', async ({ page }) => {
    await page.goto('/');
	await page.waitForFunction(() => window._appReady === true && window.lucide?.icons?.Star);

    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        const tree = [{
            name: 'Projects',
            path: 'Projects',
            type: 'directory',
            mtime: 1,
            children: [{ name: 'plan.md', path: 'Projects/plan.md', type: 'file', mtime: 1 }],
        }];
        window.__fileTreeStyleCalls = [];
        app.GetFileTree = async () => tree;
        app.GetFileTreeStyles = async () => ({ version: 1, entries: {}, recent_icons: [] });
        app.SetFileTreeStyle = async (path, icon, color) => {
            window.__fileTreeStyleCalls.push({ path, icon, color });
            return {
                version: 1,
                entries: { [path]: { icon, color } },
                recent_icons: icon ? [icon] : [],
            };
        };
        const { refreshFileTree } = await import('/js/fileTree.js');
        await refreshFileTree();
    });

    const projects = page.locator('.file-tree-item[data-path="Projects"] > .file-tree-node');
    await projects.click({ button: 'right' });
    await page.locator('.context-menu-item[data-action="customize-style"]').click();

    const dialog = page.locator('.file-tree-style-modal');
    await expect(dialog).toBeVisible();
    await dialog.locator('.file-tree-style-search').fill('star');
    await dialog.locator('.file-tree-style-search-results [data-icon="Star"]').click();
    await dialog.locator('[data-color="#3b82f6"]').click();
    await dialog.locator('.custom-modal-btn-confirm').click();

    await expect(projects).toHaveClass(/custom-icon/);
    await expect(projects).toHaveClass(/custom-color/);
    await expect(projects.locator('.node-icon svg')).toBeVisible();
    await expect.poll(() => projects.locator('.node-name').evaluate(element => getComputedStyle(element).color))
        .toBe('rgb(59, 130, 246)');
    expect(await page.evaluate(() => window.__fileTreeStyleCalls)).toEqual([
        { path: 'Projects', icon: 'Star', color: '#3b82f6' },
    ]);

    await projects.click({ button: 'right' });
    await page.locator('.context-menu-item[data-action="customize-style"]').click();
    await expect(dialog).toBeVisible();
    await dialog.locator('.custom-modal-btn-cancel').click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__fileTreeStyleCalls)).toHaveLength(1);
});

test('mounts descendants only when their folder is expanded', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        app.GetFileTree = async () => [{
            name: 'Projects', path: 'Projects', type: 'directory', children: [{
                name: 'plan.md', path: 'Projects/plan.md', type: 'file', mtime: 1,
            }],
        }];
        app.GetFileTreeStyles = async () => ({ version: 1, entries: {}, recent_icons: [] });
        const { refreshFileTree } = await import('/js/fileTree.js');
        await refreshFileTree();
    });

    const nested = page.locator('.file-tree-item[data-path="Projects/plan.md"]');
    await expect(nested).toHaveCount(0);
    await page.locator('.file-tree-item[data-path="Projects"] > .file-tree-node').click();
    await expect(nested).toBeVisible();
    await expect(nested.locator('.node-name')).toHaveText('plan.md');
});

test('enters a semantic file-tree row and traverses visible hierarchy by keyboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        app.GetFileTree = async () => [{
            name: 'Projects', path: 'Projects', type: 'directory', children: [
                { name: 'plan.md', path: 'Projects/plan.md', type: 'file', mtime: 1 },
                { name: 'spec.md', path: 'Projects/spec.md', type: 'file', mtime: 2 },
            ],
        }, { name: 'Archive.md', path: 'Archive.md', type: 'file', mtime: 3 }];
        app.GetFileTreeStyles = async () => ({ version: 1, entries: {}, recent_icons: [] });
        const state = await import('/js/state.js');
        state.setState('selectedTreePath', null);
        state.setState('expandedDirs', new Set());
        const { refreshFileTree } = await import('/js/fileTree.js');
        await refreshFileTree();
    });

    const tree = page.locator('#file-tree');
    const projects = page.locator('[data-path="Projects"] > .file-tree-node');
    const plan = page.locator('[data-path="Projects/plan.md"] > .file-tree-node');
    const spec = page.locator('[data-path="Projects/spec.md"] > .file-tree-node');
    await expect(tree).toHaveAttribute('role', 'tree');
    await expect(projects).toHaveAttribute('role', 'treeitem');
    await expect(projects).toHaveAttribute('aria-expanded', 'false');

    await page.locator('#create-inbox-note').focus();
    await page.keyboard.press('Tab');
    await expect(projects).toBeFocused();
    await expect(projects).toHaveCSS('outline-style', 'solid');

    await page.keyboard.press('ArrowRight');
    await expect(projects).toHaveAttribute('aria-expanded', 'true');
    await expect(plan).toHaveAttribute('aria-level', '2');
    await page.keyboard.press('ArrowRight');
    await expect(plan).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(spec).toBeFocused();
    await page.keyboard.press('Space');
    await expect(spec).toHaveAttribute('aria-selected', 'true');
    await expect(spec).toHaveClass(/selected/);
    await expect(spec).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('ArrowLeft');
    await expect(projects).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(projects).toHaveAttribute('aria-expanded', 'false');
    await expect(plan).toHaveCount(0);
});

test('keeps pinned entries first with a right-edge marker and lets Inbox be unpinned', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        const tree = [
            { name: 'Archive', path: 'Archive', type: 'directory', children: [] },
            { name: 'Inbox', path: 'Inbox', type: 'directory', children: [] },
            { name: 'draft.md', path: 'draft.md', type: 'file', mtime: 1 },
        ];
        let entries = {};
        app.GetFileTree = async () => tree;
        app.GetFileTreeStyles = async () => ({ version: 1, entries, recent_icons: [] });
        app.SetFileTreePinned = async (path, pinned) => {
            entries = { ...entries, [path]: { ...(entries[path] || {}), pinned } };
            return { version: 1, entries, recent_icons: [] };
        };
        const { refreshFileTree } = await import('/js/fileTree.js');
        await refreshFileTree();
    });

    const rootItems = page.locator('#file-tree > .file-tree-list > .file-tree-item');
    await expect(rootItems.first()).toHaveAttribute('data-path', 'Inbox');
    const inbox = page.locator('.file-tree-item[data-path="Inbox"] > .file-tree-node');
    const marker = inbox.locator('.node-pin-indicator');
    await expect(marker).toBeVisible();
    const geometry = await inbox.evaluate(node => {
        const name = node.querySelector('.node-name').getBoundingClientRect();
        const pin = node.querySelector('.node-pin-indicator').getBoundingClientRect();
        const row = node.getBoundingClientRect();
        return { nameRight: name.right, pinLeft: pin.left, pinRight: pin.right, rowRight: row.right };
    });
    expect(geometry.pinLeft).toBeGreaterThanOrEqual(geometry.nameRight);
    expect(geometry.rowRight - geometry.pinRight).toBeLessThan(12);

    await inbox.click({ button: 'right' });
    const pinAction = page.locator('.context-menu-item[data-action="toggle-pin"]');
    await expect(pinAction).toContainText('Unpin');
    await pinAction.click();

    await expect(inbox.locator('.node-pin-indicator')).toHaveCount(0);
    await expect(rootItems.first()).toHaveAttribute('data-path', 'Archive');
});

test('uses semantic icons, managed-file default-app opening, one selection surface, and visible Cut state', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true && window.lucide?.icons?.FileText && window.lucide?.icons?.Scissors);

    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        const tree = [
            { name: 'draft.md', path: 'draft.md', type: 'file', mtime: 1 },
            { name: 'report.pdf', path: 'report.pdf', type: 'file', mtime: 2 },
            { name: 'Archive', path: 'Archive', type: 'directory', children: [] },
        ];
        window.__fileTreeMoveCalls = [];
        window.__fileTreeOpenCalls = [];
        app.GetFileTree = async () => tree;
        app.GetFileTreeStyles = async () => ({ version: 1, entries: {}, recent_icons: [] });
        app.OpenWithDefaultApplication = async path => {
            window.__fileTreeOpenCalls.push(path);
            return { success: true };
        };
        app.MovePath = async (source, target) => {
            window.__fileTreeMoveCalls.push({ source, target });
            return { success: true, old_path: source, path: `${target}/${source}`, updated_links: [] };
        };
        const state = await import('/js/state.js');
        state.setState('selectedTreePaths', []);
        state.setState('selectedTreePath', null);
        state.setState('selectedFilePath', 'draft.md');
        state.setState('expandedDirs', new Set());
        const { refreshFileTree } = await import('/js/fileTree.js');
        await refreshFileTree();
    });

    const pdf = page.locator('[data-path="report.pdf"] > .file-tree-node');
    const draft = page.locator('[data-path="draft.md"] > .file-tree-node');
    await expect(pdf).toHaveCSS('opacity', '1');
    await expect(pdf.locator('.default-file-icon')).toBeVisible();
    await expect(pdf).not.toHaveAttribute('title', /.+/);
    await expect(pdf).toHaveAttribute('aria-describedby', /file-tree-capability-/);
    await expect(pdf).not.toHaveAttribute('aria-disabled', 'true');
    await pdf.hover();
    const capabilityTooltip = page.locator('.file-tree-capability-tooltip');
    await expect(capabilityTooltip).toBeVisible();
    await expect(capabilityTooltip).toHaveClass(/ui-tooltip/);
    await expect(capabilityTooltip).toHaveText('PDF document. Not editable in Figaro. Double-click to open with the default application.');
    const tooltipPresentation = await capabilityTooltip.evaluate(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
            background: style.backgroundColor,
            borderStyle: style.borderStyle,
            color: style.color,
            shadow: style.boxShadow,
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
            viewport: { width: innerWidth, height: innerHeight },
        };
    });
    expect(tooltipPresentation.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(tooltipPresentation.borderStyle).toBe('solid');
    expect(tooltipPresentation.color).not.toBe('rgb(0, 0, 0)');
    expect(tooltipPresentation.shadow).not.toBe('none');
    expect(tooltipPresentation.rect.left).toBeGreaterThanOrEqual(8);
    expect(tooltipPresentation.rect.top).toBeGreaterThanOrEqual(8);
    expect(tooltipPresentation.rect.right).toBeLessThanOrEqual(tooltipPresentation.viewport.width - 8);
    expect(tooltipPresentation.rect.bottom).toBeLessThanOrEqual(tooltipPresentation.viewport.height - 8);
    await pdf.click();
    await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).getState('selectedTreePaths')))
        .toEqual(['report.pdf']);
    await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).getState('selectedFilePath')))
        .toBe('draft.md');
    await expect(pdf).toHaveAttribute('aria-selected', 'true');
    await expect(draft).toHaveAttribute('aria-current', 'page');
    await expect(draft).not.toHaveClass(/selected/);

    await pdf.dblclick();
    await expect.poll(() => page.evaluate(() => window.__fileTreeOpenCalls)).toEqual(['report.pdf']);

    await pdf.click({ button: 'right' });
    await expect(page.locator('.context-menu-item[data-action="cut"]')).toBeEnabled();
    await expect(page.locator('.context-menu-item[data-action="customize-style"]')).toBeEnabled();
    const open = page.locator('.context-menu-item[data-action="open-new-tab"]');
    await expect(open).toBeEnabled();
    await expect(open.locator('.context-menu-item-label')).toHaveText('Open');
    await open.click();
    await expect.poll(() => page.evaluate(() => window.__fileTreeOpenCalls)).toEqual(['report.pdf', 'report.pdf']);

    await draft.click({ modifiers: ['Control'] });
    await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).getState('selectedTreePaths')))
        .toEqual(['report.pdf', 'draft.md']);
    const selectedSurfaces = await Promise.all([pdf, draft].map(row => row.evaluate(element => ({
        background: getComputedStyle(element).backgroundColor,
        boxShadow: getComputedStyle(element).boxShadow,
    }))));
    expect(selectedSurfaces[0]).toEqual(selectedSurfaces[1]);
    await pdf.click({ button: 'right' });
    await expect(page.locator('.context-menu-item[data-action="cut"]')).toBeEnabled();
    await expect(page.locator('.context-menu-item[data-action="rename"]')).toBeDisabled();
    await page.locator('.context-menu-item[data-action="cut"]').click();
    await expect(pdf).toHaveClass(/cut-marked/);
    await expect(draft).toHaveClass(/cut-marked/);
    await expect(pdf.locator('.node-cut-indicator')).toBeVisible();

    await page.locator('[data-path="Archive"] > .file-tree-node').click({ button: 'right' });
    await expect(page.locator('.context-menu-item[data-action="paste"]')).toBeEnabled();
    await page.locator('.context-menu-item[data-action="paste"]').click();
    await expect.poll(() => page.evaluate(() => window.__fileTreeMoveCalls)).toEqual([
        { source: 'report.pdf', target: 'Archive' },
        { source: 'draft.md', target: 'Archive' },
    ]);
    await expect(page.locator('.file-tree-node.cut-marked')).toHaveCount(0);
});
