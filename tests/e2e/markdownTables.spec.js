import { expect, test } from '@playwright/test';

const tableSource = [
    'Before',
    '',
    '| Group | Details | Literal |',
    '| :--- | :---: | ---: |',
    '| **Alpha** | first<br/>second | `<br/>` |',
    '| ^ | continued | plain |',
    '| ^ | final | plain |',
    '',
    'After',
].join('\n');

async function createMarkdownEditor(page, source) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('#editor-container > .cm-editor')).toBeVisible();
    await page.waitForFunction(async () => {
        const editor = await import('/js/editor.js');
        return editor.getEditorDocumentTabId() === 'Welcome.md';
    });
    await page.evaluate(async content => {
        const editor = await import('/js/editor.js');
        const view = editor.getEditorView();
        editor.setEditorContent(content, 'Welcome.md');
        window.__markdownTableTestView = view;
    }, source);
    await page.waitForFunction(expected => (
        window.__markdownTableTestView?.state.doc.toString() === expected
    ), source);
    await page.evaluate(() => {
        const view = window.__markdownTableTestView;
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
    });
}

test('renders GFM tables as source-preserving semantic previews', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);

    const widget = page.locator('.cm-block-widget--table');
    await expect(widget).toHaveCount(1);
    await expect(widget.locator('.cm-live-table table')).toHaveCount(1);
    await expect(widget.locator('thead th')).toHaveCount(3);
    await expect(widget.locator('tbody td strong')).toHaveText('Alpha');
    await expect(widget.locator('tbody tr:first-child td:first-child')).toHaveAttribute('rowspan', '3');
    await expect(widget.locator('tbody tr:first-child td:nth-child(2) br')).toHaveCount(1);
    await expect(widget.locator('tbody tr:first-child td:nth-child(3) code')).toHaveText('<br/>');
    await expect(widget).not.toContainText('^');
    await expect(widget.locator('.cm-editor')).toHaveCount(0);

    expect(await page.evaluate(() => window.__markdownTableTestView.state.doc.toString()))
        .toBe(tableSource);

    await page.evaluate(source => {
        const view = window.__markdownTableTestView;
        view.dispatch({ selection: { anchor: source.indexOf('Alpha') } });
        view.focus();
    }, tableSource);
    await expect(widget).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('| **Alpha** | first<br/>second | `<br/>` |');

    const sourceLine = await page.evaluate(() => {
        const view = window.__markdownTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    });
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => (
        window.__markdownTableTestView.state.doc.lineAt(
            window.__markdownTableTestView.state.selection.main.head,
        ).number
    ))).toBe(sourceLine + 1);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => (
        window.__markdownTableTestView.state.doc.lineAt(
            window.__markdownTableTestView.state.selection.main.head,
        ).number
    ))).toBe(sourceLine);

    await page.evaluate(() => {
        const view = window.__markdownTableTestView;
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
    });
    await expect(widget).toHaveCount(1);
    expect(await page.evaluate(() => window.__markdownTableTestView.state.doc.toString()))
        .toBe(tableSource);
});

test('keeps the same GFM table semantics in PDF preview and generated PDF layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.markdownit === 'function');

    const rendered = await page.evaluate(async source => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        const printableHTML = pdf.renderPrintableMarkdown(source, 'Table report');
        const previewHTML = preview.buildPDFPreviewDocument(printableHTML, { notePath: 'reports/table.md' });
        const document = new DOMParser().parseFromString(previewHTML, 'text/html');
        const table = document.querySelector('.figaro-print-document table');
        return {
            previewHTML,
            rows: table.querySelectorAll('tbody tr').length,
            rowspan: table.querySelector('tbody tr:first-child td:first-child').rowSpan,
            breaks: table.querySelectorAll('tbody tr:first-child td:nth-child(2) br').length,
            literal: table.querySelector('tbody tr:first-child td:nth-child(3) code')?.textContent,
            previewBody: document.body.classList.contains('figaro-pdf-preview-body'),
        };
    }, tableSource);

    expect(rendered.rows).toBe(3);
    expect(rendered.rowspan).toBe(3);
    expect(rendered.breaks).toBe(1);
    expect(rendered.literal).toBe('<br/>');
    expect(rendered.previewBody).toBe(true);

    await page.setContent(rendered.previewHTML, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const layout = await page.locator('.figaro-print-document table').evaluate(table => {
        const firstCell = table.querySelector('tbody td');
        const styles = getComputedStyle(firstCell);
        return {
            display: getComputedStyle(table).display,
            width: table.getBoundingClientRect().width,
            height: table.getBoundingClientRect().height,
            borderStyle: styles.borderStyle,
            borderWidth: styles.borderWidth,
        };
    });
    expect(layout.display).toBe('table');
    expect(layout.width).toBeGreaterThan(200);
    expect(layout.height).toBeGreaterThan(40);
    expect(layout.borderStyle).toBe('solid');
    expect(Number.parseFloat(layout.borderWidth)).toBeGreaterThan(0);

    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(5000);
});
