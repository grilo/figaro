import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

async function openWelcomeEditor(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.locator('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
    await expect(page.locator('#editor-container > .cm-editor')).toBeVisible();
}

test('converts semantic rich clipboard structure while preserving literal paste paths', async ({ page }) => {
    await openWelcomeEditor(page);
    const rich = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const source = 'Before selected after';
        editor.setEditorContent(source, 'Welcome.md');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== source) await new Promise(resolve => setTimeout(resolve, 10));
        view.dispatch({ selection: { anchor: 7, head: 15 } });
        view.focus();
        const transfer = new DataTransfer();
        transfer.setData('text/html', '<h2>Heading</h2><p><strong>Body</strong> with <em>detail</em>.</p>');
        transfer.setData('text/plain', 'Heading\nBody with detail.');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        view.contentDOM.dispatchEvent(event);
        window.__richPasteView = view;
        return {
            prevented: event.defaultPrevented,
            source: view.state.doc.toString(),
            cursor: view.state.selection.main.head,
        };
    });
    expect(rich).toEqual({
        prevented: true,
        source: 'Before \n\n## Heading\n\n**Body** with *detail*.\n\n after',
        cursor: 'Before \n\n## Heading\n\n**Body** with *detail*.'.length,
    });

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => window.__richPasteView.state.doc.lineAt(
        window.__richPasteView.state.selection.main.head,
    ).number)).toBe(4);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.__richPasteView.state.doc.lineAt(
        window.__richPasteView.state.selection.main.head,
    ).number)).toBe(5);

    const dragPoints = await page.evaluate(() => {
        const view = window.__richPasteView;
        const point = position => {
            const rectangle = view.coordsAtPos(position);
            return { x: rectangle.left + 3, y: (rectangle.top + rectangle.bottom) / 2 };
        };
        return {
            heading: point(view.state.doc.line(3).from + 3),
            body: point(view.state.doc.line(5).to - 2),
        };
    });
    for (const [start, end] of [
        [dragPoints.heading, dragPoints.body],
        [dragPoints.body, dragPoints.heading],
    ]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        expect(await page.evaluate(() => {
            const view = window.__richPasteView;
            const selection = view.state.selection.main;
            return {
                from: view.state.doc.lineAt(selection.from).number,
                to: view.state.doc.lineAt(selection.to).number,
            };
        })).toEqual({ from: 3, to: 5 });
    }

    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() => window.__richPasteView.state.doc.toString()))
        .toBe('Before selected after');

    const internalCopy = await page.evaluate(() => {
        const view = window.__richPasteView;
        view.dispatch({ selection: { anchor: 7, head: 15 } });
        view.focus();
        const transfer = new DataTransfer();
        const event = new ClipboardEvent('copy', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        view.contentDOM.dispatchEvent(event);
        return {
            prevented: event.defaultPrevented,
            text: transfer.getData('text/plain'),
            marker: transfer.getData('application/x-figaro-markdown'),
        };
    });
    expect(internalCopy).toEqual({ prevented: true, text: 'selected', marker: '1' });

    await page.evaluate(() => {
        const view = window.__richPasteView;
        view.dispatch({ selection: { anchor: 7, head: 15 } });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                read: async () => [{
                    types: ['text/html', 'text/plain'],
                    getType: async type => new Blob([
                        type === 'text/html' ? '<strong>Rich menu</strong>' : 'Rich menu',
                    ], { type }),
                }],
            },
        });
        const rectangle = view.coordsAtPos(7);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rectangle.left + 2,
            clientY: (rectangle.top + rectangle.bottom) / 2,
        }));
    });
    await page.locator('.editor-context-menu [data-action="paste"]').click();
    await expect.poll(() => page.evaluate(() => window.__richPasteView.state.doc.toString()))
        .toBe('Before **Rich menu** after');
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() => window.__richPasteView.state.doc.toString()))
        .toBe('Before selected after');

    const plainBypass = await page.evaluate(() => {
        const view = window.__richPasteView;
        view.dispatch({ selection: { anchor: 7, head: 15 } });
        view.focus();
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'v',
            code: 'KeyV',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        }));
        const transfer = new DataTransfer();
        transfer.setData('text/html', '<strong>Literal</strong>');
        transfer.setData('text/plain', 'Literal');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        view.contentDOM.dispatchEvent(event);
        return { prevented: event.defaultPrevented, source: view.state.doc.toString() };
    });
    expect(plainBypass).toEqual({ prevented: true, source: 'Before Literal after' });

    const protectedCode = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const source = ['Before', '```js', 'const value = 1;', '```', 'After'].join('\n');
        editor.setEditorContent(source, 'Welcome.md');
        const view = editor.getEditorView();
        while (view.state.doc.toString() !== source) await new Promise(resolve => setTimeout(resolve, 10));
        const cursor = view.state.doc.line(3).from + 'const '.length;
        view.dispatch({ selection: { anchor: cursor } });
        view.focus();
        const transfer = new DataTransfer();
        transfer.setData('text/html', '<strong>literal</strong>');
        transfer.setData('text/plain', 'literal');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        view.contentDOM.dispatchEvent(event);
        return view.state.doc.line(3).text;
    });
    expect(protectedCode).toBe('const literalvalue = 1;');

    const vimVisual = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const { Vim, getCM } = await import('@replit/codemirror-vim');
        const view = editor.getEditorView();
        editor.setEditorContent('Selected words', 'Welcome.md');
        while (view.state.doc.toString() !== 'Selected words') await new Promise(resolve => setTimeout(resolve, 10));
        await editor.toggleVim(true);
        view.dispatch({ selection: { anchor: 0 } });
        Vim.handleKey(getCM(view), 'v', 'user');
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
        const transfer = new DataTransfer();
        transfer.setData('text/html', '<strong>Rich replacement</strong>');
        transfer.setData('text/plain', 'Rich replacement');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        view.contentDOM.dispatchEvent(event);
        const result = { prevented: event.defaultPrevented, source: view.state.doc.toString() };
        await editor.toggleVim(false);
        return result;
    });
    expect(vimVisual).toEqual({ prevented: true, source: '**Rich replacement**' });

    const tableSource = '| Name | State |\n| --- | --- |\n| Alpha | Ready |';
    await page.evaluate(async source => {
        const editor = await import('/js/editor.js');
        const view = editor.getEditorView();
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: source },
            selection: { anchor: 0 },
        });
        view.focus();
        window.__richPasteView = view;
    }, tableSource);
    await expect(page.locator('.tbl-table-widget')).toBeVisible();
    await page.locator('.tbl-table-widget tbody .tbl-cell-view').first().click();
    const cellPaste = await page.evaluate(async () => {
        const { EditorView } = await import('@codemirror/view');
        const content = document.activeElement.closest('.tbl-cell-editor .cm-content');
        const nested = EditorView.findFromDOM(content);
        nested.dispatch({ selection: { anchor: 0, head: nested.state.doc.length } });
        const transfer = new DataTransfer();
        transfer.setData('text/html', '<strong>Rich Alpha</strong>');
        transfer.setData('text/plain', 'Rich Alpha');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        nested.contentDOM.dispatchEvent(event);
        return { prevented: event.defaultPrevented, cell: nested.state.doc.toString() };
    });
    expect(cellPaste).toEqual({ prevented: true, cell: '**Rich Alpha**' });
    await expect.poll(() => page.evaluate(() => window.__richPasteView.state.doc.toString()))
        .toContain('| **Rich Alpha** | Ready |');

    await page.locator('.tbl-table-widget').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.tbl-table-widget')).toBeVisible();
});
