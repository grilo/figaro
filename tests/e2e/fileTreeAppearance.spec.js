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
