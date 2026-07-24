import { expect, test } from '@playwright/test';

test('autocompletes Markdown-link fragments from document headings by keyboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.initEditor();
        editor.setEditorContent([
            '# Point to a header',
            '# Point to a header',
            '```markdown',
            '# Do not suggest this example',
            '```',
            '',
            '[Jump](',
        ].join('\n'));
        await new Promise(resolve => setTimeout(resolve, 80));
        const view = editor.getEditorView();
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
        window.__headingCompletionView = view;
    });

    await page.keyboard.type('#point');
    const completion = page.locator('.cm-tooltip-autocomplete');
    await expect(completion).toBeVisible();
    await expect(completion.locator('li')).toHaveCount(2);
    await expect(completion).toContainText('Point to a header');
    await expect(completion).not.toContainText('Do not suggest this example');

    const completionStyle = await completion.evaluate(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, border: style.borderStyle };
    });
    expect(completionStyle.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(completionStyle.border).toBe('solid');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__headingCompletionView.state.doc.toString()))
        .toContain('[Jump](#point-to-a-header-2)');
});
