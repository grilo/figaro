import { expect, test } from '@playwright/test';

test('opens a live rendered Markdown preview from the editor menu and closes it by keyboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true && typeof window.markdownit === 'function');
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent('# Markdown preview\n\n* one\n* two');
        const view = editor.getEditorView();
        const coords = view.coordsAtPos(0);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 4,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    });

    const menu = page.locator('.editor-context-menu');
    await expect(menu.locator('[data-action="preview-markdown"]')).toBeVisible();
    await menu.locator('[data-action="preview-markdown"]').click();

    const sidebar = page.locator('#right-sidebar');
    const panel = page.locator('#markdown-preview-panel');
    await expect(sidebar).toHaveAttribute('data-mode', 'markdown-preview');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Markdown preview' })).toBeVisible();
    await expect(panel.locator('li')).toHaveText(['one', 'two']);
    const geometry = await panel.locator('.markdown-preview-document').evaluate(element => {
        const style = getComputedStyle(element);
        return { background: getComputedStyle(element.parentElement).backgroundColor, padding: Number.parseFloat(style.paddingTop) };
    });
    expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(geometry.padding).toBeGreaterThan(12);

    const close = page.locator('#right-sidebar-close');
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeHidden();
    await expect(sidebar).not.toHaveClass(/open/);
});

test('opens Markdown Preview from a Markdown file-tree menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true && typeof window.markdownit === 'function');

    const file = page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node');
    await file.click({ button: 'right' });
    const action = page.locator('.context-menu [data-action="preview-markdown"]');
    await expect(action).toBeVisible();
    await action.click();

    const panel = page.locator('#markdown-preview-panel');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'markdown-preview');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.markdown-preview-document-title')).toHaveText('Welcome');
    await expect(panel.locator('.markdown-preview-document')).not.toBeEmpty();
});
