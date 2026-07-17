import { expect, test } from '@playwright/test';

test('keeps conventional alias widgets navigable, selectable, and cursor-safe', async ({ page }) => {
    await page.goto('/');
	await page.waitForFunction(() => window._appReady === true);

    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
		const tabs = await import('/js/tabManager.js');
        await editor.initEditor();
        const view = editor.getEditorView() || editor.createEditorView();
        await editor.configureEditorForFile('notes/current.md');
		const source = 'Above\n\nSee [[notes/Welcome.md|Welcome]] now\n\nBelow';
		window.pywebview.api.read_file = async path => ({ content: source, path, mtime: 1 });
		tabs.openTab('current', 'Current', 'file', { path: 'notes/current.md', mtime: 1 });
		while (editor.getEditorDocumentTabId() !== 'current' || view.state.doc.toString() !== source) {
			await new Promise(resolve => setTimeout(resolve, 10));
		}
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
        window.__wikilinkView = view;
    });
    const widget = page.locator('.cm-wikilink-widget');
    await expect(widget).toBeVisible();
    await expect(widget).toHaveText('Welcome');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => {
        const view = window.__wikilinkView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(3);
    await page.evaluate(() => {
        const view = window.__wikilinkView;
        view.dispatch({ selection: { anchor: view.state.doc.line(5).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => {
        const view = window.__wikilinkView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(3);

    // Drag across the replaced inline source in both directions.
    await page.evaluate(() => {
        const view = window.__wikilinkView;
        view.dispatch({ selection: { anchor: 0 } });
    });
    const points = await page.evaluate(() => {
        const view = window.__wikilinkView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 2, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            above: point(view.state.doc.line(1).from),
            below: point(view.state.doc.line(5).to),
            linkFrom: view.state.doc.line(3).from + 4,
            linkTo: view.state.doc.line(3).to - 4,
        };
    });
    for (const [start, end] of [[points.above, points.below], [points.below, points.above]]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        const selection = await page.evaluate(() => {
            const range = window.__wikilinkView.state.selection.main;
            return { from: range.from, to: range.to };
        });
        expect(selection.from).toBeLessThanOrEqual(points.linkFrom);
        expect(selection.to).toBeGreaterThanOrEqual(points.linkTo);
    }

    await page.evaluate(() => {
        const view = window.__wikilinkView;
        view.dispatch({ selection: { anchor: 0 } });
        window.__wikilinkReadTargets = [];
        window.pywebview.api.read_file = async path => {
            window.__wikilinkReadTargets.push(path);
            return { content: '# Welcome', path, mtime: 1 };
        };
    });
    await expect(widget).toBeVisible();
    await widget.click();
    await expect.poll(() => page.evaluate(() => window.__wikilinkReadTargets[0])).toBe('notes/Welcome.md');
});

test('renders conventional wikilinks in the live PDF preview and generated browser PDF', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.markdownit === 'function');

    const previewHTML = await page.evaluate(async () => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        const printable = pdf.renderPrintableMarkdown(
            'See [[docs/Guide Note.md#start|Readable guide]] and `[[literal.md|code]]`.',
            'Wikilinks'
        );
        return preview.buildPDFPreviewDocument(printable, { notePath: 'notes/current.md' });
    });
    await page.setContent(previewHTML, { waitUntil: 'load' });

    const link = page.locator('a.figaro-wikilink');
    await expect(link).toHaveText('Readable guide');
    await expect(link).toHaveAttribute('href', '/vault/docs/Guide%20Note.md#start');
    await expect(page.locator('code')).toHaveText('[[literal.md|code]]');

    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(4000);
    expect(pdf.toString('latin1')).toContain('/URI');
});
