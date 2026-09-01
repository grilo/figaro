import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('stacks discoverable Outline, Raw, and PDF launchers and toggles both preview panes', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = '# Report\n\nBody';
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.length } });
    }, source);

    const outline = page.locator('#outline-toggle');
    const raw = page.locator('#raw-text-preview-toggle');
    const pdf = page.locator('#pdf-preview-toggle');
    await expect(outline).toBeVisible();
    await expect(raw).toBeVisible();
    await expect(pdf).toBeVisible();
    await expect(raw).toHaveAttribute('data-ui-tooltip', 'Preview raw Markdown');
    await expect(pdf).toHaveAttribute('data-ui-tooltip', 'Preview PDF');
    const geometry = await page.evaluate(() => [
        document.getElementById('outline-toggle'),
        document.getElementById('raw-text-preview-toggle'),
        document.getElementById('pdf-preview-toggle'),
    ].map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    expect(geometry.every(item => item.width === 28 && item.height === 28)).toBe(true);
    expect(Math.abs(geometry[0].left - geometry[1].left)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry[1].left - geometry[2].left)).toBeLessThanOrEqual(1);
    expect(geometry[1].top - geometry[0].bottom).toBe(4);
    expect(geometry[2].top - geometry[1].bottom).toBe(4);

    await raw.click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'raw-text-preview');
    await expect(raw).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.raw-text-preview-source')).toContainText('# Report');
    await raw.click();
    await expect(page.locator('#right-sidebar')).not.toHaveAttribute('data-mode', 'raw-text-preview');

    await pdf.click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'pdf-preview');
    await expect(pdf).toHaveAttribute('aria-expanded', 'true');
    await pdf.click();
    await expect(page.locator('#right-sidebar')).not.toHaveAttribute('data-mode', 'pdf-preview');

    // Browser-only responsive boundary: the expanded navigation pane leaves
    // too little room to dock either preview at an 800px window. Opening must
    // preserve the editor's layout width and keep a usable visible strip.
    await page.setViewportSize({ width: 800, height: 720 });
    const assertResponsivePreview = async () => {
        await expect(page.locator('#right-sidebar')).toHaveClass(/right-sidebar--responsive-overlay/);
        const layout = await page.evaluate(() => {
            const editor = document.getElementById('main-content').getBoundingClientRect();
            const preview = document.getElementById('right-sidebar').getBoundingClientRect();
            return {
                editorWidth: editor.width,
                visibleEditorWidth: preview.left - editor.left,
                previewRight: preview.right,
                launcherRight: document.querySelector('.editor-navigation-launchers')
                    .getBoundingClientRect().right,
                previewLeft: preview.left,
                viewportWidth: window.innerWidth,
                bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
            };
        });
        expect(layout.editorWidth).toBeGreaterThanOrEqual(320);
        expect(layout.visibleEditorWidth).toBeGreaterThanOrEqual(180);
        expect(layout.launcherRight).toBeLessThanOrEqual(layout.previewLeft);
        expect(layout.previewRight).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.bodyOverflow).toBeLessThanOrEqual(0);
    };

    await raw.click();
    await assertResponsivePreview();
    await raw.click();
    await pdf.click();
    await assertResponsivePreview();

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#right-sidebar')).not.toHaveClass(/right-sidebar--responsive-overlay/);
    await expect.poll(() => page.locator('#main-content').evaluate(element => (
        element.getBoundingClientRect().width
    ))).toBeGreaterThanOrEqual(320);
    await pdf.click();
});

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
    await expect(toggle).not.toHaveAttribute('title', /.+/);
    await expect(toggle).toHaveAttribute('data-ui-tooltip', 'Show document outline');
    await toggle.hover();
    const tooltip = page.locator('#ui-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Show document outline');
    const tooltipTheme = await tooltip.evaluate(surface => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--panel-bg)';
        document.body.appendChild(probe);
        const result = {
            background: getComputedStyle(surface).backgroundColor,
            panel: getComputedStyle(probe).color,
            radius: Number.parseFloat(getComputedStyle(surface).borderRadius),
        };
        probe.remove();
        return result;
    });
    expect(tooltipTheme.background).toBe(tooltipTheme.panel);
    expect(tooltipTheme.radius).toBeGreaterThanOrEqual(4);
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await page.mouse.move(0, 0);
    await toggle.focus();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
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
    await page.locator('#status-bar').hover();
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

test('keeps the left Mermaid control stack aligned when Outline narrows the writing area', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 720 });
    await openWelcomeEditor(page);
    const source = [
        '# Project',
        ...Array.from({ length: 1 }, (_, index) => (
            `Introductory line ${index + 1} ${Array.from({ length: 12 }, (_word, word) => `context${word + 1}`).join(' ')}`
        )),
        '```mermaid',
        'flowchart LR',
        '  Start --> Review --> Finish',
        '```',
        'Closing text.',
    ].join('\n');
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) await new Promise(resolve => setTimeout(resolve, 10));
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
    }, source);

    const helper = page.getByRole('button', { name: 'Open Mermaid Editor for this diagram' });
    const diagram = page.locator('.cm-live-diagram');
    await expect(helper).toBeVisible();
    await expect(diagram).toBeVisible();
    const alignment = async () => page.evaluate(() => {
        const helperRect = document.querySelector('.mermaid-editor-guide').getBoundingClientRect();
        const foldRect = document.querySelector('[aria-label="Collapse mermaid code block"]').getBoundingClientRect();
        const diagramRect = document.querySelector('.cm-live-diagram').getBoundingClientRect();
        const widgetRect = document.querySelector('.cm-block-widget--mermaid').getBoundingClientRect();
        return {
            helperTop: helperRect.top,
            diagramTop: diagramRect.top,
            foldGap: helperRect.top - foldRect.bottom,
            horizontalGap: widgetRect.left - helperRect.right,
            widgetOffset: helperRect.top - widgetRect.top,
        };
    });
    const before = await alignment();
    const beforeWidgetOffset = before.widgetOffset;
    expect(before.horizontalGap).toBeGreaterThanOrEqual(0);

    await page.locator('#outline-toggle').click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('data-mode', 'outline');
    const transitionLayout = await page.evaluate(async () => {
        const samples = [];
        for (let frame = 0; frame < 30; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const helper = document.querySelector('.mermaid-editor-guide');
            const fold = document.querySelector('[aria-label="Collapse mermaid code block"]');
            const diagram = document.querySelector('.cm-live-diagram');
            const widget = document.querySelector('.cm-block-widget--mermaid');
            if (helper && fold && diagram && widget) {
                const helperRect = helper.getBoundingClientRect();
                const foldRect = fold.getBoundingClientRect();
                const diagramRect = diagram.getBoundingClientRect();
                const widgetRect = widget.getBoundingClientRect();
                samples.push({
                    widgetOffset: helperRect.top - widgetRect.top,
                    foldGap: helperRect.top - foldRect.bottom,
                    horizontalGap: widgetRect.left - helperRect.right,
                    overlaps: helperRect.left < diagramRect.right
                        && helperRect.right > diagramRect.left
                        && helperRect.top < diagramRect.bottom
                        && helperRect.bottom > diagramRect.top,
                });
            }
        }
        return samples;
    });
    expect(transitionLayout.every(sample => Math.abs(sample.widgetOffset - beforeWidgetOffset) <= 2)).toBe(true);
    expect(transitionLayout.every(sample => !sample.overlaps)).toBe(true);
    expect(transitionLayout.every(sample => Math.abs(sample.foldGap - before.foldGap) <= 1)).toBe(true);
    const after = await alignment();
    expect(Math.abs(after.widgetOffset - beforeWidgetOffset)).toBeLessThanOrEqual(2);
    expect(after.horizontalGap).toBeGreaterThanOrEqual(0);
    expect(after.helperTop).toBeGreaterThan(after.diagramTop);

    await page.locator('#right-sidebar-close').click();
    await expect(page.locator('#right-sidebar')).toHaveAttribute('aria-hidden', 'true');
    const closingLayout = await page.evaluate(async () => {
        const samples = [];
        for (let frame = 0; frame < 30; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const helper = document.querySelector('.mermaid-editor-guide');
            const fold = document.querySelector('[aria-label="Collapse mermaid code block"]');
            const diagram = document.querySelector('.cm-live-diagram');
            const widget = document.querySelector('.cm-block-widget--mermaid');
            if (helper && fold && diagram && widget) {
                const helperRect = helper.getBoundingClientRect();
                const foldRect = fold.getBoundingClientRect();
                const diagramRect = diagram.getBoundingClientRect();
                const widgetRect = widget.getBoundingClientRect();
                samples.push({
                    widgetOffset: helperRect.top - widgetRect.top,
                    foldGap: helperRect.top - foldRect.bottom,
                    horizontalGap: widgetRect.left - helperRect.right,
                    overlaps: helperRect.left < diagramRect.right
                        && helperRect.right > diagramRect.left
                        && helperRect.top < diagramRect.bottom
                        && helperRect.bottom > diagramRect.top,
                });
            }
        }
        return samples;
    });
    expect(closingLayout.every(sample => Math.abs(sample.widgetOffset - beforeWidgetOffset) <= 2)).toBe(true);
    expect(closingLayout.every(sample => !sample.overlaps)).toBe(true);
    expect(closingLayout.every(sample => Math.abs(sample.foldGap - before.foldGap) <= 1)).toBe(true);
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
