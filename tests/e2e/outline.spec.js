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
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('inert', '');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.evaluate(async () => {
        const outline = await import('/js/outline.js');
        outline.setDocumentOutlineEnabled(false);
    });
    await expect(toggle).toBeHidden();
    await page.evaluate(async () => {
        const outline = await import('/js/outline.js');
        outline.setDocumentOutlineEnabled(true);
    });
    await expect(toggle).toBeVisible();
    const launcherGeometry = await toggle.evaluate(element => {
        const button = element.getBoundingClientRect();
        const editor = document.getElementById('editor-container').getBoundingClientRect();
        return { right: editor.right - button.right, top: button.top - editor.top };
    });
    expect(launcherGeometry.right).toBeLessThanOrEqual(12);
    expect(launcherGeometry.top).toBeLessThanOrEqual(12);
    await toggle.click();

    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'outline');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#right-sidebar')).not.toHaveAttribute('inert', '');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toBeHidden();
    await expect(page.locator('#right-sidebar-title')).toHaveText('Document outline');
    const headings = page.locator('.outline-item');
    await expect(headings).toHaveCount(3);
    await expect(headings.nth(0).locator('.outline-item-type')).toHaveText('h1');
    await expect(headings.nth(0).locator('.outline-item-text')).toHaveText('Project');
    await expect(headings.nth(1).locator('.outline-item-text')).toHaveText('Decisions');
    await expect(headings.nth(2).locator('.outline-item-text')).toHaveText('Next steps');
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
    await expect(toggle).toBeVisible();
    await page.locator('#history-count').click();
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#right-sidebar')).toHaveAttribute('inert', '');

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent('An ordinary note without a heading.');
    });
    await expect(toggle).toBeHidden();
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/open/);
});

test('sticks the complete active heading hierarchy and keeps every row navigable', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        '# Project',
        ...Array.from({ length: 35 }, (_, index) => `Project line ${index + 1}`),
        '## Decisions',
        ...Array.from({ length: 35 }, (_, index) => `Decision line ${index + 1}`),
        '### Next steps',
        ...Array.from({ length: 100 }, (_, index) => `Step line ${index + 1}`),
    ].join('\n');

    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = window.__stickyOutlineView = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) await new Promise(resolve => setTimeout(resolve, 10));
        view.scrollDOM.scrollTop = 0;
        view.scrollDOM.dispatchEvent(new Event('scroll'));
        view.focus();
    }, source);

    const sticky = page.locator('#sticky-heading-stack');
    const rows = sticky.locator('.sticky-heading-item');
    await expect(sticky).toBeHidden();

    const crossStickyBoundary = async (line, offset) => {
        await page.evaluate(({ targetLine, targetOffset }) => {
            const view = window.__stickyOutlineView;
            const stickyElement = document.getElementById('sticky-heading-stack');
            const block = view.lineBlockAt(view.state.doc.line(targetLine).from);
            const editorTop = view.scrollDOM.getBoundingClientRect().top;
            const stackHeight = stickyElement.hidden ? 0 : stickyElement.getBoundingClientRect().height;
            const headingTop = view.documentTop + block.top;
            view.scrollDOM.scrollTop += headingTop - (editorTop + stackHeight) + targetOffset;
            view.scrollDOM.dispatchEvent(new Event('scroll'));
        }, { targetLine: line, targetOffset: offset });
    };

    // Each heading enters as its own source row passes beneath the current
    // sticky stack. The first transition happens while CodeMirror's virtual
    // viewport still begins at zero, proving timing does not depend on its
    // intentionally batched virtualization boundary.
    await crossStickyBoundary(1, -6);
    await expect(sticky).toBeHidden();
    await crossStickyBoundary(1, 2);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project']);
    expect(await page.evaluate(() => window.__stickyOutlineView.viewport.from)).toBe(0);

    await crossStickyBoundary(37, -6);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project']);
    await crossStickyBoundary(37, 2);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project', 'Decisions']);

    await crossStickyBoundary(73, -6);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project', 'Decisions']);
    await crossStickyBoundary(73, 2);
    await expect(sticky).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(rows.locator('.sticky-heading-item-type')).toHaveText(['h1', 'h2', 'h3']);
    await expect(rows.locator('.sticky-heading-item-text')).toHaveText(['Project', 'Decisions', 'Next steps']);
    const launcher = page.locator('#outline-toggle');
    await expect(launcher).toBeVisible();
    const stickyGeometry = await sticky.evaluate(element => {
        const stickyRect = element.getBoundingClientRect();
        const editorRect = document.getElementById('editor-container').getBoundingClientRect();
        const rowRect = element.firstElementChild.getBoundingClientRect();
        const style = getComputedStyle(element);
        const rowStyle = getComputedStyle(element.firstElementChild);
        const editorStyle = getComputedStyle(document.querySelector('.cm-content'));
        return {
            left: stickyRect.left - editorRect.left,
            right: editorRect.right - stickyRect.right,
            rowLeft: rowRect.left - stickyRect.left,
            rowRight: stickyRect.right - rowRect.right,
            radius: Number.parseFloat(style.borderRadius),
            shadow: style.boxShadow,
            rowFontSize: Number.parseFloat(rowStyle.fontSize),
            editorFontSize: Number.parseFloat(editorStyle.fontSize),
        };
    });
    expect(Math.abs(stickyGeometry.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(stickyGeometry.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(stickyGeometry.rowLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(stickyGeometry.rowRight)).toBeLessThanOrEqual(1);
    expect(stickyGeometry.radius).toBe(0);
    expect(stickyGeometry.shadow).toBe('none');
    expect(Math.abs(stickyGeometry.rowFontSize - stickyGeometry.editorFontSize)).toBeLessThanOrEqual(0.1);
    const navigationGeometry = await page.evaluate(() => {
        const stickyRect = document.getElementById('sticky-heading-stack').getBoundingClientRect();
        const launcherRect = document.getElementById('outline-toggle').getBoundingClientRect();
        return { stickyBottom: stickyRect.bottom, launcherTop: launcherRect.top };
    });
    expect(navigationGeometry.launcherTop).toBeGreaterThanOrEqual(navigationGeometry.stickyBottom + 7);

    await page.evaluate(async () => {
        const outline = await import('/js/outline.js');
        outline.setStickyHeadingsEnabled(false);
    });
    await expect(sticky).toBeHidden();
    await page.evaluate(async () => {
        const outline = await import('/js/outline.js');
        outline.setStickyHeadingsEnabled(true);
    });
    await expect(rows).toHaveCount(3);

    await rows.nth(1).click();
    await expect.poll(() => page.evaluate(() => window.__stickyOutlineView.state.doc.lineAt(
        window.__stickyOutlineView.state.selection.main.head,
    ).text)).toBe('## Decisions');
    await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__stickyOutlineView.state.doc.lineAt(
        window.__stickyOutlineView.state.selection.main.head,
    ).text)).toBe('Decision line 1');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__stickyOutlineView.state.doc.lineAt(
        window.__stickyOutlineView.state.selection.main.head,
    ).text)).toBe('## Decisions');
});
