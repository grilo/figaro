import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('small Mermaid diagrams keep their edge handle reachable and commit height once on release', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = ['Before', '```mermaid', 'flowchart TD', '  A --> B', '```', 'After'].join('\n');
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
        window.__resizableMermaidView = view;
    }, source);

    const diagram = page.locator('.cm-block-widget--resizable-mermaid');
    await expect(diagram).toBeVisible();
    await expect(diagram.locator('svg')).toBeVisible();
    const geometry = await diagram.evaluate(element => {
        const channels = color => (String(color).match(/[\d.]+/gu) || []).slice(0, 3).map(Number);
        const luminance = color => channels(color).reduce((sum, channel, index) => {
            const normalized = channel / 255;
            const linear = normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            return sum + linear * [0.2126, 0.7152, 0.0722][index];
        }, 0);
        const contrast = (left, right) => {
            const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
            return (values[0] + 0.05) / (values[1] + 0.05);
        };
        const root = element.getBoundingClientRect();
        const graphic = element.querySelector('svg').getBoundingClientRect();
        const canvas = element.querySelector('.cm-live-diagram').getBoundingClientRect();
        const canvasBackground = getComputedStyle(element.querySelector('.cm-live-diagram')).backgroundColor;
        const edgeStroke = getComputedStyle(element.querySelector('.flowchart-link')).stroke;
        const handle = element.querySelector('.cm-mermaid-diagram-resize-handle');
        const handleRect = handle.getBoundingClientRect();
        return {
            rootHeight: root.height,
            rootWidth: root.width,
            graphicWidth: graphic.width,
            canvasBottom: canvas.bottom,
            canvasCenterX: canvas.left + canvas.width / 2,
            handleCenterX: handleRect.left + handleRect.width / 2,
            handleCenterY: handleRect.top + handleRect.height / 2,
            handlePosition: getComputedStyle(handle).position,
            canvasBackground,
            editorBackground: getComputedStyle(element.closest('.cm-editor')).backgroundColor,
            edgeContrast: contrast(edgeStroke, canvasBackground),
        };
    });
    expect(geometry.rootHeight).toBeGreaterThanOrEqual(340);
    expect(geometry.graphicWidth).toBeGreaterThan(geometry.rootWidth * 0.5);
    expect(geometry.handlePosition).toBe('absolute');
    expect(geometry.canvasBackground).toBe(geometry.editorBackground);
    expect(geometry.edgeContrast).toBeGreaterThanOrEqual(3);
    expect(Math.abs(geometry.handleCenterX - geometry.canvasCenterX)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.handleCenterY - geometry.canvasBottom)).toBeLessThanOrEqual(1);

    const handle = diagram.getByRole('button', { name: 'Resize Mermaid diagram vertically' });
    await page.mouse.move(geometry.canvasCenterX, geometry.canvasBottom - 12);
    await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 8 });
    await expect(diagram.locator('.cm-diagram-resize-readout')).toHaveText('380px high');
    expect(await page.evaluate(() => window.__resizableMermaidView.state.doc.toString())).toBe(source);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__resizableMermaidView.state.doc.toString()))
        .toContain('%% figaro:height 380');

    await page.locator('#editor-container > .cm-editor .cm-content').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() => window.__resizableMermaidView.state.doc.toString()))
        .toBe(source);
});

test('edits a Mermaid block with templates, live diagnostics, and last-known-good preview', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        'Before',
        '```mermaid',
        'flowchart TD',
        '  A[Christmas planning with a deliberately long node name] --> B[Go shopping] --> C --> D[Laptop] --> E[iPhone] --> F[fa:fa-car Car] --> G[Home]',
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
    await page.locator('.cm-live-diagram').hover();
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
    expect(await modal.evaluate(dialog => (
        getComputedStyle(dialog.querySelector('.mermaid-editor-preview')).backgroundColor
        === getComputedStyle(dialog.querySelector('.mermaid-editor-code-host .cm-editor')).backgroundColor
    ))).toBe(true);
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

    await modal.getByRole('tab', { name: 'Style' }).click();
    await expect(modal.locator('[data-diagram-type="flowchart-v2"]')).toBeVisible();
    await expect(modal.locator('.mermaid-editor-node-row')).toHaveCount(7);
    await expect(modal.locator('.mermaid-editor-combobox').first()).toHaveClass(/ui-picker--quiet/);
    const nodeList = modal.locator('.mermaid-editor-node-list');
    await nodeList.evaluate(element => { element.scrollTop = 24; });
    const nodeRows = modal.locator('.mermaid-editor-node-row');
    const rowGeometry = async () => nodeRows.evaluateAll(rows => rows.map(row => {
        const rect = row.getBoundingClientRect();
        return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }));
    const baselineRows = await rowGeometry();
    const secondRowBox = await nodeRows.nth(1).boundingBox();
    await page.mouse.move(secondRowBox.x + secondRowBox.width / 2, secondRowBox.y + secondRowBox.height / 2);
    await page.mouse.down();
    const pressedRows = await rowGeometry();
    await page.mouse.up();
    const settledFrames = await modal.locator('.mermaid-editor-style-content').evaluate(async panel => {
        const frames = [];
        for (let index = 0; index < 3; index++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            frames.push([...panel.querySelectorAll('.mermaid-editor-node-row')].map(row => {
                const rect = row.getBoundingClientRect();
                return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
            }));
        }
        return frames;
    });
    expect(pressedRows).toEqual(baselineRows);
    expect(settledFrames.every(frame => JSON.stringify(frame) === JSON.stringify(baselineRows))).toBe(true);
    expect(await nodeList.evaluate(element => element.scrollTop)).toBe(24);
    expect(await nodeRows.first().evaluate(row => {
        const identity = row.querySelector('.mermaid-editor-node-identity');
        const shape = row.querySelector('.mermaid-editor-node-shape');
        const swatch = row.querySelector('.mermaid-editor-node-swatch');
        const identityRect = identity.getBoundingClientRect();
        const shapeRect = shape.getBoundingClientRect();
        const swatchRect = swatch.getBoundingClientRect();
        const name = identity.querySelector('.mermaid-editor-node-name');
        return identityRect.right <= shapeRect.left
            && shapeRect.right <= swatchRect.left
            && getComputedStyle(name).textOverflow === 'ellipsis'
            && name.scrollWidth > name.clientWidth;
    })).toBe(true);
    const directionChoice = modal.getByRole('group', { name: 'Direction' });
    await expect(directionChoice.getByRole('button')).toHaveCount(4);
    expect(await directionChoice.evaluate(element => {
        const track = element.getBoundingClientRect();
        const buttons = [...element.querySelectorAll('.ui-button')].map(button => button.getBoundingClientRect());
        const highlight = getComputedStyle(element, '::before');
        const matrix = new DOMMatrixReadOnly(highlight.transform);
        const selected = element.querySelector('[aria-pressed="true"]').getBoundingClientRect();
        const highlightLeft = track.left + Number.parseFloat(highlight.left) + matrix.m41;
        return {
            oneRow: new Set(buttons.map(rect => Math.round(rect.top))).size === 1,
            contained: buttons.every(rect => rect.left >= track.left && rect.right <= track.right),
            highlightAligned: Math.abs(highlightLeft - selected.left) <= 1
                && Math.abs(Number.parseFloat(highlight.width) - selected.width) <= 1,
        };
    })).toEqual({ oneRow: true, contained: true, highlightAligned: true });
    await nodeRows.first().click();
    expect(await modal.locator('.mermaid-editor-selected-node').evaluate(editor => {
        const rect = editor.getBoundingClientRect();
        const panel = editor.closest('.mermaid-editor-style-content').getBoundingClientRect();
        const name = editor.querySelector('.mermaid-editor-selected-node-heading');
        const shape = editor.querySelector('.mermaid-editor-selected-node-shape');
        const color = editor.querySelector('.mermaid-editor-selected-node-color');
        const nameRect = name.getBoundingClientRect();
        const shapeRect = shape.getBoundingClientRect();
        const colorRect = color.getBoundingClientRect();
        return {
            visible: rect.top >= panel.top && rect.bottom <= panel.bottom,
            oneRow: Math.abs(nameRect.top - shapeRect.top) <= 1 && Math.abs(shapeRect.top - colorRect.top) <= 1,
            ordered: nameRect.right <= shapeRect.left && shapeRect.right <= colorRect.left,
            nameEllipsizes: getComputedStyle(name.querySelector('strong')).textOverflow === 'ellipsis'
                && name.querySelector('strong').scrollWidth > name.querySelector('strong').clientWidth,
        };
    })).toEqual({ visible: true, oneRow: true, ordered: true, nameEllipsizes: true });
    await previewCanvas.locator('[data-figaro-node-id="B"]').click();
    await expect(modal.locator('.mermaid-editor-node-row[data-node-id="B"]'))
        .toHaveAttribute('aria-selected', 'true');
    const nodeEditorLayout = await modal.locator('.mermaid-editor-style-content').evaluate(panel => {
        const editor = panel.querySelector('.mermaid-editor-selected-node');
        const list = panel.querySelector('.mermaid-editor-node-list');
        const row = list.querySelector('.mermaid-editor-node-row');
        const modal = panel.closest('.mermaid-editor-modal');
        const pane = panel.closest('.mermaid-editor-pane');
        const heading = pane.querySelector('.mermaid-editor-mode-heading');
        const gutter = pane.querySelector('.cm-gutters');
        const editorRect = editor.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        return {
            editorBeforeList: Boolean(editor.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING),
            editorVisible: editorRect.top >= panelRect.top && editorRect.bottom <= panelRect.bottom,
            listIsBounded: list.scrollHeight > list.clientHeight,
            swatchRadius: getComputedStyle(list.querySelector('.mermaid-editor-node-swatch')).borderRadius,
            modalBorder: getComputedStyle(modal).borderTopWidth,
            paneBorder: getComputedStyle(pane).borderTopWidth,
            headingBorder: getComputedStyle(heading).borderBottomWidth,
            listBorder: getComputedStyle(list).borderTopWidth,
            rowDivider: getComputedStyle(row).borderBottomWidth,
            gutterDivider: getComputedStyle(gutter).borderRightWidth,
            quietControls: Array.from(modal.querySelectorAll('.ui-segmented-control'))
                .every(control => control.classList.contains('ui-segmented-control--quiet')),
        };
    });
    expect(nodeEditorLayout).toEqual({
        editorBeforeList: true,
        editorVisible: true,
        listIsBounded: true,
        swatchRadius: '50%',
        modalBorder: '0px',
        paneBorder: '0px',
        headingBorder: '0px',
        listBorder: '0px',
        rowDivider: '0px',
        gutterDivider: '1px',
        quietControls: true,
    });
    await modal.getByRole('button', { name: 'Pill', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'Pill', exact: true })).toBeFocused();
    await modal.locator('.mermaid-editor-selected-node .mermaid-editor-color-button').click();
    await expect(modal.locator('.mermaid-editor-preview-state')).toHaveText('Up to date');
    await expect(page.getByRole('listbox', { name: 'Go shopping fill' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.mermaid-editor-selected-node .mermaid-editor-color-button')).toBeFocused();
    await modal.locator('.mermaid-editor-selected-node .mermaid-editor-color-button').click();
    await page.getByRole('option', { name: 'Color #3b82f6' }).click();
    await expect(modal.locator('.mermaid-editor-selected-node .mermaid-editor-color-button')).toBeFocused();
    await expect(modal.locator('.mermaid-editor-preview-state')).toHaveText('Up to date');
    await expect(previewCanvas.locator('[data-figaro-node-id="B"] .label-container path').first())
        .toHaveCSS('fill', 'rgb(59, 130, 246)');
    const styleOverflow = await modal.locator('.mermaid-editor-style-content').evaluate(panel => ({
        clientWidth: panel.clientWidth,
        scrollWidth: panel.scrollWidth,
    }));
    expect(styleOverflow.scrollWidth).toBeLessThanOrEqual(styleOverflow.clientWidth + 1);
    await modal.getByRole('tab', { name: 'Source' }).click();
    await expect(modal.locator('.mermaid-editor-code-host .cm-content'))
        .toContainText('style B fill:#3b82f6');

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
    expect(mediumLayout.panes[1].width).toBeGreaterThan(mediumLayout.panes[0].width);
    expect(largeLayout.panes[1].width).toBeGreaterThan(largeLayout.panes[0].width);
    expect(largeLayout.modal.width).toBeLessThanOrEqual(1262);
    expect(largeLayout.modal.height).toBeLessThanOrEqual(782);

    await page.setViewportSize({ width: 800, height: 720 });
    const narrowPanes = await modal.locator('.mermaid-editor-pane').evaluateAll(panes => panes.map(pane => ({
        x: pane.getBoundingClientRect().x,
        y: pane.getBoundingClientRect().y,
    })));
    expect(narrowPanes[1].y).toBeGreaterThan(narrowPanes[0].y);
    expect(Math.abs(narrowPanes[1].x - narrowPanes[0].x)).toBeLessThan(2);
    for (const height of [720, 580]) {
        await page.setViewportSize({ width: 800, height });
        expect(await modal.evaluate(dialog => {
            const content = dialog.querySelector('.custom-modal-content').getBoundingClientRect();
            const footer = dialog.querySelector('.custom-modal-buttons').getBoundingClientRect();
            return [...dialog.querySelectorAll('.mermaid-editor-pane')].every(pane => {
                const rect = pane.getBoundingClientRect();
                return rect.top >= content.top && rect.bottom <= content.bottom && rect.bottom <= footer.top;
            });
        })).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 720 });

    const resizeHandle = modal.getByRole('button', { name: 'Resize editor dialog' });
    await expect(resizeHandle).toBeVisible();
    const defaultModalBounds = await modal.boundingBox();
    const resizeHandleBounds = await resizeHandle.boundingBox();
    expect(defaultModalBounds).not.toBeNull();
    expect(resizeHandleBounds).not.toBeNull();
    await page.mouse.move(
        resizeHandleBounds.x + (resizeHandleBounds.width / 2),
        resizeHandleBounds.y + (resizeHandleBounds.height / 2),
    );
    await page.mouse.down();
    await page.mouse.move(
        resizeHandleBounds.x + (resizeHandleBounds.width / 2) - 520,
        resizeHandleBounds.y + (resizeHandleBounds.height / 2),
        { steps: 8 },
    );
    await page.mouse.up();
    const resizedModalBounds = await modal.boundingBox();
    const resizedPanePositions = await modal.locator('.mermaid-editor-pane').evaluateAll(panes => (
        panes.map(pane => {
            const bounds = pane.getBoundingClientRect();
            return { x: bounds.x, y: bounds.y };
        })
    ));
    expect(resizedModalBounds.width).toBeLessThan(defaultModalBounds.width);
    expect(resizedModalBounds.width).toBeLessThan(820);
    expect(resizedModalBounds.x).toBeGreaterThanOrEqual(23);
    expect(resizedModalBounds.x + resizedModalBounds.width).toBeLessThanOrEqual(1257);
    expect(resizedPanePositions[1].y).toBeGreaterThan(resizedPanePositions[0].y);

    await resizeHandle.focus();
    await page.keyboard.press('Home');
    await expect.poll(async () => (await modal.boundingBox()).width)
        .toBeGreaterThan(resizedModalBounds.width);
    const resetPanePositions = await modal.locator('.mermaid-editor-pane').evaluateAll(panes => (
        panes.map(pane => {
            const bounds = pane.getBoundingClientRect();
            return { x: bounds.x, y: bounds.y };
        })
    ));
    expect(Math.abs(resetPanePositions[1].y - resetPanePositions[0].y)).toBeLessThan(2);
    expect(resetPanePositions[1].x).toBeGreaterThan(resetPanePositions[0].x);

    const originalCode = await modal.locator('.mermaid-editor-code-host .cm-content').textContent();
    const diagramCombobox = modal.getByRole('combobox', { name: 'Diagram' });
    const diagramOptions = page.locator(`#${await diagramCombobox.getAttribute('aria-controls')}`);
    await diagramCombobox.click();
    await diagramOptions.getByRole('option', { name: 'C4 Diagram' }).click();
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
    await diagramOptions.getByRole('option', { name: 'Sequence Diagram' }).click();
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
    await expect(modal).toHaveCount(0);
    await expect(page.locator('#file-type')).toHaveText('NORMAL');

    await openEditor.click();
    await expect(modal.locator('.mermaid-editor-preview-state')).toHaveText('Up to date');
    await expect(modalEditor).toHaveClass(/vim-normal/);

    await content.press('v');
    await expect(modalEditor).toHaveClass(/vim-visual/);
    await expect(page.locator('#file-type')).toHaveText('VISUAL');
    await content.press('Escape');
    await expect(modal).toHaveCount(0);

    await openEditor.click();
    await expect(modal.locator('.mermaid-editor-preview-state')).toHaveText('Up to date');
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
    await modal.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        editor.setVimVisualRows(false);
        await editor.toggleVim(false);
        delete window.__mermaidModalView;
    });
});
