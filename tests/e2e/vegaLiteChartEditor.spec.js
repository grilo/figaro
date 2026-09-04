import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

async function chartEditorCollisionReport(modal) {
    return modal.evaluate(root => {
        const intersects = (left, right) => (
            Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1
            && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1
        );
        const collisions = [];
        for (const row of root.querySelectorAll([
            '.vega-lite-chart-editor-column',
            '.vega-lite-chart-editor-column-options',
            '.vega-lite-chart-editor-mode-layout',
            '.vega-lite-chart-editor-guide-toggles',
            '.vega-lite-chart-editor-threshold-controls',
        ].join(', '))) {
            const children = Array.from(row.children).filter(element => {
                const bounds = element.getBoundingClientRect();
                return !element.hidden && getComputedStyle(element).display !== 'none'
                    && bounds.width > 0 && bounds.height > 0;
            });
            for (let left = 0; left < children.length; left += 1) {
                for (let right = left + 1; right < children.length; right += 1) {
                    if (intersects(children[left].getBoundingClientRect(), children[right].getBoundingClientRect())) {
                        collisions.push(`${children[left].className || children[left].tagName}/${children[right].className || children[right].tagName}`);
                    }
                }
            }
        }
        const config = root.querySelector('.vega-lite-chart-editor-config');
        const configBounds = config.getBoundingClientRect();
        const outside = Array.from(config.querySelectorAll('*')).flatMap(element => {
            if (element.classList.contains('select-combobox-native')) return [];
            const bounds = element.getBoundingClientRect();
            if (!bounds.width || getComputedStyle(element).position === 'fixed') return [];
            if (bounds.left < configBounds.left - 1 || bounds.right > configBounds.right + 1) {
                return [{
                    name: element.className || element.tagName,
                    left: Math.round(bounds.left - configBounds.left),
                    right: Math.round(bounds.right - configBounds.right),
                    width: Math.round(bounds.width),
                }];
            }
            return [];
        });
        return {
            collisions,
            // A stable vertical scrollbar gutter is part of offsetWidth, not
            // horizontal content overflow.
            horizontalOverflow: Math.max(0, config.scrollWidth - config.offsetWidth),
            outside,
        };
    });
}

async function chartPaintReport(locator, surfaceSelector, expectedColor) {
    return locator.evaluate((root, { selector, color }) => {
        const probe = document.createElement('span');
        probe.style.color = color;
        document.body.append(probe);
        const expectedPaint = getComputedStyle(probe).color;
        probe.remove();
        const graphic = root.querySelector('svg');
        const matchingPaint = Array.from(graphic.querySelectorAll('*')).filter(element => {
            const style = getComputedStyle(element);
            return style.fill === expectedPaint || style.stroke === expectedPaint;
        }).length;
        return {
            expectedPaint,
            matchingPaint,
            surface: getComputedStyle(selector === ':scope' ? root : root.querySelector(selector)).backgroundColor,
        };
    }, { selector: surfaceSelector, color: expectedColor });
}

test('converts a simple table into a themed, complete chart and resizes it as one editor change', async ({ page }) => {
    await openWelcomeEditor(page);
    const table = [
        '| Column 1 | Column 2 | Column 3 |',
        '| --- | ---: | ---: |',
        '| Alpha | 42 | 18 |',
        '| Beta | 56 | 24 |',
        '| Gamma | 71 | 31 |',
    ].join('\n');
    const source = ['Before', '', table, '', 'After'].join('\n');
    await page.evaluate(async markdown => {
        const editor = await import('/js/editor.js');
        editor.setEditorContent(markdown);
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== markdown) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
        window.__chartEditorView = view;
    }, source);

    const convert = page.getByRole('button', { name: 'Convert Markdown table to Vega-Lite chart' });
    await expect(convert).toBeVisible();
    await convert.focus();
    await convert.press('Enter');

    const modal = page.getByRole('dialog', { name: 'Chart Editor' });
    await expect(modal).toBeVisible();
    const preview = modal.locator('[data-chart-preview]');
    const previewSVG = preview.locator('svg');
    await expect(previewSVG).toBeVisible();
    const markCombobox = modal.getByRole('combobox', { name: 'Mark type for Column 2' });
    await expect(markCombobox).toBeVisible();
    const markOptions = page.locator(`#${await markCombobox.getAttribute('aria-controls')}`);
    await markCombobox.click();
    await expect(markOptions).toBeVisible();
    const popupGeometry = await markOptions.evaluate(menu => {
        const bounds = menu.getBoundingClientRect();
        return {
            position: getComputedStyle(menu).position,
            placement: menu.dataset.placement,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            left: bounds.left,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
        };
    });
    expect(popupGeometry.position).toBe('fixed');
    expect(['top', 'bottom']).toContain(popupGeometry.placement);
    expect(popupGeometry.top).toBeGreaterThanOrEqual(7);
    expect(popupGeometry.left).toBeGreaterThanOrEqual(7);
    expect(popupGeometry.right).toBeLessThanOrEqual(popupGeometry.viewportWidth - 7);
    expect(popupGeometry.bottom).toBeLessThanOrEqual(popupGeometry.viewportHeight - 7);
    await expect(markOptions.getByRole('option', { name: 'Bar', exact: true }))
        .toHaveAttribute('aria-selected', 'true');
    await markCombobox.press('Escape');
    const layout = await modal.evaluate(root => {
        const config = root.querySelector('.vega-lite-chart-editor-config').getBoundingClientRect();
        const pane = root.querySelector('.vega-lite-chart-editor-preview-pane').getBoundingClientRect();
        const viewport = root.querySelector('[data-chart-preview]').getBoundingClientRect();
        const svg = root.querySelector('[data-chart-preview] svg').getBoundingClientRect();
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;background:var(--editor-surface);color:var(--text-muted)';
        document.body.append(probe);
        const probeStyle = getComputedStyle(probe);
        const previewStyle = getComputedStyle(root.querySelector('[data-chart-preview]'));
        const axisText = root.querySelector('[data-chart-preview] svg text');
        const result = {
            previewBackground: previewStyle.backgroundColor,
            expectedBackground: probeStyle.backgroundColor,
            axisTextColor: axisText ? getComputedStyle(axisText).fill : '',
            expectedAxisTextColor: probeStyle.color,
        };
        probe.remove();
        return {
            ...result,
            configWidth: config.width,
            paneWidth: pane.width,
            previewCenterY: viewport.top + (viewport.height / 2),
            svgCenterY: svg.top + (svg.height / 2),
            svgWidth: svg.width,
            svgHeight: svg.height,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
        };
    });
    expect(layout.paneWidth).toBeGreaterThan(layout.configWidth * 1.5);
    expect(Math.abs(layout.previewCenterY - layout.svgCenterY)).toBeLessThan(2);
    expect(layout.svgWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.svgHeight).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.previewBackground).toBe(layout.expectedBackground);
    expect(layout.previewBackground).not.toBe('rgb(255, 255, 255)');
    expect(layout.axisTextColor).toBe(layout.expectedAxisTextColor);
    expect(await chartEditorCollisionReport(modal)).toEqual({ collisions: [], horizontalOverflow: 0, outside: [] });
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expect(preview.locator('[role="alert"]')).toHaveCount(0);

    const legendTexts = () => previewSVG.evaluate(svg => (
        Array.from(svg.querySelectorAll('.role-legend text'), element => element.textContent.trim())
    ));
    await expect.poll(legendTexts).toEqual(['Column 2', 'Column 3']);
    const legendPosition = modal.getByRole('group', { name: 'Legend position' });
    await expect(legendPosition.getByRole('button', { name: 'Right' }))
        .toHaveAttribute('aria-pressed', 'true');
    const rightLegend = await preview.locator('.role-legend').first().boundingBox();
    await legendPosition.getByRole('button', { name: 'Bottom' }).click();
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expect(legendPosition.getByRole('button', { name: 'Bottom' }))
        .toHaveAttribute('aria-pressed', 'true');
    const bottomLegend = await preview.locator('.role-legend').first().boundingBox();
    expect(bottomLegend.y).toBeGreaterThan(rightLegend.y + 20);

    const thirdColumnVisibility = modal.getByRole('button', { name: 'Hide Column 3' });
    await expect(thirdColumnVisibility.locator('svg')).toBeVisible();
    await thirdColumnVisibility.click();
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expect(modal.getByRole('button', { name: 'Show Column 3' })).toBeVisible();
    await expect.poll(legendTexts).toEqual(['Column 2']);
    await modal.getByRole('button', { name: 'Show Column 3' }).click();
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expect.poll(legendTexts).toEqual(['Column 2', 'Column 3']);

    await expect(modal.getByRole('combobox', { name: 'Cartesian category column' })).toHaveCount(0);
    await expect(modal.locator('[data-chart-column="Column 1"]')).toHaveClass(/is-category/);
    await expect(modal.locator('[data-column-visible="Column 1"]')).toBeDisabled();
    await expect(modal.getByRole('combobox', { name: 'Mark type for Column 2' })).toHaveText('Bar');
    await expect.poll(legendTexts).toEqual(['Column 2', 'Column 3']);

    const controlGeometry = await modal.evaluate(root => {
        const bounds = selector => root.querySelector(selector).getBoundingClientRect();
        const mark = bounds('[data-chart-column="Column 2"] .select-combobox-trigger');
        const color = bounds('[data-column-color-button="Column 2"]');
        const trend = root.querySelector(
            '[data-chart-column="Column 2"] .vega-lite-chart-editor-column-extra',
        );
        const trendBounds = trend.getBoundingClientRect();
        const thresholdLabel = bounds('[data-threshold-label]');
        const thresholdStepper = bounds('.vega-lite-chart-editor-threshold-stepper');
        const mode = bounds('[aria-label="Chart mode"]');
        const orientation = bounds('[aria-label="Chart orientation"]');
        const columnsSection = root.querySelector('[data-columns-section]');
        const axesSection = root.querySelector('[data-cartesian-section]:not([data-columns-section])');
        const seriesRow = bounds('[data-chart-column="Column 2"]');
        const previewPane = root.querySelector('.vega-lite-chart-editor-preview-pane');
        const previewHeading = root.querySelector('.vega-lite-chart-editor-preview-heading');
        const thresholdControls = Array.from(root.querySelector('.vega-lite-chart-editor-threshold-controls').children)
            .map(element => element.getBoundingClientRect());
        return {
            categoryText: root.querySelector('.vega-lite-chart-editor-category-role').textContent,
            markWidth: mark.width,
            colorWidth: color.width,
            colorHeight: color.height,
            trendWhiteSpace: getComputedStyle(trend).whiteSpace,
            trendWidth: trendBounds.width,
            trendScrollWidth: trend.scrollWidth,
            thresholdLabelWidth: thresholdLabel.width,
            thresholdLabelHeight: thresholdLabel.height,
            thresholdStepperWidth: thresholdStepper.width,
            thresholdStepperHeight: thresholdStepper.height,
            modeTop: mode.top,
            orientationTop: orientation.top,
            seriesRowHeight: seriesRow.height,
            modalBorderTop: getComputedStyle(root).borderTopWidth,
            seriesRowBorderTop: getComputedStyle(root.querySelector('[data-chart-column="Column 2"]')).borderTopWidth,
            columnsBorderTop: getComputedStyle(columnsSection).borderTopWidth,
            columnsBorderBottom: getComputedStyle(columnsSection).borderBottomWidth,
            axesBorderTop: getComputedStyle(axesSection).borderTopWidth,
            previewBorderTop: getComputedStyle(previewPane).borderTopWidth,
            previewHeadingBorderBottom: getComputedStyle(previewHeading).borderBottomWidth,
            thresholdControlBottomSpread: Math.max(...thresholdControls.map(item => item.bottom))
                - Math.min(...thresholdControls.map(item => item.bottom)),
            thresholdControlLefts: thresholdControls.map(item => item.left),
            removedHintsPresent: [
                'One mode, one orientation',
                'Resize vertically in the note',
                'Apply writes one change',
            ].some(text => root.textContent.includes(text)),
            quietSegmentedControls: Array.from(root.querySelectorAll('.ui-segmented-control'))
                .every(control => control.classList.contains('ui-segmented-control--quiet')),
            quietSteppers: Array.from(root.querySelectorAll('.ui-stepper'))
                .every(control => control.classList.contains('ui-stepper--quiet')),
            quietFields: Array.from(root.querySelectorAll('.ui-field'))
                .every(control => control.classList.contains('ui-field--quiet')),
        };
    });
    expect(controlGeometry.categoryText).toBe('Labels on bottom axis');
    expect(controlGeometry.markWidth).toBeGreaterThanOrEqual(130);
    expect(Math.abs(controlGeometry.colorWidth - controlGeometry.colorHeight)).toBeLessThan(1);
    expect(controlGeometry.trendWhiteSpace).toBe('nowrap');
    expect(controlGeometry.trendScrollWidth).toBeLessThanOrEqual(controlGeometry.trendWidth + 1);
    expect(controlGeometry.thresholdLabelWidth).toBeGreaterThan(250);
    expect(controlGeometry.thresholdLabelHeight).toBeGreaterThanOrEqual(30);
    expect(controlGeometry.thresholdStepperWidth).toBeGreaterThan(95);
    expect(controlGeometry.thresholdStepperWidth).toBeLessThanOrEqual(110);
    expect(controlGeometry.thresholdStepperHeight).toBe(30);
    expect(Math.abs(controlGeometry.modeTop - controlGeometry.orientationTop)).toBeLessThan(1);
    expect(controlGeometry.seriesRowHeight).toBeLessThanOrEqual(85);
    expect(controlGeometry.modalBorderTop).toBe('0px');
    expect(controlGeometry.seriesRowBorderTop).toBe('1px');
    expect(controlGeometry.columnsBorderTop).toBe('0px');
    expect(controlGeometry.columnsBorderBottom).toBe('0px');
    expect(controlGeometry.axesBorderTop).toBe('0px');
    expect(controlGeometry.previewBorderTop).toBe('0px');
    expect(controlGeometry.previewHeadingBorderBottom).toBe('0px');
    expect(controlGeometry.thresholdControlBottomSpread).toBeLessThan(2);
    expect(controlGeometry.thresholdControlLefts).toEqual(
        [...controlGeometry.thresholdControlLefts].sort((left, right) => left - right),
    );
    expect(controlGeometry.removedHintsPresent).toBe(false);
    expect(controlGeometry.quietSegmentedControls).toBe(true);
    expect(controlGeometry.quietSteppers).toBe(true);
    expect(controlGeometry.quietFields).toBe(true);

    const seriesAxis = modal.getByRole('group', { name: 'Axis for Column 2' });
    await expect(seriesAxis.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
    await seriesAxis.getByRole('button', { name: 'Right' }).click();
    await expect(modal.getByRole('group', { name: 'Axis for Column 2' })
        .getByRole('button', { name: 'Right' })).toHaveAttribute('aria-pressed', 'true');
    await modal.getByRole('group', { name: 'Axis for Column 2' }).getByRole('button', { name: 'Left' }).click();

    const thresholdAxis = modal.getByRole('group', { name: 'Threshold axis' });
    await expect(modal.locator('select[data-threshold-axis]')).toHaveCount(0);
    const axisTitles = () => previewSVG.evaluate(svg => (
        Array.from(svg.querySelectorAll('.role-axis-title text'), element => element.textContent.trim())
    ));
    const expectEveryAxisTitleOnce = async () => {
        await expect.poll(async () => {
            const titles = await axisTitles();
            return Object.fromEntries(['Column 1', 'Column 2', 'Column 3'].map(title => (
                [title, titles.filter(candidate => candidate === title).length]
            )));
        }).toEqual({ 'Column 1': 1, 'Column 2': 1, 'Column 3': 1 });
    };
    const thresholdVisible = modal.getByRole('checkbox', { name: 'Threshold' });
    await thresholdVisible.check();
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expectEveryAxisTitleOnce();
    await thresholdAxis.getByRole('button', { name: 'Opposite' }).click();
    await expect(thresholdAxis.getByRole('button', { name: 'Opposite' })).toHaveAttribute('aria-pressed', 'true');
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expectEveryAxisTitleOnce();
    await modal.getByRole('group', { name: 'Threshold axis' }).getByRole('button', { name: 'Primary' }).click();
    await modal.getByRole('group', { name: 'Chart orientation' }).getByRole('button', { name: 'Horizontal' }).click();
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expectEveryAxisTitleOnce();
    await modal.getByRole('group', { name: 'Chart orientation' }).getByRole('button', { name: 'Vertical' }).click();
    await thresholdVisible.uncheck();
    await expect(preview).toHaveAttribute('aria-busy', 'false');

    const trendlineInput = modal.locator('[data-column-trendline="Column 2"]');
    await expect(trendlineInput).toBeEnabled();
    await trendlineInput.check();
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    const trendlineGeometry = await previewSVG.evaluate(svg => {
        const line = Array.from(svg.querySelectorAll('path, line')).find(element => {
            const dash = element.getAttribute('stroke-dasharray')
                || getComputedStyle(element).strokeDasharray;
            return String(dash).replaceAll('px', '').replaceAll(' ', '').includes('5,4');
        });
        if (!line) return null;
        const bounds = line.getBBox();
        return { width: bounds.width, height: bounds.height };
    });
    expect(trendlineGeometry).not.toBeNull();
    expect(trendlineGeometry.width).toBeGreaterThan(40);

    const chooseColumnTwoMark = async name => {
        const combobox = modal.getByRole('combobox', { name: 'Mark type for Column 2' });
        const options = page.locator(`#${await combobox.getAttribute('aria-controls')}`);
        await combobox.click();
        await options.getByRole('option', { name, exact: true }).click();
    };
    await chooseColumnTwoMark('Stacked Bar');
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    const disabledTrendline = modal.locator(
        '[data-chart-column="Column 2"] .vega-lite-chart-editor-column-extra',
    );
    await expect(disabledTrendline.locator('.vega-lite-chart-editor-trendline-help')).toHaveCount(0);
    await expect(disabledTrendline.locator('span')).toHaveCSS('text-decoration-line', 'none');
    await disabledTrendline.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('tooltip'))
        .toHaveText('Choose a non-stacked mark to use a linear trendline.');
    const tooltipStack = await modal.evaluate(root => {
        const tooltip = document.getElementById('ui-tooltip');
        const overlay = root.closest('.custom-modal-overlay');
        const bounds = tooltip.getBoundingClientRect();
        return {
            tooltipZ: Number(getComputedStyle(tooltip).zIndex),
            overlayZ: Number(getComputedStyle(overlay).zIndex),
            insideViewport: bounds.left >= 0 && bounds.top >= 0
                && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
        };
    });
    expect(tooltipStack.tooltipZ).toBeGreaterThan(tooltipStack.overlayZ);
    expect(tooltipStack.insideViewport).toBe(true);
    await preview.hover();
    await expect(page.getByRole('tooltip')).toBeHidden();
    await disabledTrendline.click({ force: true });
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('tooltip'))
        .toHaveText('Choose a non-stacked mark to use a linear trendline.');
    await chooseColumnTwoMark('Bar');
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expect(trendlineInput).toBeEnabled();

    await modal.getByRole('button', { name: 'Pie' }).click();
    await expect(modal.locator('[data-pie-section]')).toBeVisible();
    await expect(previewSVG).toBeVisible();
    await expect(preview.locator('.vega-lite-chart-editor-preview-error')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Waterfall' }).click();
    await expect(modal.locator('[data-waterfall-section]')).toBeVisible();
    await expect(previewSVG).toBeVisible();
    await expect(preview.locator('.vega-lite-chart-editor-preview-error')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Cartesian' }).click();
    await expect(modal.locator('[data-cartesian-section]').first()).toBeVisible();
    await expect(previewSVG).toBeVisible();

    await page.setViewportSize({ width: 900, height: 720 });
    await expect.poll(() => chartEditorCollisionReport(modal)).toEqual({ collisions: [], horizontalOverflow: 0, outside: [] });
    await page.setViewportSize({ width: 1280, height: 720 });

    await chooseColumnTwoMark('Area');
    const authoredColor = '#14b8a6';
    await modal.locator('[data-column-color-button="Column 2"]').click();
    const colorPalette = page.getByRole('listbox', { name: 'Choose color for Column 2' });
    await expect(colorPalette).toHaveClass(/kanban-color-picker/);
    await colorPalette.getByRole('option', { name: `Color ${authoredColor}` }).click();
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    const previewPaint = await chartPaintReport(preview, ':scope', authoredColor);
    expect(previewPaint.matchingPaint).toBeGreaterThan(0);

    await modal.getByRole('button', { name: 'Create chart' }).click();
    await page.evaluate(() => {
        const view = window.__chartEditorView;
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
    });
    const chart = page.locator('.cm-block-widget--figaro-chart');
    await expect(chart).toBeVisible();
    await expect(chart.locator('svg')).toBeVisible();
    const documentPaint = await chartPaintReport(chart, '.cm-live-diagram', authoredColor);
    expect(documentPaint.matchingPaint).toBeGreaterThan(0);
    expect(documentPaint.expectedPaint).toBe(previewPaint.expectedPaint);
    expect(documentPaint.surface).toBe(previewPaint.surface);
    await chart.hover();
    const handle = chart.getByRole('button', { name: 'Resize chart vertically' });
    await expect(handle).toBeVisible();
    await handle.hover();
    const authoredBeforeResize = await page.evaluate(() => window.__chartEditorView.state.doc.toString());
    const box = await handle.boundingBox();
    const hitTarget = await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        return {
            x,
            y,
            viewport: { width: innerWidth, height: innerHeight },
            tag: target?.tagName || '',
            className: typeof target?.className === 'string' ? target.className : '',
            html: target?.outerHTML?.slice(0, 180) || '',
            pointerEvents: getComputedStyle(document.querySelector('.cm-vega-lite-chart-resize-handle')).pointerEvents,
        };
    }, { x: box.x + (box.width / 2), y: box.y + (box.height / 2) });
    expect(hitTarget).toMatchObject({
        tag: 'BUTTON',
        className: expect.stringContaining('cm-vega-lite-chart-resize-handle'),
        pointerEvents: 'auto',
    });
    await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
    await page.mouse.down();
    await expect(chart).toHaveClass(/is-resizing/);
    await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2) + 80, { steps: 8 });
    await expect(chart.locator('.cm-vega-lite-chart-resize-readout')).toHaveText('420px high');
    expect(await page.evaluate(() => window.__chartEditorView.state.doc.toString())).toBe(authoredBeforeResize);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__chartEditorView.state.doc.toString()))
        .toContain('"height":420');

    await page.locator('#editor-container > .cm-editor .cm-content').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() => window.__chartEditorView.state.doc.toString()))
        .toBe(authoredBeforeResize);

    const sourceGeometry = await page.evaluate(() => {
        const view = window.__chartEditorView;
        const chartBlock = view.state.doc.toString().indexOf('```vega-lite');
        const fromLine = view.state.doc.lineAt(chartBlock).number;
        const toLine = view.state.doc.lineAt(view.state.doc.toString().indexOf('```', chartBlock + 3)).number;
        const afterLine = Math.min(view.state.doc.lines, toLine + 1);
        const renderedAfterTop = view.coordsAtPos(view.state.doc.line(afterLine).from).top
            + view.scrollDOM.scrollTop;
        view.dispatch({ selection: { anchor: view.state.doc.line(fromLine + 1).from } });
        view.focus();
        return { fromLine, toLine, afterLine, renderedAfterTop };
    });
    await expect(chart).toHaveCount(0);
    await expect(page.locator('.cm-vega-lite-chart-source-placeholder')).toHaveCount(1);
    const revealedGeometry = await page.evaluate(line => {
        const view = window.__chartEditorView;
        const lines = Array.from(document.querySelectorAll('.cm-vega-lite-chart-source-line'));
        const placeholder = document.querySelector('.cm-vega-lite-chart-source-placeholder');
        return {
            afterTop: view.coordsAtPos(view.state.doc.line(line).from).top + view.scrollDOM.scrollTop,
            scrollTop: view.scrollDOM.scrollTop,
            placeholderHeight: placeholder.getBoundingClientRect().height,
            minHeight: getComputedStyle(placeholder).minHeight,
            whiteSpace: lines.map(element => getComputedStyle(element).whiteSpace),
            lineHeights: lines.map(element => element.getBoundingClientRect().height),
        };
    }, sourceGeometry.afterLine);
    expect(Math.abs(revealedGeometry.afterTop - sourceGeometry.renderedAfterTop)).toBeLessThan(2);
    expect(revealedGeometry.placeholderHeight).toBeGreaterThan(300);
    expect(revealedGeometry.whiteSpace).toEqual(['pre', 'pre', 'pre']);

    await page.evaluate(() => {
        const view = window.__chartEditorView;
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
    });
    await expect(chart).toHaveCount(1);
    const mousePoints = await page.evaluate(() => {
        const view = window.__chartEditorView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 2, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            before: point(view.state.doc.line(1).from),
            after: point(view.state.doc.line(view.state.doc.lines).to),
        };
    });
    await page.mouse.click(mousePoints.after.x, mousePoints.after.y);
    expect(await page.evaluate(() => window.__chartEditorView.state.doc.lineAt(
        window.__chartEditorView.state.selection.main.head,
    ).text)).toBe('After');
    await page.mouse.move(mousePoints.before.x, mousePoints.before.y);
    await page.mouse.down();
    await page.mouse.move(mousePoints.after.x, mousePoints.after.y, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(() => {
        const view = window.__chartEditorView;
        return {
            from: view.state.doc.lineAt(view.state.selection.main.from).number,
            to: view.state.doc.lineAt(view.state.selection.main.to).number,
        };
    })).toEqual({ from: 1, to: 7 });

    await page.evaluate(line => {
        const view = window.__chartEditorView;
        view.dispatch({ selection: { anchor: view.state.doc.line(line - 1).from } });
        view.focus();
    }, sourceGeometry.fromLine);
    await page.keyboard.press('ArrowDown');
    const afterDown = await page.evaluate(() => {
        const view = window.__chartEditorView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    });
    expect(afterDown).toBeGreaterThanOrEqual(sourceGeometry.fromLine);
    expect(afterDown).toBeLessThanOrEqual(sourceGeometry.toLine);

    await page.evaluate(line => {
        const view = window.__chartEditorView;
        view.dispatch({ selection: { anchor: view.state.doc.line(line).from } });
        view.focus();
    }, sourceGeometry.afterLine);
    await page.keyboard.press('ArrowUp');
    const afterUp = await page.evaluate(() => {
        const view = window.__chartEditorView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    });
    expect(afterUp).toBeGreaterThanOrEqual(sourceGeometry.fromLine);
    expect(afterUp).toBeLessThanOrEqual(sourceGeometry.toLine);

    await page.evaluate(() => {
        const view = window.__chartEditorView;
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
    });
    const convertBack = page.getByRole('button', { name: 'Convert Vega-Lite chart back to Markdown table' });
    await convertBack.focus();
    await convertBack.press('Enter');
    const confirmation = page.getByRole('dialog', { name: 'Convert chart back to table?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Convert to table' }).click();
    await expect.poll(() => page.evaluate(() => window.__chartEditorView.state.doc.toString())).toBe(source);

    await page.locator('#editor-container > .cm-editor .cm-content').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() => window.__chartEditorView.state.doc.toString()))
        .toBe(authoredBeforeResize);
});
