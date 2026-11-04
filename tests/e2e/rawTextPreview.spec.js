import { expect, test } from '@playwright/test';

test('opens exact Markdown source from the editor menu and closes it by keyboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    const exactSource = [
        '---',
        'title: Visible metadata',
        '---',
        '# Raw source',
        '',
        '<script>not rendered</script>',
        '',
        ...Array.from({ length: 160 }, (_, index) => (
            `## Section ${index + 1}\n\nExact Markdown line ${index + 1} remains available for copying and parallel scrolling.`
        )),
    ].join('\n');
    await page.evaluate(async source => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(source);
        window.__rawPreviewClipboard = [];
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async text => { window.__rawPreviewClipboard.push(text); },
            },
        });
        const view = editor.getEditorView();
        const coords = view.coordsAtPos(0);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 4,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    }, exactSource);

    const menu = page.locator('.editor-context-menu');
    await expect(menu.locator('[data-action="preview-raw-text"]')).toBeVisible();
    await menu.locator('[data-action="preview-raw-text"]').click();

    const sidebar = page.locator('#right-sidebar');
    const panel = page.locator('#raw-text-preview-panel');
    const source = panel.locator('.raw-text-preview-source');
    await expect(sidebar).toHaveAttribute('data-mode', 'raw-text-preview');
    await expect(panel).toBeVisible();
    await expect(source).toHaveText(exactSource);
    await expect(source.locator('script')).toHaveCount(0);
    const geometry = await source.evaluate(element => {
        const style = getComputedStyle(element);
        return { family: style.fontFamily, padding: Number.parseFloat(style.paddingTop) };
    });
    expect(geometry.family).toBeTruthy();
    expect(geometry.padding).toBeGreaterThan(10);

    const copy = panel.getByRole('button', { name: 'Copy to Clipboard' });
    await expect(copy).toHaveClass(/ui-button--primary/);
    await copy.click();
    await expect.poll(() => page.evaluate(() => window.__rawPreviewClipboard)).toEqual([exactSource]);
    await expect(panel.locator('.raw-text-preview-status')).toContainText('Copied the complete Markdown source');

    const stage = panel.locator('.raw-text-preview-stage');
    await page.evaluate(() => {
        const editor = document.querySelector('#editor-container .cm-scroller');
        editor.scrollTop = editor.scrollHeight;
        editor.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => stage.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const followedBottom = await stage.evaluate(element => element.scrollTop);

    await page.evaluate(() => {
        const editor = document.querySelector('#editor-container .cm-scroller');
        editor.scrollTop = 0;
        editor.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => stage.evaluate(element => element.scrollTop)).toBeLessThan(followedBottom);

    const close = page.locator('#right-sidebar-close');
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeHidden();
    await expect(sidebar).not.toHaveClass(/open/);
});

test('lays the raw source out at its open width while the pane slides open', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.evaluate(async () => {
        (await import('/js/editor.js')).setEditorContent('# Long note\n\n' + 'A line of exact Markdown source.\n'.repeat(400));
    });

    // WebKitGTK spends seconds relaying out wrap-anywhere text at each
    // narrow animated width; the source must keep one width from the first frame.
    await page.evaluate(() => {
        window.__rawWidths = [];
        const sample = () => {
            const source = document.querySelector('#raw-text-preview-panel:not([hidden]) .raw-text-preview-source');
            const sidebar = document.getElementById('right-sidebar');
            if (source) window.__rawWidths.push([source.getBoundingClientRect().width, sidebar.getBoundingClientRect().width]);
            if (window.__rawWidths.length < 40) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });
    await page.getByRole('button', { name: 'Preview raw Markdown' }).click();
    await expect.poll(() => page.evaluate(() => window.__rawWidths.length)).toBe(40);
    const widths = await page.evaluate(() => window.__rawWidths);
    const sourceWidths = widths.map(([source]) => source);
    const sidebarWidths = widths.map(([, sidebar]) => sidebar);
    expect(Math.min(...sidebarWidths)).toBeLessThan(Math.max(...sidebarWidths));
    expect(Math.max(...sourceWidths) - Math.min(...sourceWidths)).toBeLessThan(0.5);
});
