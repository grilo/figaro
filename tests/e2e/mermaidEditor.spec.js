import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('edits a Mermaid block with templates, live diagnostics, and last-known-good preview', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        'Before',
        '```mermaid',
        'flowchart TD',
        '  A --> B',
        '```',
        'After',
    ].join('\n');
    const plainScrollerWidth = await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent('Before\nAfter');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== 'Before\nAfter') {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        const width = view.scrollDOM.clientWidth;
        editor.setEditorContent(markdown);
        while (view.state.doc.toString() !== markdown) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
        window.__mermaidEditorMainView = view;
        return width;
    }, source);

    await expect(page.locator('.cm-live-diagram')).toHaveCount(1);
    const helper = page.getByRole('button', { name: 'Open Mermaid Editor for this diagram' });
    await expect(helper).toBeVisible();
    await expect(helper).toHaveText('editor');
    await expect(helper.locator('xpath=ancestor::div[contains(@class,"cm-markdownBlockGutter")]'))
        .toHaveAttribute('aria-label', 'Markdown block controls');
    await expect(page.locator('#editor-container .cm-gutters-after')).toHaveCount(0);
    expect(await page.evaluate(() => window.__mermaidEditorMainView.scrollDOM.clientWidth))
        .toBe(plainScrollerWidth);
    const gutterBorders = await page.evaluate(() => Array.from(
        document.querySelectorAll('#editor-container .cm-gutters'),
        gutter => {
            const style = getComputedStyle(gutter);
            return {
                left: style.borderLeftWidth,
                right: style.borderRightWidth,
                gutterClass: gutter.className,
                editorClass: gutter.closest('.cm-editor')?.className || '',
            };
        },
    ));
    expect(gutterBorders.length).toBeGreaterThan(0);
    expect(gutterBorders.every(border => border.left === '0px' && border.right === '0px')).toBe(true);
    const gutterAlignment = await page.evaluate(() => {
        const helper = document.querySelector('.mermaid-editor-guide');
        const blockGuide = document.querySelector(
            '.cm-markdownBlockGutter [aria-label="Collapse mermaid code block"]',
        );
        const helperRect = helper.getBoundingClientRect();
        const blockGuideRect = blockGuide.getBoundingClientRect();
        const helperStyle = getComputedStyle(helper);
        const blockGuideStyle = getComputedStyle(blockGuide);
        const labelRange = document.createRange();
        labelRange.selectNodeContents(helper);
        const labelRect = labelRange.getBoundingClientRect();
        const diagramRect = document.querySelector('.cm-live-diagram').getBoundingClientRect();
        const widgetRect = document.querySelector('.cm-block-widget--mermaid').getBoundingClientRect();
        const stack = document.querySelector('.cm-editor-block-guide-stack');
        return {
            helperLeft: helperRect.left,
            helperRight: helperRect.right,
            helperTop: helperRect.top,
            helperHeight: helperRect.height,
            blockGuideTop: blockGuideRect.top,
            blockGuideBottom: blockGuideRect.bottom,
            blockGuideRight: blockGuideRect.right,
            blockGuideHeight: blockGuideRect.height,
            widgetLeft: widgetRect.left,
            diagramRight: diagramRect.right,
            widgetRight: widgetRect.right,
            stackDisplay: getComputedStyle(stack).display,
            justifyItems: helperStyle.justifyItems,
            textAlign: helperStyle.textAlign,
            inwardGap: helperRect.right - labelRect.right,
            helperTypography: {
                fontFamily: helperStyle.fontFamily,
                fontSize: helperStyle.fontSize,
                fontWeight: helperStyle.fontWeight,
                lineHeight: helperStyle.lineHeight,
                textTransform: helperStyle.textTransform,
            },
            blockGuideTypography: {
                fontFamily: blockGuideStyle.fontFamily,
                fontSize: blockGuideStyle.fontSize,
                fontWeight: blockGuideStyle.fontWeight,
                lineHeight: blockGuideStyle.lineHeight,
                textTransform: blockGuideStyle.textTransform,
            },
        };
    });
    expect(gutterAlignment.helperRight).toBeLessThanOrEqual(gutterAlignment.widgetLeft);
    expect(gutterAlignment.widgetLeft - gutterAlignment.helperRight).toBeLessThanOrEqual(10);
    expect(Math.abs(gutterAlignment.helperRight - gutterAlignment.blockGuideRight)).toBeLessThan(1);
    expect(Math.abs(gutterAlignment.helperTop - gutterAlignment.blockGuideBottom)).toBeLessThan(1);
    expect(gutterAlignment.helperHeight).toBe(gutterAlignment.blockGuideHeight);
    expect(gutterAlignment.helperTypography).toEqual(gutterAlignment.blockGuideTypography);
    expect(gutterAlignment.helperTypography.textTransform).toBe('lowercase');
    expect(gutterAlignment.stackDisplay).toBe('grid');
    expect(gutterAlignment.justifyItems).toBe('end');
    expect(gutterAlignment.textAlign).toBe('right');
    expect(gutterAlignment.inwardGap).toBeLessThanOrEqual(7);

    const collapseDiagram = page.getByRole('button', { name: 'Collapse mermaid code block' });
    await expect(collapseDiagram).toBeVisible();
    await collapseDiagram.click();
    await expect(page.locator('.cm-live-diagram')).toHaveCount(0);
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Expand mermaid code block' })).toBeVisible();
    await expect(helper).toHaveCount(0);
    expect(await page.evaluate(() => window.__mermaidEditorMainView.state.doc.toString())).toBe(source);

    await page.evaluate(() => {
        const view = window.__mermaidEditorMainView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__mermaidEditorMainView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(6);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => {
        const view = window.__mermaidEditorMainView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(2);

    const foldedPoints = await page.evaluate(() => {
        const view = window.__mermaidEditorMainView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 2, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            before: point(view.state.doc.line(1).from),
            after: point(view.state.doc.line(6).to),
        };
    });
    await page.mouse.click(foldedPoints.after.x, foldedPoints.after.y);
    await expect.poll(() => page.evaluate(() => {
        const view = window.__mermaidEditorMainView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(6);
    await page.mouse.move(foldedPoints.before.x, foldedPoints.before.y);
    await page.mouse.down();
    await page.mouse.move(foldedPoints.after.x, foldedPoints.after.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => {
        const view = window.__mermaidEditorMainView;
        return {
            from: view.state.doc.lineAt(view.state.selection.main.from).number,
            to: view.state.doc.lineAt(view.state.selection.main.to).number,
        };
    })).toEqual({ from: 1, to: 6 });
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);

    await page.evaluate(() => {
        const view = window.__mermaidEditorMainView;
        view.dispatch({ selection: { anchor: view.state.doc.line(1).from } });
    });
    await page.getByRole('button', { name: 'Expand mermaid code block' }).click();
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
    await expect(page.locator('.cm-live-diagram')).toHaveCount(1);
    await expect(helper).toBeVisible();
    await helper.click();

    const modal = page.getByRole('dialog', { name: 'Mermaid Editor' });
    await expect(modal).toBeVisible();
    await expect(modal.locator('.mermaid-editor-diagram-select option')).toHaveCount(32);
    await expect(modal.locator('.mermaid-editor-template-select option')).toHaveCount(4);
    await expect(modal.getByRole('combobox', { name: 'Diagram' })).toBeVisible();
    await expect(modal.getByRole('combobox', { name: 'Template' })).toBeVisible();
    await expect(modal.locator('.mermaid-editor-preview svg')).toBeVisible();
    await expect(modal.locator('.mermaid-editor-preview-empty')).toHaveCount(0);
    await expect(modal.locator('.mermaid-editor-preview-state')).toHaveText('Up to date');
    await expect(modal.locator('.mermaid-editor-code-host .cm-content')).toBeFocused();
    const pickerRects = await modal.locator('.mermaid-editor-template-label').evaluateAll(labels => labels.map(label => {
        const rect = label.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, width: rect.width };
    }));
    expect(pickerRects).toHaveLength(2);
    expect(Math.abs(pickerRects[1].y - pickerRects[0].y)).toBeLessThan(2);
    expect(Math.abs(pickerRects[1].x - pickerRects[0].right - 4)).toBeLessThan(2);
    expect(pickerRects.every(rect => rect.width <= 250)).toBe(true);

    const preview = modal.locator('.mermaid-editor-preview');
    const previewCanvas = modal.locator('.mermaid-editor-preview-canvas');
    await expect(preview).toHaveAttribute('aria-label', 'Interactive Mermaid preview');
    const fittedBounds = await page.evaluate(() => {
        const viewport = document.querySelector('.mermaid-editor-preview').getBoundingClientRect();
        const svg = document.querySelector('.mermaid-editor-preview-canvas svg').getBoundingClientRect();
        return { viewport, svg };
    });
    expect(fittedBounds.svg.width).toBeLessThanOrEqual(fittedBounds.viewport.width);
    expect(fittedBounds.svg.height).toBeLessThanOrEqual(fittedBounds.viewport.height);
    const initialPreviewMarkup = await previewCanvas.innerHTML();

    const sourceBeforeNavigation = await modal.locator('.mermaid-editor-code-host .cm-content').textContent();
    const previewSVG = previewCanvas.locator('svg');
    const initialSVGWidth = await previewSVG.evaluate(svg => svg.getBoundingClientRect().width);
    const previewBox = await preview.boundingBox();
    await page.mouse.move(previewBox.x + (previewBox.width / 2), previewBox.y + (previewBox.height / 2));
    await page.mouse.wheel(0, -240);
    await expect.poll(() => previewCanvas.getAttribute('data-zoom').then(Number)).toBeGreaterThan(1);
    await expect.poll(() => previewSVG.evaluate(svg => svg.getBoundingClientRect().width))
        .toBeGreaterThan(initialSVGWidth);
    await expect(previewCanvas).toHaveCSS('transform', 'none');
    const panBefore = await previewCanvas.getAttribute('data-pan-x').then(Number);
    await page.mouse.down();
    await page.mouse.move(previewBox.x + (previewBox.width / 2) + 42, previewBox.y + (previewBox.height / 2) + 24);
    await page.mouse.up();
    await expect.poll(() => previewCanvas.getAttribute('data-pan-x').then(Number)).not.toBe(panBefore);
    await preview.press('0');
    await expect(previewCanvas).toHaveAttribute('data-zoom', '1.0000');
    await expect(previewCanvas).toHaveAttribute('data-pan-x', '0.00');
    expect(await modal.locator('.mermaid-editor-code-host .cm-content').textContent()).toBe(sourceBeforeNavigation);

    const measureModalPanes = () => modal.locator('.mermaid-editor-panes').evaluate(panes => {
        const modalRect = panes.closest('.mermaid-editor-modal').getBoundingClientRect();
        const paneRects = Array.from(panes.querySelectorAll('.mermaid-editor-pane'))
            .map(pane => pane.getBoundingClientRect());
        return {
            modal: { width: modalRect.width, height: modalRect.height },
            panes: paneRects.map(rect => ({ width: rect.width, height: rect.height })),
        };
    });
    await page.setViewportSize({ width: 1000, height: 680 });
    const mediumLayout = await measureModalPanes();
    await page.setViewportSize({ width: 1280, height: 900 });
    const largeLayout = await measureModalPanes();
    expect(largeLayout.modal.width).toBeGreaterThan(mediumLayout.modal.width);
    expect(largeLayout.modal.height).toBeGreaterThan(mediumLayout.modal.height);
    expect(largeLayout.panes[0].width).toBeGreaterThan(mediumLayout.panes[0].width);
    expect(largeLayout.panes[0].height).toBeGreaterThan(mediumLayout.panes[0].height);
    expect(Math.abs(mediumLayout.panes[0].width - mediumLayout.panes[1].width)).toBeLessThan(2);
    expect(Math.abs(largeLayout.panes[0].width - largeLayout.panes[1].width)).toBeLessThan(2);
    expect(largeLayout.modal.width).toBeLessThanOrEqual(1182);
    expect(largeLayout.modal.height).toBeLessThanOrEqual(782);

    await page.setViewportSize({ width: 800, height: 720 });
    const narrowPanes = await modal.locator('.mermaid-editor-pane').evaluateAll(panes => panes.map(pane => ({
        x: pane.getBoundingClientRect().x,
        y: pane.getBoundingClientRect().y,
    })));
    expect(narrowPanes[1].y).toBeGreaterThan(narrowPanes[0].y);
    expect(Math.abs(narrowPanes[1].x - narrowPanes[0].x)).toBeLessThan(2);
    await page.setViewportSize({ width: 1280, height: 720 });

    const originalCode = await modal.locator('.mermaid-editor-code-host .cm-content').textContent();
    const diagramCombobox = modal.getByRole('combobox', { name: 'Diagram' });
    await diagramCombobox.click();
    await modal.getByRole('option', { name: 'C4 Diagram' }).click();
    await expect(diagramCombobox).toContainText('C4 Diagram');
    expect(await modal.locator('.mermaid-editor-code-host .cm-content').textContent()).toBe(originalCode);
    await expect(modal.locator('.mermaid-editor-template-select option')).toHaveCount(2);
    const replaceButton = modal.getByRole('button', { name: 'Replace with template' });
    await expect(replaceButton).toBeEnabled();
    await replaceButton.click();
    await expect(replaceButton).toBeDisabled();
    await expect(replaceButton).toHaveCSS('cursor', 'default');
    await expect(modal.locator('.mermaid-editor-code-host .cm-content')).not.toHaveText(originalCode);
    await expect.poll(() => previewCanvas.innerHTML()).not.toBe(initialPreviewMarkup);
    const largeTemplateBounds = await page.evaluate(() => {
        const viewport = document.querySelector('.mermaid-editor-preview').getBoundingClientRect();
        const svg = document.querySelector('.mermaid-editor-preview-canvas svg').getBoundingClientRect();
        return { viewport, svg };
    });
    expect(largeTemplateBounds.svg.width).toBeLessThanOrEqual(largeTemplateBounds.viewport.width);
    expect(largeTemplateBounds.svg.height).toBeLessThanOrEqual(largeTemplateBounds.viewport.height);

    await diagramCombobox.click();
    await modal.getByRole('option', { name: 'Sequence Diagram' }).click();
    await expect(modal.locator('.mermaid-editor-code-host .cm-content')).toContainText('sequenceDiagram');
    expect(await modal.locator('.mermaid-editor-template-select option').first().evaluate(option => option.selected)).toBe(true);
    await expect(replaceButton).toBeDisabled();

    const modalSource = modal.locator('.mermaid-editor-code-host .cm-content');
    await modalSource.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText('flowchart TD\n  A -->');
    await expect(modal.locator('.mermaid-editor-preview-state')).toHaveText('Source has errors');
    await expect(modal.locator('.mermaid-editor-preview svg')).toBeVisible();
    await expect(modal.locator('.mermaid-editor-preview')).toHaveClass(/is-stale/);
    await expect(modal.locator('.mermaid-editor-stale-notice')).toBeVisible();
    await expect(modal.locator('.cm-lintRange-error')).toBeVisible();
    await expect(replaceButton).toBeEnabled();
    await modal.locator('.cm-lintRange-error').hover();
    await expect(page.locator('.cm-tooltip-lint')).toContainText('Mermaid syntax error');

    await expect(modal.locator('.mermaid-editor-apply-note'))
        .toHaveText('Source has errors; Apply will keep the Markdown source.');
    await modal.getByRole('button', { name: 'Apply' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('#editor-container > .cm-editor .cm-content')).toBeFocused();
    expect(await page.evaluate(() => window.__mermaidEditorMainView.state.doc.toString()))
        .toContain('```mermaid\nflowchart TD\n  A -->\n```');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => window.__mermaidEditorMainView.state.doc.toString())).toBe(source);

    await page.evaluate(() => {
        const view = window.__mermaidEditorMainView;
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
        view.focus();
    });
    await expect(page.locator('.cm-live-diagram')).toHaveCount(0);
    expect(await page.evaluate(() => Array.from(
        document.querySelectorAll('#editor-container .cm-gutters'),
        gutter => {
            const style = getComputedStyle(gutter);
            return style.borderLeftWidth === '0px' && style.borderRightWidth === '0px';
        },
    ).every(Boolean))).toBe(true);
    const sourceHelper = page.getByRole('button', { name: 'Open Mermaid Editor for this diagram' });
    await expect(sourceHelper).toBeVisible();
    await sourceHelper.focus();
    await sourceHelper.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Mermaid Editor' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#editor-container > .cm-editor .cm-content')).toBeFocused();
});

test('inherits Vim mode and display-row navigation inside the Mermaid source editor', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = ['```mermaid', 'flowchart TD', '  A --> B', '```'].join('\n');
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) await new Promise(resolve => setTimeout(resolve, 10));
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
        await editor.toggleVim(true);
        editor.setVimVisualRows(true);
    }, source);

    const openEditor = page.getByRole('button', { name: 'Open Mermaid Editor for this diagram' });
    await expect(openEditor).toHaveCount(1);
    await openEditor.click();
    const modal = page.getByRole('dialog', { name: 'Mermaid Editor' });
    const modalEditor = modal.locator('.mermaid-editor-code-host .cm-editor');
    const content = modal.locator('.mermaid-editor-code-host .cm-content');
    // Validation dispatches diagnostics into CodeMirror. The persistent Vim
    // mode attribute must survive that editor-state reconciliation.
    await expect(modal.locator('.mermaid-editor-preview-state')).toHaveText('Up to date');
    await expect(modalEditor).toHaveClass(/vim-normal/);
    await expect(page.locator('#file-type')).toHaveText('NORMAL');

    await content.press('i');
    await expect(modalEditor).toHaveClass(/vim-insert/);
    await expect(page.locator('#file-type')).toHaveText('INSERT');
    await content.press('Escape');
    await expect(modal).toBeVisible();
    await expect(modalEditor).toHaveClass(/vim-normal/);
    await expect(page.locator('#file-type')).toHaveText('NORMAL');

    await content.press('v');
    await expect(modalEditor).toHaveClass(/vim-visual/);
    await expect(page.locator('#file-type')).toHaveText('VISUAL');
    await content.press('Escape');
    await expect(modal).toBeVisible();
    await expect(modalEditor).toHaveClass(/vim-normal/);

    const longLine = Array.from({ length: 130 }, (_, index) => `node${index}`).join(' ');
    const before = await page.evaluate(async text => {
        const { EditorView } = await import('@codemirror/view');
        const view = EditorView.findFromDOM(document.querySelector('.mermaid-editor-code-host .cm-content'));
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text },
            selection: { anchor: 180 },
        });
        view.focus();
        window.__mermaidModalView = view;
        const position = view.state.selection.main.head;
        return { position, top: view.coordsAtPos(position).top };
    }, longLine);
    await content.press('j');
    const after = await page.evaluate(() => {
        const view = window.__mermaidModalView;
        const position = view.state.selection.main.head;
        return { position, line: view.state.doc.lineAt(position).number, top: view.coordsAtPos(position).top };
    });
    expect(after.line).toBe(1);
    expect(after.position).toBeGreaterThan(before.position);
    expect(after.top).toBeGreaterThan(before.top);

    await modal.getByRole('button', { name: 'Cancel' }).click();
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setVimVisualRows(false);
        await editor.toggleVim(false);
        delete window.__mermaidModalView;
    });
});

test('keeps every bundled Mermaid Live Editor template compatible with the bundled parser', async ({ page }) => {
    await openWelcomeEditor(page);
    const result = await page.evaluate(async () => {
        const { mermaidTemplates } = await import('/js/mermaidEditor.js');
        const { validateMermaidSource } = await import('/js/diagramRenderer.js');
        const failures = [];
        let count = 0;
        for (const diagram of mermaidTemplates) {
            for (const example of diagram.examples) {
                count += 1;
                try {
                    await validateMermaidSource(example.code);
                } catch (error) {
                    failures.push(`${diagram.name} / ${example.title}: ${error.message || error}`);
                }
            }
        }
        return { diagrams: mermaidTemplates.length, count, failures };
    });
    expect(result).toEqual({ diagrams: 32, count: 76, failures: [] });
});
