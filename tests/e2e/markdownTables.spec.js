import { expect, test } from '@playwright/test';

const tableSource = [
    'Before',
    '',
    '| Name | Status | Total |',
    '| :--- | :---: | ---: |',
    '| Alpha | Ready | 12 |',
    '| Beta | Waiting | 3 |',
    '',
    'After',
].join('\n');

async function activeCell(page) {
    return page.evaluate(() => {
        const cell = document.activeElement?.closest?.('.tbl-cell');
        return cell ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) } : null;
    });
}

test('renders interactive Markdown tables and keeps cursor movement bounded to adjacent lines and cells', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async (source) => {
        const editor = await import('/js/editor.js');
        await editor.initEditor();
        const view = editor.createEditorView();
        editor.setEditorContent(source);
        window.__figaroTableTestView = view;
    }, tableSource);

    const widget = page.locator('.tbl-table-widget');
    await expect(widget).toBeVisible();
    await expect(widget.locator('thead .tbl-cell')).toHaveCount(3);
    await expect(widget.locator('tbody .tbl-table-row')).toHaveCount(2);
    await expect(widget.locator('tbody .tbl-cell').nth(1)).toHaveAttribute('align', 'center');
    await expect(widget.locator('tbody .tbl-cell').nth(2)).toHaveAttribute('align', 'right');

    // Arrow Down from the source line above enters the first cell; Arrow Up
    // leaves it on exactly that adjacent source line rather than skipping.
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toEqual({ row: 0, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(2);

    // The reverse transition enters the final cell and returns to the source
    // line below, exercising CodeMirror's measured block height both ways.
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(7).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toEqual({ row: 2, col: 2 });
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(7);

    // Clicking exposes the cell editor. Once active, Tab/Shift+Tab move
    // horizontally, Enter moves down, and Arrow Up returns up the column.
    await widget.locator('tbody .tbl-cell-view').first().click();
    await expect(widget.locator('tbody .tbl-cell').first().locator('.tbl-cell-editor .cm-content')).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    await page.keyboard.press('Shift+Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Enter');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
});

test('keeps aligned Markdown tables semantic and styled in PDF preview and generated PDF layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.markdownit === 'function');

    const rendered = await page.evaluate(async (source) => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        const printableHTML = pdf.renderPrintableMarkdown(source, 'Table report');
        const previewHTML = preview.buildPDFPreviewDocument(printableHTML, { notePath: 'reports/table.md' });
        const document = new DOMParser().parseFromString(previewHTML, 'text/html');
        const table = document.querySelector('.figaro-print-document table');
        return {
            previewHTML,
            rows: table.querySelectorAll('tbody tr').length,
            headerAlignments: Array.from(table.querySelectorAll('th')).map(cell => cell.style.textAlign),
            cellAlignments: Array.from(table.querySelectorAll('tbody tr:first-child td')).map(cell => cell.style.textAlign),
            previewBody: document.body.classList.contains('figaro-pdf-preview-body'),
        };
    }, tableSource);

    expect(rendered.rows).toBe(2);
    expect(rendered.headerAlignments).toEqual(['left', 'center', 'right']);
    expect(rendered.cellAlignments).toEqual(['left', 'center', 'right']);
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
