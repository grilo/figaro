import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('shows a nested Markdown outline, follows the active section, and jumps with the keyboard', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        '# Project',
        'A brief introduction.',
        '## Decisions',
        'The record of decisions.',
        '```markdown',
        '# Not a heading',
        '```',
        '### Next steps',
        'Plan the next action.',
    ].join('\n');

    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
        view.focus();
        window.__outlineView = view;
    }, source);

    const toggle = page.locator('#outline-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();

    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'outline');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const headings = page.locator('.outline-item');
    await expect(headings).toHaveCount(3);
    await expect(headings.nth(0)).toHaveText('Project');
    await expect(headings.nth(1)).toHaveText('Decisions');
    await expect(headings.nth(2)).toHaveText('Next steps');
    await expect(headings.nth(0)).toHaveAttribute('aria-current', 'location');

    const styles = await headings.nth(2).evaluate(element => {
        const style = getComputedStyle(element);
        return {
            radius: Number.parseFloat(style.borderRadius),
            paddingStart: Number.parseFloat(style.paddingInlineStart),
            cursor: style.cursor,
        };
    });
    expect(styles.radius).toBeGreaterThanOrEqual(4);
    expect(styles.paddingStart).toBeGreaterThan(8);
    expect(styles.cursor).toBe('pointer');

    await headings.nth(2).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__outlineView.state.doc.lineAt(
        window.__outlineView.state.selection.main.head,
    ).number)).toBe(8);
    await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
    await expect(headings.nth(2)).toHaveAttribute('aria-current', 'location');

    await page.locator('.cm-content').press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__outlineView.state.doc.lineAt(
        window.__outlineView.state.selection.main.head,
    ).number)).toBe(9);

    await page.evaluate(() => {
        const view = window.__outlineView;
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
    });
    await expect(headings.nth(1)).toHaveAttribute('aria-current', 'location');

    await page.evaluate(async () => {
        const history = await import('/js/historyPanel.js');
        const app = (await import('/js/backend.js')).backend();
        app.GetCommitCount = async () => 1;
        app.GetFileHistory = async () => [{ hash: 'version-for-lookup', timestamp: 100, message: 'Saved version' }];
        await history.updateHistoryCount('Welcome.md');
    });
    await expect(page.locator('#history-count')).toHaveClass(/has-history/);
    await page.locator('#history-count').click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'history');
    await expect(page.locator('.outline-panel')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#history-count').click();
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent('An ordinary note without a heading.');
    });
    await expect(toggle).toBeHidden();
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);
});
