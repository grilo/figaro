import { expect, test } from '@playwright/test';

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
}

test('edits strict hex colors without stealing intentional hashtags or breaking editor geometry', async ({ page }) => {
    await openWelcomeEditor(page);
    const source = [
        'Above',
        'Palette #000000 and #bad',
        '#urgent and translucent #1234',
        'Below',
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
        window.__hexColorView = view;
    }, source);

    const widgets = page.locator('.cm-hex-color-widget');
    const pickers = page.locator('.cm-hex-color-picker');
    await expect(widgets).toHaveCount(3);
    await expect(pickers).toHaveCount(3);
    await expect(page.locator('.cm-hashtag')).toHaveCount(1);
    await expect(page.locator('.cm-hashtag')).toHaveAttribute('data-tag', 'urgent');

    const themed = await widgets.first().evaluate(element => {
        const style = getComputedStyle(element);
        return {
            background: style.backgroundColor,
            border: style.borderStyle,
            radius: Number.parseFloat(style.borderRadius),
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
        };
    });
    expect(themed.background).toBe('rgb(0, 0, 0)');
    expect(themed.border).toBe('solid');
    expect(themed.radius).toBeGreaterThanOrEqual(3);
    expect(themed.width).toBe(14);
    expect(themed.height).toBe(14);

    // Escape/cancel leaves the source untouched; a change event edits exactly one token.
    await pickers.first().focus();
    await expect(pickers.first()).toBeFocused();
    expect(await widgets.first().evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__hexColorView.state.doc.toString())).toBe(source);
    await pickers.nth(2).evaluate(input => {
        input.value = '#506070';
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const changed = source.replace('#1234', '#50607044');
    expect(await page.evaluate(() => window.__hexColorView.state.doc.toString())).toBe(changed);

    const content = page.locator('.cm-content');
    for (const { line, key, expected } of [
        { line: 1, key: 'ArrowDown', expected: 2 },
        { line: 2, key: 'ArrowDown', expected: 3 },
        { line: 4, key: 'ArrowUp', expected: 3 },
        { line: 3, key: 'ArrowUp', expected: 2 },
    ]) {
        await page.evaluate(currentLine => {
            const view = window.__hexColorView;
            view.dispatch({ selection: { anchor: view.state.doc.line(currentLine).from } });
            view.focus();
        }, line);
        await content.press(key);
        expect(await page.evaluate(() => {
            const view = window.__hexColorView;
            return view.state.doc.lineAt(view.state.selection.main.head).number;
        })).toBe(expected);
    }

    // Place the caret around the inline widget, then drag across it in both directions.
    const points = await page.evaluate(() => {
        const view = window.__hexColorView;
        const line = view.state.doc.line(2);
        const colorFrom = line.from + line.text.indexOf('#000000');
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 1, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            beforeColor: point(colorFrom),
            afterColor: point(colorFrom + '#000000'.length),
            above: point(view.state.doc.line(1).from),
            below: point(view.state.doc.line(4).to),
            colorFrom,
            colorTo: colorFrom + '#000000'.length,
        };
    });
    for (const point of [points.beforeColor, points.afterColor]) {
        await page.mouse.click(point.x, point.y);
        expect(await page.evaluate(() => window.__hexColorView.state.doc.lineAt(
            window.__hexColorView.state.selection.main.head,
        ).number)).toBe(2);
    }
    for (const [start, end] of [[points.above, points.below], [points.below, points.above]]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        const selection = await page.evaluate(() => {
            const range = window.__hexColorView.state.selection.main;
            return { from: range.from, to: range.to };
        });
        expect(selection.from).toBeLessThanOrEqual(points.colorFrom);
        expect(selection.to).toBeGreaterThanOrEqual(points.colorTo);
    }

    const previewHTML = await page.evaluate(async markdown => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        return preview.buildPDFPreviewDocument(pdf.renderPrintableMarkdown(markdown, 'Colors'), {
            notePath: 'Welcome.md',
        });
    }, changed);
    await page.setContent(previewHTML, { waitUntil: 'load' });
    await expect(page.locator('.figaro-print-document')).toContainText('#000000');
    await expect(page.locator('.figaro-print-document')).toContainText('#50607044');
    await expect(page.locator('input[type="color"]')).toHaveCount(0);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(4000);
});
