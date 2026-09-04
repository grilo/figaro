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

const compactTableSource = [
    'Before',
    '',
    '| Name | Count |',
    '| --- | ---: |',
    '| Alpha | 2 |',
    '| Beta | 10 |',
    '',
    'After',
].join('\n');

const scrollInteractionSource = [
    'Before',
    '',
    '| Key | Details |',
    '| --- | --- |',
    '| Alpha | one<br/>two<br/>three<br/>four<br/>five<br/>six<br/>seven<br/>eight<br/>nine<br/>ten |',
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

    const surfaceAppearance = await widget.locator('.cm-live-table').evaluate(element => {
        const surface = getComputedStyle(element);
        const cell = getComputedStyle(element.querySelector('td'));
        return {
            borders: [surface.borderTopWidth, surface.borderRightWidth,
                surface.borderBottomWidth, surface.borderLeftWidth],
            background: surface.backgroundColor,
            radius: surface.borderRadius,
            cellBorder: cell.borderTopWidth,
        };
    });
    expect(surfaceAppearance.borders).toEqual(['0px', '0px', '0px', '0px']);
    expect(surfaceAppearance.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(Number.parseFloat(surfaceAppearance.radius)).toBeGreaterThan(0);
    expect(Number.parseFloat(surfaceAppearance.cellBorder)).toBeGreaterThan(0);

    expect(await page.evaluate(() => window.__markdownTableTestView.state.doc.toString()))
        .toBe(tableSource);

    await widget.locator('tbody tr:first-child td:nth-child(2)').click();
    await expect(widget).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('| **Alpha** | first<br/>second | `<br/>` |');
    expect(await page.evaluate(source => window.__markdownTableTestView.state.selection.main.head === (
        source.indexOf('first<br/>second')
    ), tableSource)).toBe(true);

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

    await page.evaluate(source => {
        const view = window.__markdownTableTestView;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: source },
            selection: { anchor: 0 },
        });
    }, compactTableSource);
    await expect(widget).toHaveCount(1);
    const compactSurface = widget.locator('.cm-live-table');
    await expect.poll(() => compactSurface.evaluate(element => (
        element.scrollHeight <= element.clientHeight + 1
    ))).toBe(true);
    const compactType = await compactSurface.evaluate(element => ({
        previewFont: Number.parseFloat(getComputedStyle(element).fontSize),
        editorFont: Number.parseFloat(getComputedStyle(document.querySelector('.cm-content')).fontSize),
        cellPaddingTop: getComputedStyle(element.querySelector('td')).paddingTop,
    }));
    expect(compactType.previewFont).toBeLessThan(compactType.editorFont);
    expect(compactType.cellPaddingTop).toBe('3px');

    // Scrollbars are a real browser boundary: wheel and track presses must be
    // owned by the preview instead of moving CodeMirror's source selection.
    await page.evaluate(source => {
        const view = window.__markdownTableTestView;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: source },
            selection: { anchor: 0 },
        });
        view.focus();
    }, scrollInteractionSource);
    await expect(widget).toHaveCount(1);

    const surface = widget.locator('.cm-live-table');
    const dimensions = await surface.evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight + 20);

    const surfaceBox = await surface.boundingBox();
    const scrollbarX = surfaceBox.x + surfaceBox.width - 3;
    await page.mouse.click(scrollbarX, surfaceBox.y + surfaceBox.height * 0.75);
    // Chromium's synthetic track click does not consistently page the native
    // overlay scrollbar, but it must never reveal the source or move the caret.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(widget).toHaveCount(1);
    expect(await page.evaluate(() => window.__markdownTableTestView.state.selection.main.head)).toBe(0);

    await surface.evaluate(element => { element.scrollTop = 0; });
    await surface.locator('tbody td').last().hover({ position: { x: 4, y: 4 } });
    await page.mouse.wheel(0, 80);
    await expect.poll(() => surface.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(widget).toHaveCount(1);
    expect(await page.evaluate(() => window.__markdownTableTestView.state.selection.main.head)).toBe(0);

    await surface.locator('thead th').first().click();
    await expect(widget).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('| Alpha | one<br/>two');
});

test('edits a table transactionally without turning an ordinary cell click into a range', async ({ page }) => {
    await createMarkdownEditor(page, compactTableSource);
    const original = compactTableSource;
    await page.locator('.cm-live-table').hover();
    await page.locator('.markdown-table-editor-guide').click();

    const modal = page.locator('.markdown-table-editor-modal');
    await expect(modal).toBeVisible();
    const toolbarRows = modal.locator('.markdown-table-editor-toolbar-row');
    await expect(toolbarRows).toHaveCount(2);
    await expect(modal.locator('.markdown-table-editor-undo svg')).toHaveCount(1);
    await expect(modal.locator('.markdown-table-editor-danger-group .ui-button--danger-ghost')).toHaveCount(2);
    const toolbarGeometry = await toolbarRows.evaluateAll(rows => rows.map(row => row.getBoundingClientRect().top));
    expect(toolbarGeometry[1]).toBeGreaterThan(toolbarGeometry[0]);
    const editorChrome = await modal.evaluate(root => {
        const style = selector => getComputedStyle(root.querySelector(selector));
        const cell = style('.markdown-table-editor-grid td');
        return {
            modalBorder: getComputedStyle(root).borderTopWidth,
            gridPaneBorder: style('.markdown-table-editor-grid-pane').borderTopWidth,
            toolbarDivider: style('.markdown-table-editor-toolbar-row--structure').borderTopWidth,
            groupDivider: style('.markdown-table-editor-command-group').borderLeftWidth,
            rowsColumnsDivider: style('.markdown-table-editor-columns-group').borderLeftWidth,
            ordinaryButtonBorder: style('.markdown-table-editor-undo').borderTopWidth,
            cellGrid: [cell.borderRightWidth, cell.borderBottomWidth],
            outlinedToolbar: Array.from(root.querySelectorAll(
                '.markdown-table-editor-toolbar .ui-button:not(.ui-button--danger-ghost)',
            )).every(button => !button.classList.contains('ui-button--quiet')),
        };
    });
    expect(editorChrome).toEqual({
        modalBorder: '0px',
        gridPaneBorder: '0px',
        toolbarDivider: '0px',
        groupDivider: '0px',
        rowsColumnsDivider: '1px',
        ordinaryButtonBorder: '1px',
        cellGrid: ['1px', '1px'],
        outlinedToolbar: true,
    });
    const firstBodyCell = modal.locator('[aria-label="Cell A2"]');
    await firstBodyCell.click({ position: { x: 34, y: 12 } });
    await expect(modal.locator('.markdown-table-editor-status')).toHaveText('Editing A2');
    expect(await firstBodyCell.evaluate(cell => cell.selectionStart)).toBeGreaterThan(0);
    await expect(modal.locator('.markdown-table-editor-merge')).toBeDisabled();

    await page.keyboard.down('Shift');
    await firstBodyCell.hover();
    await page.mouse.down();
    await modal.locator('[aria-label="Cell B2"]').hover();
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(modal.locator('.markdown-table-editor-status')).toHaveText('2 cells selected');
    await expect(modal.locator('.markdown-table-editor-merge')).toBeEnabled();
    await modal.locator('.markdown-table-editor-merge').click();
    await expect(modal.locator('.markdown-table-editor-split')).toBeEnabled();
    await modal.locator('.markdown-table-editor-source-toggle').click();
    const markdown = modal.locator('.markdown-table-editor-source');
    await expect(markdown).toHaveJSProperty('readOnly', true);
    await expect(markdown).toHaveValue(/figaro:table-merge A2:B2/);
    expect(await modal.locator('.markdown-table-editor-source-pane').evaluate(pane => ({
        paneBorder: getComputedStyle(pane).borderTopWidth,
        headingBorder: getComputedStyle(pane.querySelector('h4')).borderBottomWidth,
    }))).toEqual({ paneBorder: '0px', headingBorder: '0px' });
    await modal.locator('.markdown-table-editor-split').click();

    await modal.locator('[aria-label="Cell A2"]').fill('Changed');
    await modal.locator('.markdown-table-editor-apply').click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__markdownTableTestView.state.doc.toString()))
        .toContain('| Changed | 2 |');

    expect(await page.evaluate(async () => {
        const { undo } = await import('/vendored/codemirror/commands/index.js');
        return undo(window.__markdownTableTestView);
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__markdownTableTestView.state.doc.toString()))
        .toBe(original);

    await page.evaluate(() => {
        const view = window.__markdownTableTestView;
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
    });
    await page.locator('.cm-live-table').hover();
    await page.locator('.markdown-table-editor-guide').click();
    const reopened = page.locator('.markdown-table-editor-modal');
    const headerColor = await reopened.locator('th').first().evaluate(cell => getComputedStyle(cell).backgroundColor);
    const bodyColor = await reopened.locator('td').first().evaluate(cell => getComputedStyle(cell).backgroundColor);
    expect(headerColor).not.toBe(bodyColor);
    await reopened.locator('.markdown-table-editor-cancel').click();
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
